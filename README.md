# TanStack Table Benchmark Examples

Dedicated memory and row-model operation benchmarks for similar TanStack Table v8 and v9 React examples.

Each benchmark is an independent Vite example with its own `package.json`, mirroring the structure of the existing TanStack examples:

- `examples/v8/virtualized-rows`
- `examples/v8/virtualized-columns`
- `examples/v8/paginated-rows`
- `examples/v8/kitchen-sink`
- `examples/v8/sorting-fns`
- `examples/v8/filtering-fns`
- `examples/v8/aggregation-fns`
- `examples/v9/virtualized-rows`
- `examples/v9/virtualized-columns`
- `examples/v9/paginated-rows`
- `examples/v9/kitchen-sink`
- `examples/v9/sorting-fns`
- `examples/v9/filtering-fns`
- `examples/v9/aggregation-fns`

Shared deterministic data, config parsing, and CSS live in `shared/src`.

## Install

```sh
pnpm install
```

## Run

```sh
pnpm bench:memory
```

Useful flags:

```sh
pnpm bench:memory -- --iterations 5 --overscan 5
```

Run only one benchmark group:

```sh
pnpm bench:memory -- --benchmark rows
pnpm bench:memory -- --benchmark columns
pnpm bench:memory -- --benchmark paginated-rows
pnpm bench:memory -- --benchmark kitchen-sink
```

Capture beginning/end heap snapshots for the first iteration of each v8/v9/config combination:

```sh
pnpm bench:memory -- --heapSnapshots true
```

By default snapshots are captured only for configs with at most `10,000` estimated cells, because large browser heap snapshots can be multiple GB and impractical to create or parse locally. Adjust with:

```sh
pnpm bench:memory -- --heapSnapshots true --maxSnapshotCells 100000
```

Smooth scroll phases are captured only for configs with at most `1,000,000` estimated cells by default. Larger configs still record initial and instant-scroll phases, plus a `smooth-scroll-skipped` marker. Adjust with:

```sh
pnpm bench:memory -- --maxSmoothScrollCells 10000000
```

The runner builds each independent example, starts `vite preview` for one example at a time, opens it in a fresh Chromium context, and records:

- `JSHeapUsedSize` before forced GC
- `JSHeapUsedSize` after forced GC
- memory reclaimed by forced GC
- DOM document, node, and event listener counts
- rendered row and cell counts for equivalence checks

It measures these phases:

Virtualized examples:

- `initial`
- `instant-middle-scroll`
- `instant-end-scroll`
- `smooth-middle-scroll`
- `smooth-end-scroll`

Paginated examples:

- `initial`
- `next-page`
- `last-page`

Results are written to `results/*.json`, `results/*.csv`, and `results/*.html`.

## Operation Performance Benchmarks

Run sorting, filtering, and aggregation row-model benchmarks:

```sh
pnpm bench:performance
```

Useful flags:

```sh
pnpm bench:performance -- --iterations 3 --warmups 0
pnpm bench:performance -- --operation sorting
pnpm bench:performance -- --operation filtering --scenario includesString
pnpm bench:performance -- --operation aggregation --scenario sum
pnpm bench:performance -- --rows 30000,300000
pnpm bench:performance -- --includeV9Only false
pnpm bench:performance -- --pipeline full
```

The operation runner builds the matching v8 and v9 operation examples, starts `vite preview` for one example at a time, opens the app in Chromium, and calls a headless browser benchmark API exposed by the example. Sorting, filtering, and aggregation live in separate example directories so a targeted run only builds and launches the relevant pair. Each sample creates a fresh table instance and times the first `table.getRowModel()` call for that scenario. By default, `--pipeline operation` primes the core row model before timing so the measurement is closer to an interactive sort/filter/group action on an existing table. Use `--pipeline full` to include core row construction in the timed section.

The default row-count matrix is `30,000` and `300,000` rows. The performance runner ignores row counts above `300,000` to keep memory pressure from dominating the measurements. Smaller row counts are useful for smoke tests, but sub-millisecond operation timings can produce noisy percentages.

Operation benchmark data is generated once from seeded Faker data into `shared/generated/perfData.json` before the runner builds examples. The fixture is ignored by git and regenerated only when the requested capped row count does not match the existing fixture. Both v8 and v9 examples load the same prebuilt JSON fixture once before reporting benchmark readiness, and each sample reuses cached slices from that array.

Generate the standalone fixture manually before running an operation example directly:

```sh
pnpm generate:performance-data -- --rows 300000
```

Long runs print progress for fixture generation, example builds, preview server startup, each version, and each operation/row-count group.

For aggregation scenarios, the benchmark reads grouped aggregate values inside the timed section so the aggregation functions are actually executed.

Operation benchmark results are written to `results/performance-*.json`, `results/performance-*.csv`, and `results/performance-*.html`.

## Notes

The examples intentionally use the same React, React DOM, TanStack Virtual, Vite, and deterministic data generator. The main intended variable is `@tanstack/react-table` v8 versus v9.

Default sample size is `5` iterations.

Default dimensions:

Rows benchmark:

- `10` rows x `8` columns
- `1,000` rows x `8` columns
- `100,000` rows x `8` columns
- `1,000,000` rows x `8` columns

Paginated rows benchmark:

- `10` rows x `8` columns
- `1,000` rows x `8` columns
- `100,000` rows x `8` columns
- `1,000,000` rows x `8` columns

Kitchen sink benchmark:

- `10` rows x `8` columns
- `1,000` rows x `8` columns
- `100,000` rows x `8` columns
- `1,000,000` rows x `8` columns

Columns benchmark:

- `10` rows x `10` columns
- `100` rows x `100` columns
- `100` rows x `1,000` columns
- `100` rows x `10,000` columns
