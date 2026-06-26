import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  sortingFns,
} from '@tanstack/react-table'
import '../../../../shared/src/styles.css'
import { markBenchReady } from '../../../../shared/src/config'
import { getPerfData, preloadPerfData } from '../../../../shared/src/perfData'
import {
  findSortingScenario,
  sortingScenarios,
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
const supportedOperation = 'sorting' as const

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

function createSortingTable(data: PerfRow[], input: OperationBenchInput) {
  const scenario = findSortingScenario(input.scenario)

  return createTable<PerfRow>({
    data,
    columns: [
      {
        accessorKey: scenario.columnId,
        sortingFn: scenario.name,
      },
    ],
    state: {
      sorting: [
        {
          id: scenario.columnId,
          desc: input.direction === 'desc',
        },
      ],
    },
    onStateChange: () => {},
    renderFallbackValue: null,
    autoResetPageIndex: false,
    sortingFns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  const scenario = findSortingScenario(input.scenario)
  const table = createSortingTable(data, input)
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
    direction: input.direction,
    pipeline,
    durationMs,
    outputRows: rowModel.rows.length,
    checksum: checksumRows(rowModel.rows, scenario.columnId),
  }
}

window.__TABLE_OPERATION_BENCH__ = {
  version,
  scenarios: {
    sorting: sortingScenarios.map((scenario) => scenario.name),
    filtering: [],
    aggregation: [],
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
        <span data-testid="bench-label">v8 sorting functions</span>
        <span>{sortingScenarios.length} sortFns</span>
      </div>
    </div>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
