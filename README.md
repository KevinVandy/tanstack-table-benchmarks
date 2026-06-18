# TanStack Table Benchmark Examples

Dedicated memory benchmarks for similar TanStack Table v8 and v9 React examples.

Each benchmark is an independent Vite example with its own `package.json`, mirroring the structure of the existing TanStack examples:

- `examples/v8/virtualized-rows`
- `examples/v8/virtualized-columns`
- `examples/v9/virtualized-rows`
- `examples/v9/virtualized-columns`

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
pnpm bench:memory -- --iterations 20 --rows 50000 --columns 1000 --overscan 5
```

The runner builds each independent example, starts `vite preview` for one example at a time, opens it in a fresh Chromium context, forces GC through Chrome DevTools Protocol, and records:

- `JSHeapUsedSize`
- `JSHeapTotalSize`
- DOM document, node, and event listener counts

Results are written to `results/*.json` and `results/*.csv`.

## Notes

The examples intentionally use the same React, React DOM, TanStack Virtual, Vite, and deterministic data generator. The main intended variable is `@tanstack/react-table` v8 versus v9.
