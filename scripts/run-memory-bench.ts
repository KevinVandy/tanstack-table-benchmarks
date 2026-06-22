import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type CDPSession, type Page } from "playwright";

declare global {
  interface Window {
    __TABLE_BENCH_READY__: boolean;
  }
}

type BenchmarkKind =
  | "all"
  | "rows"
  | "columns"
  | "paginated-rows"
  | "kitchen-sink";

interface CliOptions {
  benchmark: BenchmarkKind;
  caseTimeoutMs: number;
  heapSnapshots: boolean;
  iterations: number;
  maxSmoothScrollCells: number;
  maxSnapshotCells: number;
  overscan: number;
  port: number;
  smoothScrollSteps: number;
}

interface BenchmarkConfig {
  columns: number;
  kind: Exclude<BenchmarkKind, "all">;
  name: string;
  rows: number;
}

interface Example {
  kind: Exclude<BenchmarkKind, "all">;
  name: string;
  path: string;
  version: "v8" | "v9";
}

interface Measurement {
  afterGcJsHeapTotal: number;
  afterGcJsHeapUsed: number;
  afterGcJsHeapUsedMb: number;
  beforeGcJsHeapTotal: number;
  beforeGcJsHeapUsed: number;
  beforeGcJsHeapUsedMb: number;
  documents: number;
  gcReclaimedMb: number;
  jsEventListeners: number;
  label: string;
  nodes: number;
  phase: string;
  renderedCells: number;
  renderedRows: number;
  timestamp: string;
}

interface Result extends Measurement {
  benchmark: string;
  columns: number;
  configName: string;
  example: string;
  iteration: number;
  rows: number;
  url: string;
  version: "v8" | "v9";
}

interface SnapshotObjectSummary {
  averageSelfSizeMb: number;
  count: number;
  name: string;
  scoreMb: number;
  selfSizeMb: number;
  type: string;
}

interface SnapshotReport {
  benchmark: string;
  columns: number;
  configName: string;
  example: string;
  file: string;
  phase: string;
  rows: number;
  topObjects: SnapshotObjectSummary[];
  totalSelfSizeMb: number;
  version: "v8" | "v9";
}

interface BenchmarkError {
  benchmark: string;
  columns: number;
  configName: string;
  error: string;
  example: string;
  iteration: number;
  rows: number;
  timestamp: string;
  url: string;
  version: "v8" | "v9";
}

type CollectedMeasurement = Omit<
  Result,
  | "benchmark"
  | "columns"
  | "configName"
  | "example"
  | "iteration"
  | "rows"
  | "url"
  | "version"
>;

const examples: Example[] = [
  {
    kind: "rows",
    name: "v8/virtualized-rows",
    path: "examples/v8/virtualized-rows",
    version: "v8",
  },
  {
    kind: "rows",
    name: "v9/virtualized-rows",
    path: "examples/v9/virtualized-rows",
    version: "v9",
  },
  {
    kind: "columns",
    name: "v8/virtualized-columns",
    path: "examples/v8/virtualized-columns",
    version: "v8",
  },
  {
    kind: "columns",
    name: "v9/virtualized-columns",
    path: "examples/v9/virtualized-columns",
    version: "v9",
  },
  {
    kind: "paginated-rows",
    name: "v8/paginated-rows",
    path: "examples/v8/paginated-rows",
    version: "v8",
  },
  {
    kind: "paginated-rows",
    name: "v9/paginated-rows",
    path: "examples/v9/paginated-rows",
    version: "v9",
  },
  {
    kind: "kitchen-sink",
    name: "v8/kitchen-sink",
    path: "examples/v8/kitchen-sink",
    version: "v8",
  },
  {
    kind: "kitchen-sink",
    name: "v9/kitchen-sink",
    path: "examples/v9/kitchen-sink",
    version: "v9",
  },
];

