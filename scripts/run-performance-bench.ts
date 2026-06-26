import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import {
  aggregationScenarios,
  filteringScenarios,
  sortingScenarios,
  type OperationBenchInput,
  type OperationBenchResult,
  type OperationKind,
  type PipelineMode,
  type SortDirection,
  type TableVersion,
} from "../shared/src/perfScenarios.js";

declare global {
  interface Window {
    __TABLE_BENCH_READY__: boolean;
    __TABLE_OPERATION_BENCH__: {
      run: (input: OperationBenchInput) => OperationBenchResult;
    };
  }
}

type OperationFlag = OperationKind | "all";

interface CliOptions {
  caseTimeoutMs: number;
  includeV9Only: boolean;
  iterations: number;
  operation: OperationFlag;
  pipeline: PipelineMode;
  port: number;
  rows: number[];
  scenario: string;
  warmups: number;
}

interface Example {
  name: string;
  operation: OperationKind;
  path: string;
  version: TableVersion;
}

interface BenchCase {
  direction?: SortDirection;
  operation: OperationKind;
  scenario: string;
  v9Only: boolean;
}

interface Result extends OperationBenchResult {
  example: string;
  iteration: number;
  timestamp: string;
  url: string;
  warmup: boolean;
}

interface BenchmarkError {
  direction?: SortDirection;
  error: string;
  example: string;
  iteration: number;
  operation: OperationKind;
  pipeline: PipelineMode;
  rows: number;
  scenario: string;
  timestamp: string;
  url: string;
  version: TableVersion;
  warmup: boolean;
}

const maxRows = 300_000;
const defaultRows = [30_000, maxRows];

const examples: Example[] = [
  {
    name: "v8/sorting-fns",
    operation: "sorting",
    path: "examples/v8/sorting-fns",
    version: "v8",
  },
  {
    name: "v9/sorting-fns",
    operation: "sorting",
    path: "examples/v9/sorting-fns",
    version: "v9",
  },
  {
    name: "v8/filtering-fns",
    operation: "filtering",
    path: "examples/v8/filtering-fns",
    version: "v8",
  },
  {
    name: "v9/filtering-fns",
    operation: "filtering",
    path: "examples/v9/filtering-fns",
    version: "v9",
  },
  {
    name: "v8/aggregation-fns",
    operation: "aggregation",
    path: "examples/v8/aggregation-fns",
    version: "v8",
  },
  {
    name: "v9/aggregation-fns",
    operation: "aggregation",
    path: "examples/v9/aggregation-fns",
    version: "v9",
  },
];

const readNumberFlag = (name: keyof CliOptions, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const readNonNegativeNumberFlag = (
  name: keyof CliOptions,
  fallback: number,
) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
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

const readOperationFlag = (): OperationFlag => {
  const index = process.argv.indexOf("--operation");
  const value = index === -1 ? "all" : process.argv[index + 1];
  return value === "sorting" ||
    value === "filtering" ||
    value === "aggregation" ||
    value === "all"
    ? value
    : "all";
};

const readStringFlag = (name: keyof CliOptions, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

const readPipelineFlag = (): PipelineMode => {
  const index = process.argv.indexOf("--pipeline");
  const value = index === -1 ? "operation" : process.argv[index + 1];
  return value === "full" || value === "operation" ? value : "operation";
};

const readRowsFlag = () => {
  const index = process.argv.indexOf("--rows");
  if (index === -1) {
    return defaultRows;
  }

  const requestedRows = process.argv[index + 1]
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const rows = requestedRows?.filter((value) => value <= maxRows);

  if (requestedRows?.some((value) => value > maxRows)) {
    console.warn(
      `[bench:performance] Ignoring row counts above ${maxRows.toLocaleString()} to avoid memory pressure`,
    );
  }

  return rows?.length ? rows : defaultRows;
};

const options: CliOptions = {
  caseTimeoutMs: readNumberFlag("caseTimeoutMs", 120_000),
  includeV9Only: readBooleanFlag("includeV9Only", true),
  iterations: readNumberFlag("iterations", 3),
  operation: readOperationFlag(),
  pipeline: readPipelineFlag(),
  port: readNumberFlag("port", 41_740),
  rows: readRowsFlag(),
  scenario: readStringFlag("scenario", "all"),
  warmups: readNonNegativeNumberFlag("warmups", 0),
};

const log = (message: string) => {
  console.log(`[bench:performance] ${message}`);
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

const probeServer = (url: string) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ready);
      }
    };
    const req = request(url, { method: "GET" }, (response) => {
      response.resume();
      finish(Boolean(response.statusCode && response.statusCode < 500));
    });
    req.on("error", () => finish(false));
    req.setTimeout(1_000, () => {
      req.destroy();
      finish(false);
    });
    req.end();
  });

