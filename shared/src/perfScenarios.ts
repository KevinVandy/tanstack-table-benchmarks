import type { PerfRow } from './perfTypes.js'

export type TableVersion = 'v8' | 'v9'
export type OperationKind = 'sorting' | 'filtering' | 'aggregation'
export type SortDirection = 'asc' | 'desc'
export type PipelineMode = 'operation' | 'full'

export interface SortingScenario {
  columnId: keyof PerfRow
  name: string
}

export interface FilteringScenario {
  columnId: keyof PerfRow
  name: string
  v8Only?: boolean
  v9Only?: boolean
}

export interface AggregationScenario {
  columnId: keyof PerfRow
  name: string
}

export interface OperationBenchInput {
  operation: OperationKind
  scenario: string
  rows: number
  direction?: SortDirection
  pipeline?: PipelineMode
}

export interface OperationBenchResult {
  version: TableVersion
  operation: OperationKind
  scenario: string
  rows: number
  direction?: SortDirection
  pipeline: PipelineMode
  durationMs: number
  outputRows: number
  checksum: string
}

export interface OperationBenchApi {
  version: TableVersion
  scenarios: {
    sorting: string[]
    filtering: string[]
    aggregation: string[]
    v9OnlyFiltering?: string[]
  }
  run: (input: OperationBenchInput) => OperationBenchResult
}

export const sortingScenarios = [
  { name: 'alphanumeric', columnId: 'alphanumeric' },
  { name: 'alphanumericCaseSensitive', columnId: 'caseAlphanumeric' },
  { name: 'text', columnId: 'text' },
  { name: 'textCaseSensitive', columnId: 'caseText' },
  { name: 'datetime', columnId: 'createdAt' },
  { name: 'basic', columnId: 'score' },
] satisfies SortingScenario[]

export const filteringScenarios = [
  { name: 'includesString', columnId: 'text' },
  { name: 'includesStringSensitive', columnId: 'caseText' },
  { name: 'equalsString', columnId: 'status' },
  { name: 'arrIncludes', columnId: 'tags' },
  { name: 'arrIncludesAll', columnId: 'tags' },
  { name: 'arrIncludesSome', columnId: 'tags' },
  { name: 'equals', columnId: 'bucketNumber' },
  { name: 'weakEquals', columnId: 'bucketNumber' },
  { name: 'inNumberRange', columnId: 'score' },
  { name: 'arrHas', columnId: 'status', v9Only: true },
  { name: 'between', columnId: 'score', v9Only: true },
  { name: 'betweenInclusive', columnId: 'score', v9Only: true },
] satisfies FilteringScenario[]

export const aggregationScenarios = [
  { name: 'sum', columnId: 'score' },
  { name: 'min', columnId: 'score' },
  { name: 'max', columnId: 'score' },
  { name: 'extent', columnId: 'score' },
  { name: 'mean', columnId: 'score' },
  { name: 'median', columnId: 'score' },
  { name: 'unique', columnId: 'status' },
  { name: 'uniqueCount', columnId: 'status' },
  { name: 'count', columnId: 'id' },
] satisfies AggregationScenario[]

export const findSortingScenario = (name: string) => {
  const scenario = sortingScenarios.find((item) => item.name === name)
  if (!scenario) {
    throw new Error(`Unknown sorting scenario: ${name}`)
  }
  return scenario
}

export const findFilteringScenario = (
  version: TableVersion,
  name: string,
) => {
  const scenario = filteringScenarios.find((item) => item.name === name)
  if (!scenario || (scenario.v9Only && version === 'v8')) {
    throw new Error(`Unknown filtering scenario for ${version}: ${name}`)
  }
  return scenario
}

export const findAggregationScenario = (name: string) => {
  const scenario = aggregationScenarios.find((item) => item.name === name)
  if (!scenario) {
    throw new Error(`Unknown aggregation scenario: ${name}`)
  }
  return scenario
}

export function getFilterValue(version: TableVersion, name: string) {
  switch (name) {
    case 'includesString':
      return 'ada'
    case 'includesStringSensitive':
      return 'Ada'
    case 'equalsString':
      return 'single'
    case 'arrIncludes':
      return version === 'v8' ? 'tag-3' : ['tag-3']
    case 'arrIncludesAll':
      return ['tag-1', 'tag-2']
    case 'arrIncludesSome':
      return ['tag-0', 'tag-4']
    case 'equals':
      return 42
    case 'weakEquals':
      return '42'
    case 'inNumberRange':
      return [1_000, 20_000]
    case 'arrHas':
      return ['single', 'relationship']
    case 'between':
    case 'betweenInclusive':
      return [25_000, 50_000]
    default:
      throw new Error(`Missing filter value for scenario: ${name}`)
  }
}

export function stringifyChecksumValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyChecksumValue(item)).join('|')}]`
  }
  if (typeof value === 'number') {
    return Number(value.toFixed(4)).toString()
  }
  return String(value)
}
