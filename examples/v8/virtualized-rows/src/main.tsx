import React, { useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  type ColumnDef,
  type Row,
  type Table,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  type VirtualItem,
  type Virtualizer,
  useVirtualizer,
} from '@tanstack/react-virtual'
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
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  React.useEffect(markBenchReady, [])

  return (
    <div className="app">
      <div className="toolbar">
        <span data-testid="bench-label">v8 virtualized rows</span>
        <span>{data.length.toLocaleString()} rows</span>
        <button onClick={() => setData(makeData(config.rows))}>Regenerate</button>
      </div>
      <div className="container" data-testid="scroll-container" ref={tableContainerRef}>
        <table style={{ display: 'grid' }}>
          <thead style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} style={{ display: 'flex', width: header.getSize() }}>
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
          <TableBody
            overscan={config.overscan}
            table={table}
            tableContainerRef={tableContainerRef}
          />
        </table>
      </div>
    </div>
  )
}

function TableBody({
  overscan,
  table,
  tableContainerRef,
}: {
  overscan: number
  table: Table<Person>
  tableContainerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { rows } = table.getRowModel()
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => 33,
    getScrollElement: () => tableContainerRef.current,
    measureElement:
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan,
  })

  React.useEffect(() => rowVirtualizer.measure(), [rowVirtualizer])

  return (
    <tbody
      style={{
        display: 'grid',
        height: `${rowVirtualizer.getTotalSize()}px`,
        position: 'relative',
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index] as Row<Person>
        return (
          <TableBodyRow
            key={row.id}
            row={row}
            rowVirtualizer={rowVirtualizer}
            virtualRow={virtualRow}
          />
        )
      })}
    </tbody>
  )
}

function TableBodyRow({
  row,
  rowVirtualizer,
  virtualRow,
}: {
  row: Row<Person>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  virtualRow: VirtualItem
}) {
  return (
    <tr
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      style={{
        display: 'flex',
        position: 'absolute',
        transform: `translateY(${virtualRow.start}px)`,
        width: '100%',
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} style={{ display: 'flex', width: cell.column.getSize() }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
