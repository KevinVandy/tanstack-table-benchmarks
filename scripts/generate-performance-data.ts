import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { faker } from "@faker-js/faker";

type PerfStatus = "single" | "relationship" | "complicated";

interface FixtureMeta {
  rowCount: number;
  seed: number;
  version: 1;
}

const outputPath = join("shared", "generated", "perfData.json");
const metaPath = join("shared", "generated", "perfData.meta.json");
const seed = 8_675_309;
const statuses: PerfStatus[] = ["single", "relationship", "complicated"];
const tagSets = [
  ["tag-0", "tag-1", "tag-2"],
  ["tag-1", "tag-2", "tag-3"],
  ["tag-2", "tag-3", "tag-4"],
  ["tag-0", "tag-3", "tag-4"],
  ["tag-1", "tag-4", "tag-5"],
];

const readNumberFlag = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const readBooleanFlag = (name: string, fallback: boolean) => {
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

const maxRows = 300_000;
const rows = Math.min(readNumberFlag("rows", maxRows), maxRows);
const force = readBooleanFlag("force", false);

const readMeta = (): FixtureMeta | undefined => {
  if (!existsSync(metaPath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(metaPath, "utf8")) as FixtureMeta;
};

const meta = readMeta();
if (
  !force &&
  existsSync(outputPath) &&
  meta?.version === 1 &&
  meta.seed === seed &&
  meta.rowCount === rows
) {
  console.log(
    `Using existing performance fixture: ${meta.rowCount.toLocaleString()} rows`,
  );
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
faker.seed(seed);

const stream = createWriteStream(outputPath, { encoding: "utf8" });
stream.write(`{"version":1,"seed":${seed},"rowCount":${rows},"rows":[\n`);

for (let index = 0; index < rows; index++) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const word = faker.word.noun();
  const numericSuffix = (rows - index + (index % 97)) % Math.max(rows, 1);
  const casePrefix = index % 2 === 0 ? "Item" : "item";
  const tuple = [
    index + 1,
    `${firstName} ${lastName}`.toLowerCase(),
    `${index % 2 === 0 ? firstName : firstName.toLowerCase()} ${lastName}`,
    `${word}-${numericSuffix}`,
    `${casePrefix}-${word}-${numericSuffix}`,
    ((index * 7_919) % 100_000) + (index % 10) / 10,
    index % 1_000,
    new Date(
      Date.UTC(2020 + (index % 7), (index * 5) % 12, (index % 28) + 1),
    ).toISOString(),
    statuses[index % statuses.length],
    `group-${index % 20}`,
    `subgroup-${index % 100}`,
    tagSets[index % tagSets.length],
  ];

  stream.write(`${index === 0 ? "" : ",\n"}${JSON.stringify(tuple)}`);

  if ((index + 1) % 100_000 === 0) {
    console.log(`Generated ${(index + 1).toLocaleString()} rows`);
  }
}

stream.write("\n]}\n");
await new Promise<void>((resolve, reject) => {
  stream.end((error?: Error | null) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
});

const nextMeta: FixtureMeta = {
  rowCount: rows,
  seed,
  version: 1,
};

mkdirSync(dirname(metaPath), { recursive: true });
const metaStream = createWriteStream(metaPath, { encoding: "utf8" });
metaStream.write(`${JSON.stringify(nextMeta, null, 2)}\n`);
await new Promise<void>((resolve, reject) => {
  metaStream.end((error?: Error | null) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
});

console.log(`Wrote ${outputPath}`);
