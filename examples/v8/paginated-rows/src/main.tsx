import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import '../../../../shared/src/styles.css'
import { baseColumnDefs } from '../../../../shared/src/baseColumns'
import { markBenchReady, readBenchConfig } from '../../../../shared/src/config'
import { makeData, type Person } from '../../../../shared/src/makeData'
import '../../../../shared/src/env'

const defaults = {
  rows: 50_000,
  columns: baseColumnDefs.length,
  overscan: 5,
}

function App() {
  const config = useMemo(() => readBenchConfig(defaults), [])
  const columns = useMemo<ColumnDef<Person>[]>(
    () =>
      baseColumnDefs.map((column) => ({
        accessorKey: column.accessorKey,
        header: column.header,
        cell: column.cell
          ? (info) => column.cell?.(info.getValue())
          : (info) => String(info.getValue()),
        size: column.size,
      })),
    [],
  )
  const [data, setData] = useState(() => makeData(config.rows))
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  React.useEffect(markBenchReady, [])

  return (
    <div className="app">
      <div className="toolbar">
        <span data-testid="bench-label">v8 paginated rows</span>
        <span>{data.length.toLocaleString()} rows</span>
        <span>{columns.length.toLocaleString()} columns</span>
        <button onClick={() => setData(makeData(config.rows))}>Regenerate</button>
      </div>
      <div className="container">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} style={{ width: header.getSize() }}>
                    <div
                      className={header.column.getCanSort() ? 'sortable-header' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls
          pageIndex={pagination.pageIndex}
          pageCount={table.getPageCount()}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          firstPage={() => table.setPageIndex(0)}
          previousPage={() => table.previousPage()}
          nextPage={() => table.nextPage()}
          lastPage={() => table.setPageIndex(table.getPageCount() - 1)}
        />
      </div>
    </div>
  )
}

function PaginationControls({
  canNextPage,
  canPreviousPage,
  firstPage,
  lastPage,
  nextPage,
  pageCount,
  pageIndex,
  previousPage,
}: {
  canNextPage: boolean
  canPreviousPage: boolean
  firstPage: () => void
  lastPage: () => void
  nextPage: () => void
  pageCount: number
  pageIndex: number
  previousPage: () => void
}) {
  return (
    <div className="toolbar">
      <button
        data-testid="first-page"
        disabled={!canPreviousPage}
        onClick={firstPage}
      >
        {'<<'}
      </button>
      <button
        data-testid="previous-page"
        disabled={!canPreviousPage}
        onClick={previousPage}
      >
        {'<'}
      </button>
      <button data-testid="next-page" disabled={!canNextPage} onClick={nextPage}>
        {'>'}
      </button>
      <button data-testid="last-page" disabled={!canNextPage} onClick={lastPage}>
        {'>>'}
      </button>
      <span>
        Page {(pageIndex + 1).toLocaleString()} of {pageCount.toLocaleString()}
      </span>
    </div>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
