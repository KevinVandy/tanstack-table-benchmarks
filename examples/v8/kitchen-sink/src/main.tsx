import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type VisibilityState,
  type ExpandedState,
  type GroupingState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import "../../../../shared/src/styles.css";
import { markBenchReady, readBenchConfig } from "../../../../shared/src/config";
import { makeData, type Person } from "../../../../shared/src/makeData";
import "../../../../shared/src/env";

const defaults = {
  rows: 50_000,
  columns: 8,
  overscan: 5,
};

function App() {
  const config = useMemo(() => readBenchConfig(defaults), []);
  const columns = useMemo<ColumnDef<Person>[]>(
    () => [
      {
        id: "select",
        size: 60,
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <input
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            type="checkbox"
          />
        ),
        cell: ({ row }) => (
          <input
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            type="checkbox"
          />
        ),
      },
      {
        header: "Name",
        columns: [
          {
            accessorKey: "firstName",
            header: "First Name",
            size: 130,
            cell: (info) => String(info.getValue()),
          },
          {
            accessorKey: "lastName",
            header: "Last Name",
            size: 130,
            cell: (info) => String(info.getValue()),
          },
        ],
      },
      {
        header: "Info",
        columns: [
          {
            accessorKey: "age",
            aggregationFn: "median",
            header: "Age",
            size: 60,
          },
          {
            accessorKey: "visits",
            aggregationFn: "sum",
            header: "Visits",
            size: 80,
          },
          {
            accessorKey: "status",
            header: "Status",
            size: 130,
          },
          {
            accessorKey: "progress",
            aggregationFn: "mean",
            header: "Progress",
            size: 100,
          },
          {
            accessorKey: "createdAt",
            header: "Created At",
            size: 120,
            cell: (info) =>
              (info.getValue() as Date).toISOString().slice(0, 10),
          },
        ],
      },
    ],
    [],
  );
  const [data, setData] = useState(() => makeData(config.rows));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: ["select"],
    right: [],
  });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      columnPinning,
      columnSizing,
      columnVisibility,
      expanded,
      globalFilter,
      grouping,
      pagination,
      rowSelection,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setGlobalFilter,
    onGroupingChange: setGrouping,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  React.useEffect(markBenchReady, []);

  return (
    <div className="app">
      <div className="toolbar">
        <span data-testid="bench-label">v8 kitchen sink</span>
        <span>{data.length.toLocaleString()} rows</span>
        <span>{table.getAllLeafColumns().length.toLocaleString()} columns</span>
        <button onClick={() => setData(makeData(config.rows))}>
          Regenerate
        </button>
      </div>
      <div className="container">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort() ? "sortable-header" : ""
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
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
  );
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
  canNextPage: boolean;
  canPreviousPage: boolean;
  firstPage: () => void;
  lastPage: () => void;
  nextPage: () => void;
  pageCount: number;
  pageIndex: number;
  previousPage: () => void;
}) {
  return (
    <div className="toolbar">
      <button
        data-testid="first-page"
        disabled={!canPreviousPage}
        onClick={firstPage}
      >
        {"<<"}
      </button>
      <button
        data-testid="previous-page"
        disabled={!canPreviousPage}
        onClick={previousPage}
      >
        {"<"}
      </button>
      <button
        data-testid="next-page"
        disabled={!canNextPage}
        onClick={nextPage}
      >
        {">"}
      </button>
      <button
        data-testid="last-page"
        disabled={!canNextPage}
        onClick={lastPage}
      >
        {">>"}
      </button>
      <span>
        Page {(pageIndex + 1).toLocaleString()} of {pageCount.toLocaleString()}
      </span>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find root element");
}

ReactDOM.createRoot(rootElement).render(<App />);
