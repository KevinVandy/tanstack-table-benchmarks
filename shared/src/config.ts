export interface BenchConfig {
  rows: number
  columns: number
  overscan: number
}

const readPositiveInt = (
  params: URLSearchParams,
  key: string,
  fallback: number,
) => {
  const value = Number(params.get(key))
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export function readBenchConfig(defaults: BenchConfig): BenchConfig {
  const params = new URLSearchParams(window.location.search)

  return {
    rows: readPositiveInt(params, 'rows', defaults.rows),
    columns: readPositiveInt(params, 'columns', defaults.columns),
    overscan: readPositiveInt(params, 'overscan', defaults.overscan),
  }
}

export function markBenchReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__TABLE_BENCH_READY__ = true
    })
  })
}
