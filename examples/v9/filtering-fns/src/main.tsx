import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  columnFilteringFeature,
  constructTable,
  createCoreRowModel,
  createFilteredRowModel,
  filterFns,
  tableFeatures,
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import '../../../../shared/src/styles.css'
import { markBenchReady } from '../../../../shared/src/config'
import { getPerfData, preloadPerfData } from '../../../../shared/src/perfData'
import {
  filteringScenarios,
  findFilteringScenario,
  getFilterValue,
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

const version = 'v9' as const
const supportedOperation = 'filtering' as const

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  columnFilteringFeature,
  coreRowModel: createCoreRowModel(),
  filteredRowModel: createFilteredRowModel(),
  filterFns,
})

function makeChecksumIndexes(length: number) {
  if (length === 0) {
    return []
  }
  return [...new Set([0, Math.floor(length / 2), length - 1])]
}

function checksumRows(rows: Array<any>, columnId: string) {
  return makeChecksumIndexes(rows.length)
    .map((index) => {
      const row = rows[index]
      return `${index}:${row.original.id}:${stringifyChecksumValue(row.getValue(columnId))}`
    })
    .join(';')
}

function createFilteringTable(data: PerfRow[], input: OperationBenchInput) {
  const scenario = findFilteringScenario(version, input.scenario)

  return constructTable({
    features,
    data,
    columns: [
      {
        accessorKey: scenario.columnId,
        filterFn: scenario.name,
      },
    ],
    initialState: {
      columnFilters: [
        {
          id: scenario.columnId,
          value: getFilterValue(version, scenario.name),
        },
      ],
    },
    autoResetPageIndex: false,
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

  const scenario = findFilteringScenario(version, input.scenario)
  const table = createFilteringTable(data, input)
  if (pipeline === 'operation') {
    table.getCoreRowModel()
  }
  const start = performance.now()
  const rowModel = table.getRowModel()
  const durationMs = performance.now() - start

  return {
    version,
    operation: input.operation,
    scenario: scenario.name,
    rows: input.rows,
    pipeline,
    durationMs,
    outputRows: rowModel.rows.length,
    checksum: checksumRows(rowModel.rows, scenario.columnId),
  }
}

window.__TABLE_OPERATION_BENCH__ = {
  version,
  scenarios: {
    sorting: [],
    filtering: filteringScenarios.map((scenario) => scenario.name),
    aggregation: [],
    v9OnlyFiltering: filteringScenarios
      .filter((scenario) => scenario.v9Only)
      .map((scenario) => scenario.name),
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
        <span data-testid="bench-label">v9 filtering functions</span>
        <span>{filteringScenarios.length} filterFns</span>
      </div>
    </div>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
