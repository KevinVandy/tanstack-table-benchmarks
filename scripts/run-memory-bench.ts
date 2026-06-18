import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";

declare global {
  interface Window {
    __TABLE_BENCH_READY__: boolean;
  }
}

interface CliOptions {
  columns: number;
  iterations: number;
  overscan: number;
  port: number;
  rows: number;
}

interface Measurement {
  documents: number;
  jsHeapTotal: number;
  jsHeapUsed: number;
  jsHeapUsedMb: number;
  jsEventListeners: number;
  label: string;
  nodes: number;
  timestamp: string;
}

interface Result extends Measurement {
  example: string;
  iteration: number;
  phase: string;
  url: string;
}

const examples = [
  {
    name: "v8/virtualized-rows",
    path: "examples/v8/virtualized-rows",
  },
  {
    name: "v9/virtualized-rows",
    path: "examples/v9/virtualized-rows",
  },
  {
    name: "v8/virtualized-columns",
    path: "examples/v8/virtualized-columns",
  },
  {
    name: "v9/virtualized-columns",
    path: "examples/v9/virtualized-columns",
  },
];

const readNumberFlag = (name: keyof CliOptions, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const options: CliOptions = {
  columns: readNumberFlag("columns", 1_000),
  iterations: readNumberFlag("iterations", 10),
  overscan: readNumberFlag("overscan", 5),
  port: readNumberFlag("port", 41_730),
  rows: readNumberFlag("rows", 50_000),
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

const collect = async (browser: Browser, url: string, label: string) => {
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

  const measurements: Array<Omit<Result, "example" | "iteration" | "url">> = [];

  const measure = async (phase: string) => {
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await client.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(100);

    const [{ metrics }, domCounters] = await Promise.all([
      client.send("Performance.getMetrics"),
      client.send("Memory.getDOMCounters"),
    ]);
    const jsHeapUsed = getMetric(metrics, "JSHeapUsedSize");
    const jsHeapTotal = getMetric(metrics, "JSHeapTotalSize");

    measurements.push({
      documents: domCounters.documents,
      jsEventListeners: domCounters.jsEventListeners,
      jsHeapTotal,
      jsHeapUsed,
      jsHeapUsedMb: Number((jsHeapUsed / 1024 / 1024).toFixed(2)),
      label,
      nodes: domCounters.nodes,
      phase,
      timestamp: new Date().toISOString(),
    });
  };

  await measure("initial");

  await scroll(page, 0.5, 0.5);
  await measure("middle-scroll");

  await scroll(page, 1, 1);
  await measure("end-scroll");

  await context.close();
  return measurements;
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

const summarize = (results: Result[]) => {
  const groups = new Map<string, Result[]>();

  for (const result of results) {
    const key = `${result.example}:${result.phase}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const sorted = group.map((item) => item.jsHeapUsedMb).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];

    return {
      key,
      maxMb: sorted[sorted.length - 1],
      medianMb: median,
      minMb: sorted[0],
      p75Mb: p75,
      samples: sorted.length,
    };
  });
};

const toCsv = (results: Result[]) => {
  const headers = [
    "timestamp",
    "example",
    "iteration",
    "phase",
    "label",
    "jsHeapUsedMb",
    "jsHeapUsed",
    "jsHeapTotal",
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
    for (const example of examples) {
      run("pnpm", ["run", "build"], example.path);
    }

    const browser = await chromium.launch({
      args: ["--js-flags=--expose-gc"],
    });
    const results: Result[] = [];

    for (const [index, example] of examples.entries()) {
      const port = options.port + index;
      const server = await startServer(example.path, port);

      try {
        for (let iteration = 1; iteration <= options.iterations; iteration++) {
          const url = `http://127.0.0.1:${port}/?rows=${options.rows}&columns=${options.columns}&overscan=${options.overscan}`;
          const label = `${example.name} ${options.rows}x${options.columns}`;
          const measurements = await collect(browser, url, label);

          for (const measurement of measurements) {
            results.push({
              ...measurement,
              example: example.name,
              iteration,
              url,
            });
          }
        }
      } finally {
        await stopServer(server);
      }
    }

    await browser.close();

    mkdirSync("results", { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const jsonPath = join("results", `memory-${stamp}.json`);
    const csvPath = join("results", `memory-${stamp}.csv`);

    writeFileSync(
      jsonPath,
      JSON.stringify(
        { options, results, summary: summarize(results) },
        null,
        2,
      ),
    );
    writeFileSync(csvPath, toCsv(results));

    console.table(summarize(results));
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${csvPath}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

main();