const benchmarkConfigs: BenchmarkConfig[] = [
  { columns: 8, kind: "rows", name: "rows-10x8", rows: 10 },
  { columns: 8, kind: "rows", name: "rows-1000x8", rows: 1_000 },
  { columns: 8, kind: "rows", name: "rows-100000x8", rows: 100_000 },
  { columns: 8, kind: "rows", name: "rows-1000000x8", rows: 1_000_000 },
  { columns: 8, kind: "paginated-rows", name: "paginated-rows-10x8", rows: 10 },
  {
    columns: 8,
    kind: "paginated-rows",
    name: "paginated-rows-1000x8",
    rows: 1_000,
  },
  {
    columns: 8,
    kind: "paginated-rows",
    name: "paginated-rows-100000x8",
    rows: 100_000,
  },
  {
    columns: 8,
    kind: "paginated-rows",
    name: "paginated-rows-1000000x8",
    rows: 1_000_000,
  },
  { columns: 8, kind: "kitchen-sink", name: "kitchen-sink-10x8", rows: 10 },
  {
    columns: 8,
    kind: "kitchen-sink",
    name: "kitchen-sink-1000x8",
    rows: 1_000,
  },
  {
    columns: 8,
    kind: "kitchen-sink",
    name: "kitchen-sink-100000x8",
    rows: 100_000,
  },
  {
    columns: 8,
    kind: "kitchen-sink",
    name: "kitchen-sink-1000000x8",
    rows: 1_000_000,
  },
  { columns: 10, kind: "columns", name: "columns-10x10", rows: 10 },
  { columns: 100, kind: "columns", name: "columns-100x100", rows: 100 },
  { columns: 1_000, kind: "columns", name: "columns-100x1000", rows: 100 },
  { columns: 10_000, kind: "columns", name: "columns-100x10000", rows: 100 },
];

const readNumberFlag = (name: keyof CliOptions, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const readBooleanFlag = (name: keyof CliOptions, fallback: boolean) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (value === "false" || value === "0" || value === "no") {
    return false;
  }
  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }
  return true;
};

const readBenchmarkFlag = (): BenchmarkKind => {
  const index = process.argv.indexOf("--benchmark");
  const value = index === -1 ? "all" : process.argv[index + 1];
  return value === "rows" ||
    value === "columns" ||
    value === "paginated-rows" ||
    value === "kitchen-sink" ||
    value === "all"
    ? value
    : "all";
};

const options: CliOptions = {
  benchmark: readBenchmarkFlag(),
  caseTimeoutMs: readNumberFlag("caseTimeoutMs", 120_000),
  heapSnapshots: readBooleanFlag("heapSnapshots", false),
  iterations: readNumberFlag("iterations", 5),
  maxSmoothScrollCells: readNumberFlag("maxSmoothScrollCells", 1_000_000),
  maxSnapshotCells: readNumberFlag("maxSnapshotCells", 10_000),
  overscan: readNumberFlag("overscan", 5),
  port: readNumberFlag("port", 41_730),
  smoothScrollSteps: readNumberFlag("smoothScrollSteps", 40),
};

const run = (command: string, args: string[], cwd = process.cwd()) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
};

const waitForServer = async (url: string) => {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(250);
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const getMetric = (
  metrics: Array<{ name: string; value: number }>,
  name: string,
) => {
  const metric = metrics.find((item) => item.name === name);
  if (!metric) {
    throw new Error(`Missing performance metric: ${name}`);
  }
  return metric.value;
};

const toMb = (bytes: number) => Number((bytes / 1024 / 1024).toFixed(2));

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const sanitizeFilePart = (value: string) =>
  value.replaceAll("/", "-").replaceAll(":", "-").replaceAll(" ", "-");

const collect = async ({
  browser,
  captureSnapshots,
  interaction,
  label,
  snapshotBaseName,
  snapshotDir,
  url,
  runSmoothScroll,
}: {
  browser: Browser;
  captureSnapshots: boolean;
  interaction: "pagination" | "scroll";
  label: string;
  runSmoothScroll: boolean;
  snapshotBaseName: string;
  snapshotDir: string;
  url: string;
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send("Performance.enable");
  await client.send("HeapProfiler.enable");
  await page.goto(url);
  await page.waitForFunction(() => window.__TABLE_BENCH_READY__ === true, {
    timeout: 60_000,
  });
  await page.waitForTimeout(100);

  const measurements: CollectedMeasurement[] = [];
  const snapshots: SnapshotReport[] = [];

  const measure = async (
    phase: string,
    snapshotPhase?: "beginning" | "end",
  ) => {
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));

    const beforeGcMetrics = await client.send("Performance.getMetrics");
    const beforeGcJsHeapUsed = getMetric(
      beforeGcMetrics.metrics,
      "JSHeapUsedSize",
    );
    const beforeGcJsHeapTotal = getMetric(
      beforeGcMetrics.metrics,
      "JSHeapTotalSize",
    );

    await client.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(100);

    const [{ metrics }, domCounters, rendered] = await Promise.all([
      client.send("Performance.getMetrics"),
      client.send("Memory.getDOMCounters"),
      page.evaluate(() => ({
        renderedCells: document.querySelectorAll("tbody td").length,
        renderedRows: document.querySelectorAll("tbody tr").length,
      })),
    ]);
    const afterGcJsHeapUsed = getMetric(metrics, "JSHeapUsedSize");
    const afterGcJsHeapTotal = getMetric(metrics, "JSHeapTotalSize");

    measurements.push({
      afterGcJsHeapTotal,
      afterGcJsHeapUsed,
      afterGcJsHeapUsedMb: toMb(afterGcJsHeapUsed),
      beforeGcJsHeapTotal,
      beforeGcJsHeapUsed,
      beforeGcJsHeapUsedMb: toMb(beforeGcJsHeapUsed),
      documents: domCounters.documents,
      gcReclaimedMb: toMb(beforeGcJsHeapUsed - afterGcJsHeapUsed),
      jsEventListeners: domCounters.jsEventListeners,
      label,
      nodes: domCounters.nodes,
      phase,
      renderedCells: rendered.renderedCells,
      renderedRows: rendered.renderedRows,
      timestamp: new Date().toISOString(),
    });

    if (captureSnapshots && snapshotPhase) {
      const snapshotFile = join(
        snapshotDir,
        `${snapshotBaseName}-${snapshotPhase}.heapsnapshot`,
      );
      await takeHeapSnapshot(client, snapshotFile);
      snapshots.push(analyzeHeapSnapshot(snapshotFile));
    }
  };

  await measure("initial", "beginning");

  if (interaction === "pagination") {
    await clickPaginationButton(page, "next-page");
    await measure("next-page");

    await clickPaginationButton(page, "last-page");
    await measure("last-page", "end");
  } else {
    await scroll(page, 0.5, 0.5);
    await measure("instant-middle-scroll");

    await scroll(page, 1, 1);
    await measure("instant-end-scroll");

    if (runSmoothScroll) {
      await scroll(page, 0, 0);
      await smoothScroll(page, 0.5, 0.5, options.smoothScrollSteps);
      await measure("smooth-middle-scroll");

      await smoothScroll(page, 1, 1, options.smoothScrollSteps);
      await measure("smooth-end-scroll", "end");
    } else {
      await measure("smooth-scroll-skipped", "end");
    }
  }

  await context.close();
  return { measurements, snapshots };
};