const waitForServer = async (url: string) => {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await probeServer(url)) {
      return;
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

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

const allCases: BenchCase[] = [
  ...sortingScenarios.flatMap((scenario) =>
    (["asc", "desc"] as const).map((direction) => ({
      direction,
      operation: "sorting" as const,
      scenario: scenario.name,
      v9Only: false,
    })),
  ),
  ...filteringScenarios.map((scenario) => ({
    operation: "filtering" as const,
    scenario: scenario.name,
    v9Only: Boolean(scenario.v9Only),
  })),
  ...aggregationScenarios.map((scenario) => ({
    operation: "aggregation" as const,
    scenario: scenario.name,
    v9Only: false,
  })),
];

const selectedCasesForExample = (example: Example) =>
  allCases.filter((benchCase) => {
    if (benchCase.operation !== example.operation) {
      return false;
    }
    if (options.operation !== "all" && benchCase.operation !== options.operation) {
      return false;
    }
    if (options.scenario !== "all" && benchCase.scenario !== options.scenario) {
      return false;
    }
    if (benchCase.v9Only && (!options.includeV9Only || example.version !== "v9")) {
      return false;
    }
    return true;
  });

const collect = async ({
  browser,
  example,
  port,
}: {
  browser: Browser;
  example: Example;
  port: number;
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = `http://127.0.0.1:${port}`;

  await page.goto(url);
  await page.waitForFunction(() => window.__TABLE_BENCH_READY__ === true, {
    timeout: 60_000,
  });

  const results: Result[] = [];
  const errors: BenchmarkError[] = [];
  const selectedCases = selectedCasesForExample(example);
  const totalSamples =
    selectedCases.length *
    options.rows.length *
    (options.iterations + options.warmups);
  let completedSamples = 0;

  log(
    `${example.name}: starting ${selectedCases.length} cases, ${options.rows.length} row counts, ${totalSamples} samples including warmups`,
  );

  for (const benchCase of selectedCases) {
    for (const rows of options.rows) {
      const directionLabel = benchCase.direction
        ? ` ${benchCase.direction}`
        : "";
      log(
        `${example.name}: ${benchCase.operation}:${benchCase.scenario}${directionLabel}, rows=${rows.toLocaleString()}`,
      );

      for (
        let sampleIndex = 1 - options.warmups;
        sampleIndex <= options.iterations;
        sampleIndex++
      ) {
        const warmup = sampleIndex <= 0;
        const iteration = warmup ? Math.abs(sampleIndex) + 1 : sampleIndex;
        const input: OperationBenchInput = {
          direction: benchCase.direction,
          operation: benchCase.operation,
          pipeline: options.pipeline,
          rows,
          scenario: benchCase.scenario,
        };

        try {
          const measurement = await withTimeout(
            page.evaluate((benchInput) => {
              return window.__TABLE_OPERATION_BENCH__.run(benchInput);
            }, input),
            options.caseTimeoutMs,
            `Timed out after ${options.caseTimeoutMs}ms`,
          );

          if (!warmup) {
            results.push({
              ...measurement,
              example: example.name,
              iteration,
              timestamp: new Date().toISOString(),
              url,
              warmup,
            });
          }
        } catch (error) {
          errors.push({
            direction: benchCase.direction,
            error: error instanceof Error ? error.message : String(error),
            example: example.name,
            iteration,
            operation: benchCase.operation,
            pipeline: options.pipeline,
            rows,
            scenario: benchCase.scenario,
            timestamp: new Date().toISOString(),
            url,
            version: example.version,
            warmup,
          });
        } finally {
          completedSamples++;
          if (
            completedSamples === totalSamples ||
            completedSamples % Math.max(options.iterations + options.warmups, 1) === 0
          ) {
            log(
              `${example.name}: completed ${completedSamples.toLocaleString()} / ${totalSamples.toLocaleString()} samples`,
            );
          }
        }
      }
    }
  }

  await context.close();
  log(`${example.name}: finished`);
  return { errors, results };
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const percentile = (values: number[], percentileValue: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
};

const round = (value: number, places = 3) => Number(value.toFixed(places));

const summarize = (results: Result[]) => {
  const groups = new Map<string, Result[]>();

  for (const result of results) {
    const key = [
      result.operation,
      result.scenario,
      result.direction ?? "",
      result.pipeline,
      result.rows,
      result.version,
    ].join(":");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const first = group[0]!;
    const durations = group.map((item) => item.durationMs);
    const checksums = new Set(group.map((item) => item.checksum));
    const outputRows = group.map((item) => item.outputRows);

    return {
      checksum: first.checksum,
      checksumStable: checksums.size === 1,
      direction: first.direction,
      durationMaxMs: round(Math.max(...durations)),
      durationMedianMs: round(median(durations)),
      durationMinMs: round(Math.min(...durations)),
      durationP75Ms: round(percentile(durations, 75)),
      durationP95Ms: round(percentile(durations, 95)),
      key,
      operation: first.operation,
      outputRowsMedian: median(outputRows),
      pipeline: first.pipeline,
      rows: first.rows,
      samples: group.length,
      scenario: first.scenario,
      version: first.version,
    };
  });
};

type Summary = ReturnType<typeof summarize>;

const isV9OnlyScenario = (operation: OperationKind, scenario: string) =>
  operation === "filtering" &&
  filteringScenarios.some((item) => item.name === scenario && item.v9Only);

const compareV9ToV8 = (summary: Summary) => {
  const rows = [];
  const keys = new Set(
    summary
      .filter((item) => !isV9OnlyScenario(item.operation, item.scenario))
      .map((item) =>
        [
          item.operation,
          item.scenario,
          item.direction ?? "",
          item.pipeline,
          item.rows,
        ].join(":"),
      ),
  );

  for (const key of keys) {
    const [operation, scenario, direction, pipeline, rowsValue] = key.split(":");
    const v8 = summary.find(
      (item) =>
        item.operation === operation &&
        item.scenario === scenario &&
        (item.direction ?? "") === direction &&
        item.pipeline === pipeline &&
        item.rows === Number(rowsValue) &&
        item.version === "v8",
    );
    const v9 = summary.find(
      (item) =>
        item.operation === operation &&
        item.scenario === scenario &&
        (item.direction ?? "") === direction &&
        item.pipeline === pipeline &&
        item.rows === Number(rowsValue) &&
        item.version === "v9",
    );

    if (!v8 || !v9) {
      continue;
    }

    const durationLessMs = v8.durationMedianMs - v9.durationMedianMs;
    const durationLessPercent = (durationLessMs / v8.durationMedianMs) * 100;

    rows.push({
      checksumMatch: v8.checksum === v9.checksum,
      direction: direction || undefined,
      durationLessMs: round(durationLessMs),
      durationLessPercent: round(durationLessPercent, 1),
      operation,
      outputRowsMatch: v8.outputRowsMedian === v9.outputRowsMedian,
      pipeline,
      rows: Number(rowsValue),
      samples: Math.min(v8.samples, v9.samples),
      scenario,
      v8MedianMs: v8.durationMedianMs,
      v9MedianMs: v9.durationMedianMs,
    });
  }

  return rows;
};

const toCsv = (results: Result[]) => {
  const headers = [
    "timestamp",
    "example",
    "version",
    "iteration",
    "operation",
    "scenario",
    "direction",
    "pipeline",
    "rows",
    "durationMs",
    "outputRows",
    "checksum",
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

const formatMs = (value: number) => `${value.toFixed(3)} ms`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const comparisonClass = (durationLessMs: number) => {
  if (durationLessMs > 0) {
    return "faster";
  }
  if (durationLessMs < 0) {
    return "slower";
  }
  return "neutral";
};

const toHtml = ({
  comparisons,
  errors,
  options,
  summary,
  v9OnlySummary,
}: {
  comparisons: ReturnType<typeof compareV9ToV8>;
  errors: BenchmarkError[];
  options: CliOptions;
  summary: Summary;
  v9OnlySummary: Summary;
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TanStack Table Operation Benchmark Results</title>
    <style>
      body {
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 32px;
      }
      h1, h2 {
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
      .faster {
        color: #047857;
        font-weight: 600;
      }
      .slower {
        color: #b91c1c;
        font-weight: 600;
      }
      .neutral {
        color: #374151;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <h1>TanStack Table Operation Benchmark Results</h1>
    <div class="meta">
      <span>Operation: ${escapeHtml(options.operation)}</span>
      <span>Scenario: ${escapeHtml(options.scenario)}</span>
      <span>Pipeline: ${escapeHtml(options.pipeline)}</span>
      <span>Rows: ${escapeHtml(options.rows.join(", "))}</span>
      <span>Iterations: ${options.iterations}</span>
      <span>Warmups: ${options.warmups}</span>
      <span>Include v9-only: ${options.includeV9Only ? "yes" : "no"}</span>
      <span>Case timeout: ${options.caseTimeoutMs.toLocaleString()} ms</span>
    </div>

    <h2>Errors</h2>
    ${
      errors.length
        ? `<table>
      <thead>
        <tr>
          <th>Example</th>
          <th>Operation</th>
          <th>Scenario</th>
          <th>Rows</th>
          <th>Iteration</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${errors
          .map(
            (error) => `<tr>
          <td>${escapeHtml(error.example)}</td>
          <td>${escapeHtml(error.operation)}</td>
          <td>${escapeHtml(error.scenario)}</td>
          <td>${error.rows.toLocaleString()}</td>
          <td>${error.warmup ? "warmup" : error.iteration}</td>
          <td>${escapeHtml(error.error)}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`
        : "<p>No benchmark errors recorded.</p>"
    }

    <h2>v9 vs v8 Median Duration</h2>
    <table>
      <thead>
        <tr>
          <th>Operation</th>
          <th>Scenario</th>
          <th>Direction</th>
          <th>Pipeline</th>
          <th>Rows</th>
          <th>v8 Median</th>
          <th>v9 Median</th>
          <th>v9 Less</th>
          <th>v9 Less %</th>
          <th>Rows Match</th>
          <th>Checksum Match</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>
        ${comparisons
          .map((row) => {
            const speedClass = comparisonClass(row.durationLessMs);
            return `<tr>
          <td>${escapeHtml(row.operation)}</td>
          <td>${escapeHtml(row.scenario)}</td>
          <td>${escapeHtml(row.direction ?? "")}</td>
          <td>${escapeHtml(row.pipeline)}</td>
          <td>${row.rows.toLocaleString()}</td>
          <td>${formatMs(row.v8MedianMs)}</td>
          <td class="${speedClass}">${formatMs(row.v9MedianMs)}</td>
          <td class="${speedClass}">${formatMs(row.durationLessMs)}</td>
          <td class="${speedClass}">${formatPercent(row.durationLessPercent)}</td>
          <td class="${row.outputRowsMatch ? "ok" : "warn"}">${row.outputRowsMatch ? "yes" : "no"}</td>
          <td class="${row.checksumMatch ? "ok" : "warn"}">${row.checksumMatch ? "yes" : "no"}</td>
          <td>${row.samples}</td>
        </tr>`;
          })
          .join("\n")}
      </tbody>
    </table>

    <h2>v9-only FilterFns</h2>
    ${
      v9OnlySummary.length
        ? `<table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Rows</th>
          <th>Median</th>
          <th>P75</th>
          <th>P95</th>
          <th>Min</th>
          <th>Max</th>
          <th>Output Rows</th>
          <th>Checksum Stable</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>
        ${v9OnlySummary
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.scenario)}</td>
          <td>${row.rows.toLocaleString()}</td>
          <td>${formatMs(row.durationMedianMs)}</td>
          <td>${formatMs(row.durationP75Ms)}</td>
          <td>${formatMs(row.durationP95Ms)}</td>
          <td>${formatMs(row.durationMinMs)}</td>
          <td>${formatMs(row.durationMaxMs)}</td>
          <td>${row.outputRowsMedian.toLocaleString()}</td>
          <td class="${row.checksumStable ? "ok" : "warn"}">${row.checksumStable ? "yes" : "no"}</td>
          <td>${row.samples}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`
        : "<p>No v9-only filter function samples recorded.</p>"
    }

    <h2>Raw Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Operation</th>
          <th>Scenario</th>
          <th>Direction</th>
          <th>Pipeline</th>
          <th>Rows</th>
          <th>Version</th>
          <th>Median</th>
          <th>P75</th>
          <th>P95</th>
          <th>Min</th>
          <th>Max</th>
          <th>Output Rows</th>
          <th>Checksum Stable</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>
        ${summary
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.operation)}</td>
          <td>${escapeHtml(row.scenario)}</td>
          <td>${escapeHtml(row.direction ?? "")}</td>
          <td>${escapeHtml(row.pipeline)}</td>
          <td>${row.rows.toLocaleString()}</td>
          <td>${row.version}</td>
          <td>${formatMs(row.durationMedianMs)}</td>
          <td>${formatMs(row.durationP75Ms)}</td>
          <td>${formatMs(row.durationP95Ms)}</td>
          <td>${formatMs(row.durationMinMs)}</td>
          <td>${formatMs(row.durationMaxMs)}</td>
          <td>${row.outputRowsMedian.toLocaleString()}</td>
          <td class="${row.checksumStable ? "ok" : "warn"}">${row.checksumStable ? "yes" : "no"}</td>
          <td>${row.samples}</td>
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>
  </body>
</html>`;

async function main() {
  try {
    const selectedExamples = examples.filter(
      (example) => options.operation === "all" || example.operation === options.operation,
    );
    const maxRequestedRows = Math.max(...options.rows);
    log(
      `Ensuring generated Faker fixture for ${maxRequestedRows.toLocaleString()} rows`,
    );
    run("pnpm", [
      "run",
      "generate:performance-data",
      "--",
      "--rows",
      String(maxRequestedRows),
    ]);

    for (const example of selectedExamples) {
      log(`Building ${example.name}`);
      run("pnpm", ["run", "build"], example.path);
    }

    mkdirSync("results", { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const jsonPath = join("results", `performance-${stamp}.json`);
    const csvPath = join("results", `performance-${stamp}.csv`);
    const htmlPath = join("results", `performance-${stamp}.html`);

    const browser = await chromium.launch();
    const results: Result[] = [];
    const errors: BenchmarkError[] = [];

    const writeReports = () => {
      const summary = summarize(results);
      const comparisons = compareV9ToV8(summary);
      const v9OnlySummary = summary.filter((row) =>
        isV9OnlyScenario(row.operation, row.scenario),
      );

      writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            comparisons,
            errors,
            options,
            results,
            summary,
            v9OnlySummary,
          },
          null,
          2,
        ),
      );
      writeFileSync(csvPath, toCsv(results));
      writeFileSync(
        htmlPath,
        toHtml({ comparisons, errors, options, summary, v9OnlySummary }),
      );

      return { comparisons, summary };
    };

    for (const [index, example] of selectedExamples.entries()) {
      const port = options.port + index;
      log(`Starting preview server for ${example.name} on port ${port}`);
      const server = await startServer(example.path, port);

      try {
        const collection = await collect({ browser, example, port });
        results.push(...collection.results);
        errors.push(...collection.errors);
        writeReports();
        log(`Wrote interim reports after ${example.name}`);
      } finally {
        await stopServer(server);
        log(`Stopped preview server for ${example.name}`);
      }
    }

    await browser.close();

    const { comparisons } = writeReports();

    console.table(comparisons);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${csvPath}`);
    console.log(`Wrote ${htmlPath}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

main();
