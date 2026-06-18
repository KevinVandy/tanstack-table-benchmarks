import React, { useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  useTable,
} from '@tanstack/react-table'
import type { ReactTable, Row } from '@tanstack/react-table'
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

const features = {
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
}

const columnHelper = createColumnHelper<typeof features, Person>()

const defaults = {
  rows: 50_000,
  columns: baseColumnDefs.length,
  overscan: 5,
}

function App() {
  const config = useMemo(() => readBenchConfig(defaults), [])
  const columns = useMemo(
    () =>
      columnHelper.columns(
        baseColumnDefs.map((column) =>
          columnHelper.accessor(column.accessorKey, {
            header: column.header,
            cell: column.cell
              ? (info) => column.cell?.(info.getValue())
              : (info) => String(info.getValue()),
            size: column.size,
          }),
        ),
      ),
    [],
  )
  const [data, setData] = useState(() => makeData(config.rows))
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const table = useTable({ features, columns, data }, (state) => state)

  React.useEffect(markBenchReady, [])

  return (
    <div className="app">
      <div className="toolbar">
        <span data-testid="bench-label">v9 virtualized rows</span>
        <span>{data.length.toLocaleString()} rows</span>
        <button onClick={() => setData(makeData(config.rows))}>Regenerate</button>
      </div>
      <div className="container" data-testid="scroll-container" ref={tableContainerRef}>
        <table style={{ display: 'grid' }}>
          <thead
            style={{
              display: 'grid',
              height: '34px',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                style={{ display: 'flex', height: '34px', width: '100%' }}
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      height: '34px',
                      width: header.getSize(),
                    }}
                  >
                    <div
                      className={header.column.getCanSort() ? 'sortable-header' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
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
  table: ReactTable<typeof features, Person>
  tableContainerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { rows } = table.getRowModel()
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => 33,
    getScrollElement: () => tableContainerRef.current,
    measureElement:
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element.getBoundingClientRect().height
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
        const row = rows[virtualRow.index]
        return (
          <TableBodyRow
            key={row.id}
            row={row}
            rowVirtualizer={rowVirtualizer}
            table={table}
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
  table,
  virtualRow,
}: {
  row: Row<typeof features, Person>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  table: ReactTable<typeof features, Person>
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
      {row.getAllCells().map((cell) => (
        <td key={cell.id} style={{ display: 'flex', width: cell.column.getSize() }}>
          <table.FlexRender cell={cell} />
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
