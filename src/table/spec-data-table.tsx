// src/table/spec-data-table.tsx
import { useCallback, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { Schema } from "../schema/types";
import type { FieldTypePlugin } from "../schema/plugin";
import { getCellForFieldType } from "./get-cell-for-type";
import { EditDrawer } from "./edit-drawer";

export interface SpecDataTableProps {
  schema: Schema;
  data: Record<string, unknown>[];
  plugins: FieldTypePlugin[];
  editable?: boolean;
  onRowSave?: (index: number, values: Record<string, unknown>) => void;
  onRowClick?: (index: number, row: Record<string, unknown>) => void;
  additionalColumns?: ColumnDef<Record<string, unknown>>[];
  columnOverrides?: Record<string, Partial<ColumnDef<Record<string, unknown>>>>;
  // Pagination
  pageSize?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  // Sorting
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
}

export function SpecDataTable({
  schema,
  data,
  plugins,
  editable = false,
  onRowSave,
  onRowClick,
  additionalColumns,
  columnOverrides,
  pageSize,
  pageCount,
  onPageChange,
  sorting: controlledSorting,
  onSortingChange,
}: SpecDataTableProps) {
  const [editingRow, setEditingRow] = useState<{
    index: number;
    values: Record<string, unknown>;
  } | null>(null);

  const [internalSorting, setInternalSorting] = useState<SortingState>([]);

  const sorting = controlledSorting ?? internalSorting;

  const handleSortingChange = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      if (onSortingChange) {
        onSortingChange(newSorting);
      } else {
        setInternalSorting(newSorting);
      }
    },
    [sorting, onSortingChange],
  );

  const columns = useMemo(() => {
    let cols = getCellForFieldType(schema, plugins);

    // Apply column overrides
    if (columnOverrides) {
      cols = cols.map((col) => {
        const colId = col.id ?? "";
        const override = columnOverrides[colId];
        if (override) {
          return { ...col, ...override };
        }
        return col;
      });
    }

    // Append additional columns
    if (additionalColumns) {
      cols = [...cols, ...additionalColumns];
    }

    return cols;
  }, [schema, plugins, columnOverrides, additionalColumns]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: {
            pagination: {
              pageSize,
              pageIndex: 0,
            },
          },
        }
      : {}),
    ...(pageCount !== undefined ? { pageCount } : {}),
  });

  const handleRowClick = useCallback(
    (index: number, row: Record<string, unknown>) => {
      if (editable) {
        setEditingRow({ index, values: row });
      }
      onRowClick?.(index, row);
    },
    [editable, onRowClick],
  );

  const handleDrawerClose = useCallback(() => {
    setEditingRow(null);
  }, []);

  const handleDrawerSave = useCallback(
    (values: Record<string, unknown>) => {
      if (editingRow !== null && onRowSave) {
        onRowSave(editingRow.index, values);
      }
      setEditingRow(null);
    },
    [editingRow, onRowSave],
  );

  const isClickable = editable || !!onRowClick;

  return (
    <div data-testid="spec-data-table">
      <table
        role="table"
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px",
        }}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    borderBottom: "2px solid #e2e8f0",
                    fontWeight: 600,
                    color: "#4a5568",
                    cursor: header.column.getCanSort() ? "pointer" : "default",
                    userSelect: "none",
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {header.column.getIsSorted() === "asc"
                    ? " \u2191"
                    : header.column.getIsSorted() === "desc"
                      ? " \u2193"
                      : ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() =>
                handleRowClick(row.index, row.original)
              }
              style={{
                cursor: isClickable ? "pointer" : "default",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    padding: "12px 16px",
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pageSize && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: "14px", color: "#4a5568" }}>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                table.previousPage();
                onPageChange?.(table.getState().pagination.pageIndex - 1);
              }}
              disabled={!table.getCanPreviousPage()}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                backgroundColor: "#fff",
                cursor: table.getCanPreviousPage() ? "pointer" : "not-allowed",
                opacity: table.getCanPreviousPage() ? 1 : 0.5,
              }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                table.nextPage();
                onPageChange?.(table.getState().pagination.pageIndex + 1);
              }}
              disabled={!table.getCanNextPage()}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                backgroundColor: "#fff",
                cursor: table.getCanNextPage() ? "pointer" : "not-allowed",
                opacity: table.getCanNextPage() ? 1 : 0.5,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editable && (
        <EditDrawer
          schema={schema}
          plugins={plugins}
          isOpen={editingRow !== null}
          initialValues={editingRow?.values}
          onClose={handleDrawerClose}
          onSave={handleDrawerSave}
          title="Edit Row"
        />
      )}
    </div>
  );
}
SpecDataTable.displayName = "SpecDataTable";
