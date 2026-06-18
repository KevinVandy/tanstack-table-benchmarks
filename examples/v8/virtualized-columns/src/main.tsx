import React, { useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  type Cell,
  type ColumnDef,
  type Header,
  type HeaderGroup,
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
import { markBenchReady, readBenchConfig } from '../../../../shared/src/config'
import { makeColumnKeys, makeWideData, type Person } from '../../../../shared/src/makeData'
import '../../../../shared/src/env'

const defaults = {
  rows: 1_000,
  columns: 1_000,
  overscan: 3,
}

function App() {
  const config = useMemo(() => readBenchConfig(defaults), [])
  const columnKeys = useMemo(() => makeColumnKeys(config.columns), [config.columns])
  const columns = useMemo<ColumnDef<Person>[]>(
    () =>
      columnKeys.map((key, index) => ({
        accessorKey: key,
        header: `Column ${index}`,
        cell: (info) => String(info.getValue()),
        size: 120,
      })),
    [columnKeys],
  )
  const [data, setData] = useState(() => makeWideData(config.rows, config.columns))
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
        <span data-testid="bench-label">v8 virtualized columns</span>
        <span>{data.length.toLocaleString()} rows</span>
        <span>{columns.length.toLocaleString()} columns</span>
        <button onClick={() => setData(makeWideData(config.rows, config.columns))}>
          Regenerate
        </button>
      </div>
      <TableContainer overscan={config.overscan} table={table} />
    </div>
  )
}

function TableContainer({ overscan, table }: { overscan: number; table: Table<Person> }) {
  const visibleColumns = table.getVisibleLeafColumns()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const columnVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableCellElement>({
    count: visibleColumns.length,
    estimateSize: (index) => visibleColumns[index].getSize(),
    getScrollElement: () => tableContainerRef.current,
    horizontal: true,
    overscan,
  })
  const virtualColumns = columnVirtualizer.getVirtualItems()
  const virtualPaddingLeft = virtualColumns[0]?.start
  const virtualPaddingRight = virtualColumns.length
    ? columnVirtualizer.getTotalSize() - virtualColumns[virtualColumns.length - 1].end
    : undefined

  return (
    <div className="container" data-testid="scroll-container" ref={tableContainerRef}>
      <table style={{ display: 'grid' }}>
        <TableHead
          columnVirtualizer={columnVirtualizer}
          table={table}
          virtualPaddingLeft={virtualPaddingLeft}
          virtualPaddingRight={virtualPaddingRight}
        />
        <TableBody
          columnVirtualizer={columnVirtualizer}
          overscan={overscan}
          table={table}
          tableContainerRef={tableContainerRef}
          virtualPaddingLeft={virtualPaddingLeft}
          virtualPaddingRight={virtualPaddingRight}
        />
      </table>
    </div>
  )
}

function TableHead({
  columnVirtualizer,
  table,
  virtualPaddingLeft,
  virtualPaddingRight,
}: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  table: Table<Person>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
}) {
  return (
    <thead style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableHeadRow
          columnVirtualizer={columnVirtualizer}
          headerGroup={headerGroup}
          key={headerGroup.id}
          virtualPaddingLeft={virtualPaddingLeft}
          virtualPaddingRight={virtualPaddingRight}
        />
      ))}
    </thead>
  )
}

function TableHeadRow({
  columnVirtualizer,
  headerGroup,
  virtualPaddingLeft,
  virtualPaddingRight,
}: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  headerGroup: HeaderGroup<Person>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
}) {
  const virtualColumns = columnVirtualizer.getVirtualItems()

  return (
    <tr style={{ display: 'flex', width: '100%' }}>
      {virtualPaddingLeft ? <th style={{ display: 'flex', width: virtualPaddingLeft }} /> : null}
      {virtualColumns.map((virtualColumn) => {
        const header = headerGroup.headers[virtualColumn.index]
        return <TableHeadCell header={header} key={header.id} />
      })}
      {virtualPaddingRight ? (
        <th style={{ display: 'flex', width: virtualPaddingRight }} />
      ) : null}
    </tr>
  )
}

function TableHeadCell({ header }: { header: Header<Person, unknown> }) {
  return (
    <th style={{ display: 'flex', width: header.getSize() }}>
      {flexRender(header.column.columnDef.header, header.getContext())}
    </th>
  )
}

function TableBody({
  columnVirtualizer,
  overscan,
  table,
  tableContainerRef,
  virtualPaddingLeft,
  virtualPaddingRight,
}: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  overscan: number
  table: Table<Person>
  tableContainerRef: React.RefObject<HTMLDivElement | null>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
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
            columnVirtualizer={columnVirtualizer}
            key={row.id}
            row={row}
            rowVirtualizer={rowVirtualizer}
            virtualPaddingLeft={virtualPaddingLeft}
            virtualPaddingRight={virtualPaddingRight}
            virtualRow={virtualRow}
          />
        )
      })}
    </tbody>
  )
}

function TableBodyRow({
  columnVirtualizer,
  row,
  rowVirtualizer,
  virtualPaddingLeft,
  virtualPaddingRight,
  virtualRow,
}: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  row: Row<Person>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
  virtualRow: VirtualItem
}) {
  const visibleCells = row.getVisibleCells()
  const virtualColumns = columnVirtualizer.getVirtualItems()

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
      {virtualPaddingLeft ? <td style={{ display: 'flex', width: virtualPaddingLeft }} /> : null}
      {virtualColumns.map((virtualColumn) => {
        const cell = visibleCells[virtualColumn.index]
        return <TableBodyCell cell={cell} key={cell.id} />
      })}
      {virtualPaddingRight ? (
        <td style={{ display: 'flex', width: virtualPaddingRight }} />
      ) : null}
    </tr>
  )
}

function TableBodyCell({ cell }: { cell: Cell<Person, unknown> }) {
  return (
    <td style={{ display: 'flex', width: cell.column.getSize() }}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find root element')
}

ReactDOM.createRoot(rootElement).render(<App />)