const clickPaginationButton = async (page: Page, testId: string) => {
  const button = page.getByTestId(testId);
  const isDisabled = await button.evaluate(
    (element) => element instanceof HTMLButtonElement && element.disabled,
  );

  if (!isDisabled) {
    await button.click();
  }

  await page.waitForTimeout(250);
};

const scroll = async (page: Page, xRatio: number, yRatio: number) => {
  await page.locator('[data-testid="scroll-container"]').evaluate(
    (element, ratios) => {
      element.scrollTop =
        (element.scrollHeight - element.clientHeight) * ratios.yRatio;
      element.scrollLeft =
        (element.scrollWidth - element.clientWidth) * ratios.xRatio;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    },
    { xRatio, yRatio },
  );
  await page.waitForTimeout(250);
};

const smoothScroll = async (
  page: Page,
  xRatio: number,
  yRatio: number,
  steps: number,
) => {
  const locator = page.locator('[data-testid="scroll-container"]');
  const scrollState = await locator.evaluate(
    (element, ratios) => ({
      startLeft: element.scrollLeft,
      startTop: element.scrollTop,
      targetLeft: (element.scrollWidth - element.clientWidth) * ratios.xRatio,
      targetTop: (element.scrollHeight - element.clientHeight) * ratios.yRatio,
    }),
    { xRatio, yRatio },
  );

  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    await locator.evaluate(
      (element, state) => {
        element.scrollTop =
          state.startTop + (state.targetTop - state.startTop) * state.progress;
        element.scrollLeft =
          state.startLeft +
          (state.targetLeft - state.startLeft) * state.progress;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      },
      { ...scrollState, progress },
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }

  await page.waitForTimeout(250);
};

const takeHeapSnapshot = async (client: CDPSession, file: string) => {
  const stream = createWriteStream(file, { encoding: "utf8" });
  const onChunk = ({ chunk }: { chunk: string }) => {
    stream.write(chunk);
  };

  client.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await client.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
    });
  } finally {
    client.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
};

