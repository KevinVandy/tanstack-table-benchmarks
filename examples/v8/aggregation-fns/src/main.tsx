import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  aggregationFns,
  createTable,
  getCoreRowModel,
  getGroupedRowModel,
} from '@tanstack/react-table'
import '../../../../shared/src/styles.css'
import { markBenchReady } from '../../../../shared/src/config'
import { getPerfData, preloadPerfData } from '../../../../shared/src/perfData'
import {
  aggregationScenarios,
  findAggregationScenario,
  stringifyChecksumValue,
  type OperationBenchApi,
  type OperationBenchInput,
  type OperationBenchResult,
} from '../../../../shared/src/perfScenarios'
import type { PerfRow } from '../../../../shared/src/perfTypes'
import '../../../../shared/src/env'

declare global {
  interface Window {
    __TABLE_OPERATION_BENCH__: OperationBenchApi
  }
}

const version = 'v8' as const
const supportedOperation = 'aggregation' as const

function makeChecksumIndexes(length: number) {
  if (length === 0) {
    return []
  }
  return [...new Set([0, Math.floor(length / 2), length - 1])]
}

function checksumAggregates(rows: Array<any>, columnId: string, values: unknown[]) {
  return makeChecksumIndexes(rows.length)
    .map((index) => {
      const row = rows[index]
      return `${index}:${row.id}:${stringifyChecksumValue(values[index])}:${row.subRows.length}`
    })
    .join(';')
}

function createAggregationTable(data: PerfRow[], input: OperationBenchInput) {
  const scenario = findAggregationScenario(input.scenario)

  return createTable<PerfRow>({
    data,
    columns: [
      {
        accessorKey: 'group',
      },
      {
        accessorKey: scenario.columnId,
        aggregationFn: scenario.name,
      },
    ],
    state: {
      grouping: ['group'],
    },
    onStateChange: () => {},
    renderFallbackValue: null,
    autoResetPageIndex: false,
    aggregationFns,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
  } as any)
}

function run(input: OperationBenchInput): OperationBenchResult {
  const data = getPerfData(input.rows)
  const pipeline = input.pipeline ?? 'operation'

  if (input.operation !== supportedOperation) {
    throw new Error(
      `Unsupported operation for ${version} ${supportedOperation} benchmark: ${input.operation}`,
    )
  }

  const scenario = findAggregationScenario(input.scenario)
  const table = createAggregationTable(data, input)
  if (pipeline === 'operation') {
    table.getCoreRowModel()
  }
  const start = performance.now()
  const rowModel = table.getRowModel()
  const aggregateValues = rowModel.rows.map((row) => row.getValue(scenario.columnId))
  const durationMs = performance.now() - start

  return {
    version,
    operation: input.operation,
    scenario: scenario.name,
    rows: input.rows,
    pipeline,
    durationMs,
    outputRows: rowModel.rows.length,
    checksum: checksumAggregates(rowModel.rows, scenario.columnId, aggregateValues),
  }
}

window.__TABLE_OPERATION_BENCH__ = {
  version,
  scenarios: {
    sorting: [],
    filtering: [],
    aggregation: aggregationScenarios.map((scenario) => scenario.name),
  },
  run,
}

function App() {
  React.useEffect(() => {
    preloadPerfData().then(markBenchReady).catch((error) => {
      console.error(error)
    })
  }, [])

  return (
    <div className="app">
      <div className="toolbar">
        <span data-testid="bench-label">v8 aggregation functions</span>
        <span>{aggregationScenarios.length} aggregationFns</span>
      </div>
    </div>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
