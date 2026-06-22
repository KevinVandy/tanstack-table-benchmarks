# TanStack Table Benchmark Examples

Dedicated memory benchmarks for similar TanStack Table v8 and v9 React examples.

Each benchmark is an independent Vite example with its own `package.json`, mirroring the structure of the existing TanStack examples:

- `examples/v8/virtualized-rows`
- `examples/v8/virtualized-columns`
- `examples/v8/paginated-rows`
- `examples/v8/kitchen-sink`
- `examples/v9/virtualized-rows`
- `examples/v9/virtualized-columns`
- `examples/v9/paginated-rows`
- `examples/v9/kitchen-sink`

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