const analyzeHeapSnapshot = (file: string): SnapshotReport => {
  const fileSize = statSync(file).size;
  const maxAnalyzableBytes = 400 * 1024 * 1024;

  if (fileSize > maxAnalyzableBytes) {
    return {
      benchmark: "",
      columns: 0,
      configName: "",
      example: "",
      file,
      phase: "",
      rows: 0,
      topObjects: [
        {
          averageSelfSizeMb: toMb(fileSize),
          count: 1,
          name: `Snapshot is ${toMb(fileSize)} on disk; skip in-process JSON analysis`,
          scoreMb: toMb(fileSize),
          selfSizeMb: toMb(fileSize),
          type: "snapshot-file",
        },
      ],
      totalSelfSizeMb: toMb(fileSize),
      version: "v8",
    };
  }

  const snapshot = JSON.parse(readFileSync(file, "utf8")) as {
    nodes: number[];
    snapshot: {
      meta: {
        node_fields: string[];
        node_types: string[][];
      };
    };
    strings: string[];
  };
  const fields = snapshot.snapshot.meta.node_fields;
  const nodeFieldCount = fields.length;
  const typeIndex = fields.indexOf("type");
  const nameIndex = fields.indexOf("name");
  const selfSizeIndex = fields.indexOf("self_size");
  const nodeTypes = snapshot.snapshot.meta.node_types[0];
  const totals = new Map<string, SnapshotObjectSummary>();
  let totalSelfSize = 0;

  for (let index = 0; index < snapshot.nodes.length; index += nodeFieldCount) {
    const type = nodeTypes[snapshot.nodes[index + typeIndex]] ?? "unknown";
    const name = snapshot.strings[snapshot.nodes[index + nameIndex]] ?? "";
    const selfSize = snapshot.nodes[index + selfSizeIndex] ?? 0;
    const key = `${type}:${name}`;
    const current = totals.get(key) ?? {
      averageSelfSizeMb: 0,
      count: 0,
      name,
      scoreMb: 0,
      selfSizeMb: 0,
      type,
    };

    current.count += 1;
    current.selfSizeMb += selfSize / 1024 / 1024;
    totalSelfSize += selfSize;
    totals.set(key, current);
  }

  return {
    benchmark: "",
    columns: 0,
    configName: "",
    example: "",
    file,
    phase: "",
    rows: 0,
    topObjects: [...totals.values()]
      .map((item) => ({
        ...item,
        averageSelfSizeMb: Number(
          (item.selfSizeMb / Math.max(item.count, 1)).toFixed(6),
        ),
        scoreMb: Number(item.selfSizeMb.toFixed(2)),
        selfSizeMb: Number(item.selfSizeMb.toFixed(2)),
      }))
      .sort((a, b) => b.scoreMb - a.scoreMb)
      .slice(0, 10),
    totalSelfSizeMb: toMb(totalSelfSize),
    version: "v8",
  };
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const summarize = (results: Result[]) => {
  const groups = new Map<string, Result[]>();

  for (const result of results) {
    const key = `${result.configName}:${result.example}:${result.phase}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const afterGc = group.map((item) => item.afterGcJsHeapUsedMb);
    const beforeGc = group.map((item) => item.beforeGcJsHeapUsedMb);
    const reclaimed = group.map((item) => item.gcReclaimedMb);
    const first = group[0];

    return {
      afterGcMaxMb: Math.max(...afterGc),
      afterGcMedianMb: median(afterGc),
      afterGcMinMb: Math.min(...afterGc),
      beforeGcMedianMb: median(beforeGc),
      benchmark: first.benchmark,
      columns: first.columns,
      configName: first.configName,
      gcReclaimedMedianMb: median(reclaimed),
      key,
      label: first.label,
      listenersMedian: median(group.map((item) => item.jsEventListeners)),
      nodesMedian: median(group.map((item) => item.nodes)),
      phase: first.phase,
      renderedCellsMedian: median(group.map((item) => item.renderedCells)),
      renderedRowsMedian: median(group.map((item) => item.renderedRows)),
      rows: first.rows,
      samples: group.length,
      version: first.version,
    };
  });
};

type Summary = ReturnType<typeof summarize>;

const compareV9ToV8 = (summary: Summary) => {
  const rows = [];
  const round = (value: number, places: number) =>
    Number(value.toFixed(places));
  const configs = new Set(summary.map((item) => item.configName));
  const phases = new Set(summary.map((item) => item.phase));

  for (const configName of configs) {
    for (const phase of phases) {
      const v8 = summary.find(
        (item) =>
          item.configName === configName &&
          item.version === "v8" &&
          item.phase === phase,
      );
      const v9 = summary.find(
        (item) =>
          item.configName === configName &&
          item.version === "v9" &&
          item.phase === phase,
      );

      if (!v8 || !v9) {
        continue;
      }

      const memoryLessMb = v8.afterGcMedianMb - v9.afterGcMedianMb;
      const memoryLessPercent = (memoryLessMb / v8.afterGcMedianMb) * 100;

      rows.push({
        benchmark: v8.benchmark,
        columns: v8.columns,
        configName,
        memoryLessMb: round(memoryLessMb, 2),
        memoryLessPercent: round(memoryLessPercent, 1),
        phase,
        renderedCellsMatch: v8.renderedCellsMedian === v9.renderedCellsMedian,
        renderedRowsMatch: v8.renderedRowsMedian === v9.renderedRowsMedian,
        rows: v8.rows,
        samples: Math.min(v8.samples, v9.samples),
        v8MedianMb: v8.afterGcMedianMb,
        v9MedianMb: v9.afterGcMedianMb,
      });
    }
  }

  return rows;
};

const toCsv = (results: Result[]) => {
  const headers = [
    "timestamp",
    "benchmark",
    "configName",
    "example",
    "version",
    "iteration",
    "rows",
    "columns",
    "phase",
    "label",
    "beforeGcJsHeapUsedMb",
    "afterGcJsHeapUsedMb",
    "gcReclaimedMb",
    "renderedRows",
    "renderedCells",
    "nodes",
    "documents",
    "jsEventListeners",
    "url",
  ];

  return [
    headers.join(","),
    ...results.map((result) =>
      headers
        .map((header) => JSON.stringify(result[header as keyof Result] ?? ""))
        .join(","),
    ),
  ].join("\n");
};

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatMb = (value: number) => `${value.toFixed(2)} MB`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatCompactNumber = (value: number) => {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M`;
  }
  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(1))}K`;
  }
  return String(value);
};

const benchmarkDisplayNames: Record<string, string> = {
  columns: "virtualized columns",
  "kitchen-sink": "kitchen sink",
  "paginated-rows": "paginated rows",
  rows: "virtualized rows",
};

const formatBenchmarkName = (benchmark: string) =>
  benchmarkDisplayNames[benchmark] ?? benchmark;

const getFinalPhase = (benchmark: string) =>
  benchmark === "rows"
    ? ["smooth-end-scroll", "smooth-scroll-skipped"]
    : benchmark === "columns"
      ? ["smooth-end-scroll"]
      : ["last-page"];

const getLinearChartStep = (maxValue: number) => {
  if (maxValue <= 10) return 1;
  if (maxValue <= 50) return 10;
  if (maxValue <= 100) return 20;
  if (maxValue <= 500) return 100;
  return 500;
};

const toVersionMemoryCharts = ({
  phaseLabel,
  phaseSelector,
  summary,
  title,
}: {
  phaseLabel: string;
  phaseSelector: (row: Summary[number]) => boolean;
  summary: Summary;
  title: string;
}) => {
  const chartRows = summary
    .filter(phaseSelector)
    .map((row) => ({
      benchmark: row.benchmark,
      cells: row.rows * row.columns,
      memoryMb: row.afterGcMedianMb,
      version: row.version,
    }))
    .filter((row) => row.cells > 0 && row.memoryMb > 0);

  if (!chartRows.length) {
    return "";
  }

  const benchmarks = [...new Set(chartRows.map((row) => row.benchmark))].sort();
  const width = 720;
  const height = 390;
  const margin = { bottom: 70, left: 72, right: 24, top: 24 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const versionColors = {
    v8: "#dc2626",
    v9: "#2563eb",
  };

  const charts = benchmarks
    .map((benchmark) => {
      const rows = chartRows.filter((row) => row.benchmark === benchmark);
      const cellValues = [...new Set(rows.map((row) => row.cells))].sort(
        (a, b) => a - b,
      );
      const maxMemory = Math.max(...rows.map((row) => row.memoryMb));
      const step = getLinearChartStep(maxMemory);
      const maxY = Math.ceil(maxMemory / step) * step;
      const yTicks = Array.from(
        { length: Math.floor(maxY / step) + 1 },
        (_, index) => index * step,
      );
      const scaleX = (cells: number) => {
        const index = cellValues.indexOf(cells);
        return (
          margin.left +
          (cellValues.length === 1 ? 0.5 : index / (cellValues.length - 1)) *
            plotWidth
        );
      };
      const scaleY = (memoryMb: number) =>
        margin.top + ((maxY - memoryMb) / (maxY || 1)) * plotHeight;
      const series = (["v8", "v9"] as const).map((version) => ({
        version,
        points: rows
          .filter((row) => row.version === version)
          .sort((a, b) => a.cells - b.cells),
      }));

      return `<section class="chart-card">
        <h3>${escapeHtml(formatBenchmarkName(benchmark))}</h3>
        <svg class="memory-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${formatBenchmarkName(benchmark)} ${phaseLabel} memory usage`)}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
          ${cellValues
            .map(
              (cells) => `<g>
            <line class="grid-line" x1="${scaleX(cells).toFixed(1)}" y1="${margin.top}" x2="${scaleX(cells).toFixed(1)}" y2="${height - margin.bottom}" />
            <text class="axis-label" x="${scaleX(cells).toFixed(1)}" y="${height - margin.bottom + 24}" text-anchor="middle">${formatCompactNumber(cells)}</text>
          </g>`,
            )
            .join("\n")}
          ${yTicks
            .map(
              (tick) => `<g>
            <line class="grid-line" x1="${margin.left}" y1="${scaleY(tick).toFixed(1)}" x2="${width - margin.right}" y2="${scaleY(tick).toFixed(1)}" />
            <text class="axis-label" x="${margin.left - 10}" y="${scaleY(tick).toFixed(1)}" dominant-baseline="middle" text-anchor="end">${formatCompactNumber(tick)}</text>
          </g>`,
            )
            .join("\n")}
          <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" />
          <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" />
          <text class="axis-title" x="${margin.left + plotWidth / 2}" y="${height - 22}" text-anchor="middle">Cells (rows x columns)</text>
          <text class="axis-title" transform="translate(20 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Memory MB</text>
          ${series
            .map((item) => {
              const points = item.points
                .map(
                  (point) =>
                    `${scaleX(point.cells).toFixed(1)},${scaleY(point.memoryMb).toFixed(1)}`,
                )
                .join(" ");
              return `<polyline class="chart-line" points="${points}" fill="none" stroke="${versionColors[item.version]}" stroke-width="3" />
              ${item.points
                .map(
                  (point) => `<circle cx="${scaleX(point.cells).toFixed(1)}" cy="${scaleY(point.memoryMb).toFixed(1)}" r="4.5" fill="${versionColors[item.version]}">
                <title>${item.version}: ${point.cells.toLocaleString()} cells, ${formatMb(point.memoryMb)}</title>
              </circle>`,
                )
                .join("\n")}`;
            })
            .join("\n")}
        </svg>
      </section>`;
    })
    .join("\n");

  return `<section class="chart-section">
    <h2>${escapeHtml(title)}</h2>
    <p class="chart-note">Phase: ${escapeHtml(phaseLabel)}. Each chart uses a linear memory axis and categorical cell-count positions so the v8/v9 gap is visible. Red is v8; blue is v9.</p>
    <div class="version-legend">
      <span><i style="background:${versionColors.v8}"></i>v8</span>
      <span><i style="background:${versionColors.v9}"></i>v9</span>
    </div>
    <div class="chart-grid">${charts}</div>
  </section>`;
};

const toHtml = ({
  comparisons,
  errors,
  options,
  snapshotReports,
  summary,
}: {
  comparisons: ReturnType<typeof compareV9ToV8>;
  errors: BenchmarkError[];
  options: CliOptions;
  snapshotReports: SnapshotReport[];
  summary: Summary;
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TanStack Table Memory Benchmark Results</title>
    <style>
      body {
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 32px;
      }
      h1, h2, h3 {
        margin: 0 0 16px;
      }
      table {
        border-collapse: collapse;
        font-size: 14px;
        margin-bottom: 32px;
        min-width: 980px;
        width: 100%;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 10px;
        text-align: right;
        white-space: nowrap;
      }
      th:first-child, td:first-child,
      th:nth-child(2), td:nth-child(2),
      th:nth-child(3), td:nth-child(3) {
        text-align: left;
      }
      th {
        background: #f3f4f6;
        color: #374151;
        font-weight: 600;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 24px;
      }
      .meta span {
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        padding: 6px 8px;
      }
      .ok {
        color: #047857;
        font-weight: 600;
      }
      .warn {
        color: #b45309;
        font-weight: 600;
      }
      .snapshot {
        margin-bottom: 40px;
      }
      .chart-section {
        margin: 32px 0 40px;
        overflow-x: auto;
      }
      .chart-note {
        color: #4b5563;
        margin: -8px 0 16px;
      }
      .memory-chart {
        border: 1px solid #e5e7eb;
        display: block;
        max-width: 1120px;
        width: 100%;
      }
      .grid-line {
        stroke: #e5e7eb;
        stroke-width: 1;
      }
      .axis-line {
        stroke: #111827;
        stroke-width: 1.5;
      }
      .axis-label {
        fill: #4b5563;
        font-size: 12px;
      }
      .axis-title {
        fill: #111827;
        font-size: 13px;
        font-weight: 600;
      }
      .chart-line {
        vector-effect: non-scaling-stroke;
      }
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        margin: 12px 0 0;
        max-width: 1120px;
      }
      .chart-legend span {
        align-items: center;
        color: #374151;
        display: inline-flex;
        font-size: 13px;
        gap: 6px;
      }
      .chart-legend i {
        display: inline-block;
        height: 10px;
        width: 18px;
      }
      .version-legend {
        display: flex;
        gap: 16px;
        margin: 0 0 16px;
      }
      .version-legend span {
        align-items: center;
        display: inline-flex;
        font-size: 14px;
        font-weight: 600;
        gap: 6px;
      }
      .version-legend i {
        display: inline-block;
        height: 10px;
        width: 22px;
      }
      .chart-grid {
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
        max-width: 1500px;
      }
      .chart-card {
        min-width: 520px;
      }
      .chart-card h3 {
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <h1>TanStack Table Memory Benchmark Results</h1>
    <div class="meta">
      <span>Iterations: ${options.iterations}</span>
      <span>Overscan: ${options.overscan}</span>
      <span>Smooth scroll steps: ${options.smoothScrollSteps}</span>
      <span>Case timeout: ${options.caseTimeoutMs.toLocaleString()} ms</span>
      <span>Max smooth-scroll cells: ${options.maxSmoothScrollCells.toLocaleString()}</span>
      <span>Heap snapshots: ${options.heapSnapshots ? "enabled" : "disabled"}</span>
      <span>Max snapshot cells: ${options.maxSnapshotCells.toLocaleString()}</span>
    </div>

    <h2>Errors</h2>
    ${
      errors.length
        ? `<table>
      <thead>
        <tr>
          <th>Config</th>
          <th>Example</th>
          <th>Iteration</th>
          <th>Rows</th>
          <th>Columns</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${errors
          .map(
            (error) => `<tr>
          <td>${escapeHtml(error.configName)}</td>
          <td>${escapeHtml(error.example)}</td>
          <td>${error.iteration}</td>
          <td>${error.rows.toLocaleString()}</td>
          <td>${error.columns.toLocaleString()}</td>
          <td>${escapeHtml(error.error)}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`
        : "<p>No benchmark errors recorded.</p>"
    }

    ${toVersionMemoryCharts({
      phaseLabel: "initial",
      phaseSelector: (row) => row.phase === "initial",
      summary,
      title: "Initial Retained Heap: v8 vs v9",
    })}

    ${toVersionMemoryCharts({
      phaseLabel: "final interaction",
      phaseSelector: (row) => getFinalPhase(row.benchmark).includes(row.phase),
      summary,
      title: "Final Interaction Retained Heap: v8 vs v9",
    })}

    <h2>v9 vs v8 Median Retained JS Heap</h2>
    <table>
      <thead>
        <tr>
          <th>Config</th>
          <th>Benchmark</th>
          <th>Phase</th>
          <th>Rows</th>
          <th>Columns</th>
          <th>v8 Median</th>
          <th>v9 Median</th>
          <th>Memory Less</th>
          <th>Memory Less %</th>
          <th>Rows Match</th>
          <th>Cells Match</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>
        ${comparisons
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.configName)}</td>
          <td>${escapeHtml(formatBenchmarkName(row.benchmark))}</td>
          <td>${escapeHtml(row.phase)}</td>
          <td>${row.rows.toLocaleString()}</td>
          <td>${row.columns.toLocaleString()}</td>
          <td>${formatMb(row.v8MedianMb)}</td>
          <td>${formatMb(row.v9MedianMb)}</td>
          <td>${formatMb(row.memoryLessMb)}</td>
          <td>${formatPercent(row.memoryLessPercent)}</td>
          <td class="${row.renderedRowsMatch ? "ok" : "warn"}">${row.renderedRowsMatch ? "yes" : "no"}</td>
          <td class="${row.renderedCellsMatch ? "ok" : "warn"}">${row.renderedCellsMatch ? "yes" : "no"}</td>
          <td>${row.samples}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>

    <h2>Raw Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Rows</th>
          <th>Columns</th>
          <th>Before GC Median</th>
          <th>After GC Median</th>
          <th>GC Reclaimed Median</th>
          <th>After GC Min</th>
          <th>After GC Max</th>
          <th>Rendered Rows</th>
          <th>Rendered Cells</th>
          <th>DOM Nodes</th>
          <th>Listeners</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>
        ${summary
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.key)}</td>
          <td>${row.rows.toLocaleString()}</td>
          <td>${row.columns.toLocaleString()}</td>
          <td>${formatMb(row.beforeGcMedianMb)}</td>
          <td>${formatMb(row.afterGcMedianMb)}</td>
          <td>${formatMb(row.gcReclaimedMedianMb)}</td>
          <td>${formatMb(row.afterGcMinMb)}</td>
          <td>${formatMb(row.afterGcMaxMb)}</td>
          <td>${row.renderedRowsMedian.toLocaleString()}</td>
          <td>${row.renderedCellsMedian.toLocaleString()}</td>
          <td>${row.nodesMedian.toLocaleString()}</td>
          <td>${row.listenersMedian.toLocaleString()}</td>
          <td>${row.samples}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>

  </body>
</html>
`;

const startServer = async (cwd: string, port: number) => {
  const server = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd,
      stdio: "inherit",
    },
  );
  await waitForServer(`http://127.0.0.1:${port}`);
  return server;
};

const stopServer = async (server: ChildProcess) => {
  if (!server.killed) {
    server.kill();
  }
  await delay(250);
};

async function main() {
  try {
    const selectedExamples = examples.filter(
      (example) =>
        options.benchmark === "all" || example.kind === options.benchmark,
    );
    const selectedConfigs = benchmarkConfigs.filter(
      (config) =>
        options.benchmark === "all" || config.kind === options.benchmark,
    );

    for (const example of selectedExamples) {
      run("pnpm", ["run", "build"], example.path);
    }

    mkdirSync("results", { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const jsonPath = join("results", `memory-${stamp}.json`);
    const csvPath = join("results", `memory-${stamp}.csv`);
    const htmlPath = join("results", `memory-${stamp}.html`);
    const snapshotDir = join("results", `heap-snapshots-${stamp}`);

    if (options.heapSnapshots) {
      mkdirSync(snapshotDir, { recursive: true });
    }

    const browser = await chromium.launch({
      args: ["--js-flags=--expose-gc"],
    });
    const results: Result[] = [];
    const errors: BenchmarkError[] = [];
    const snapshotReports: SnapshotReport[] = [];
    const writeReports = () => {
      const summary = summarize(results);
      const comparisons = compareV9ToV8(summary);

      writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            benchmarkConfigs,
            comparisons,
            errors,
            options,
            results,
            snapshotReports,
            summary,
          },
          null,
          2,
        ),
      );
      writeFileSync(csvPath, toCsv(results));
      writeFileSync(
        htmlPath,
        toHtml({ comparisons, errors, options, snapshotReports, summary }),
      );

      return { comparisons, summary };
    };

    for (const [index, example] of selectedExamples.entries()) {
      const port = options.port + index;
      const server = await startServer(example.path, port);

      try {
        for (const config of selectedConfigs.filter(
          (item) => item.kind === example.kind,
        )) {
          for (
            let iteration = 1;
            iteration <= options.iterations;
            iteration++
          ) {
            const url = `http://127.0.0.1:${port}/?rows=${config.rows}&columns=${config.columns}&overscan=${options.overscan}`;
            const label = `${example.name} ${config.rows}x${config.columns}`;
            const snapshotBaseName = sanitizeFilePart(
              `${config.name}-${example.name}-iteration-${iteration}`,
            );
            const estimatedCells = config.rows * config.columns;
            let measurements: CollectedMeasurement[] = [];
            let snapshots: SnapshotReport[] = [];

            try {
              const collection = await withTimeout(
                collect({
                  browser,
                  captureSnapshots:
                    options.heapSnapshots &&
                    iteration === 1 &&
                    estimatedCells <= options.maxSnapshotCells,
                  interaction:
                    example.kind === "paginated-rows" ||
                    example.kind === "kitchen-sink"
                      ? "pagination"
                      : "scroll",
                  label,
                  runSmoothScroll:
                    example.kind !== "paginated-rows" &&
                    example.kind !== "kitchen-sink" &&
                    estimatedCells <= options.maxSmoothScrollCells,
                  snapshotBaseName,
                  snapshotDir,
                  url,
                }),
                options.caseTimeoutMs,
                `Timed out after ${options.caseTimeoutMs}ms`,
              );
              measurements = collection.measurements;
              snapshots = collection.snapshots;
            } catch (error) {
              errors.push({
                benchmark: config.kind,
                columns: config.columns,
                configName: config.name,
                error: error instanceof Error ? error.message : String(error),
                example: example.name,
                iteration,
                rows: config.rows,
                timestamp: new Date().toISOString(),
                url,
                version: example.version,
              });
              writeReports();
              continue;
            }

            for (const measurement of measurements) {
              results.push({
                ...measurement,
                benchmark: config.kind,
                columns: config.columns,
                configName: config.name,
                example: example.name,
                iteration,
                rows: config.rows,
                url,
                version: example.version,
              });
            }

            for (const snapshot of snapshots) {
              const phase = snapshot.file.includes("-beginning.")
                ? "initial"
                : example.kind === "paginated-rows" ||
                    example.kind === "kitchen-sink"
                  ? "last-page"
                  : "smooth-end-scroll";
              snapshotReports.push({
                ...snapshot,
                benchmark: config.kind,
                columns: config.columns,
                configName: config.name,
                example: example.name,
                phase,
                rows: config.rows,
                version: example.version,
              });
            }

            writeReports();
          }
        }
      } finally {
        await stopServer(server);
      }
    }

    await browser.close();

    const { comparisons } = writeReports();

    console.table(comparisons);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${csvPath}`);
    console.log(`Wrote ${htmlPath}`);
    if (options.heapSnapshots) {
      console.log(`Wrote heap snapshots to ${snapshotDir}`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

main();
