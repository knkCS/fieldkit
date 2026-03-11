// src/table/spec-data-table.tsx

import { DataTable } from "@knkcs/anker/components";
import type {
	ColumnDef,
	OnChangeFn,
	RowSelectionState,
	SortingState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { EditDrawer } from "./edit-drawer";
import { getCellForFieldType } from "./get-cell-for-type";

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
	// New props from DataTable
	variant?: "line" | "striped" | "hoverable";
	selectable?: boolean;
	rowSelection?: RowSelectionState;
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;
	loading?: boolean;
	emptyState?: React.ReactNode;
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
	variant,
	selectable,
	rowSelection,
	onRowSelectionChange,
	loading,
	emptyState,
}: SpecDataTableProps) {
	const [editingRow, setEditingRow] = useState<{
		index: number;
		values: Record<string, unknown>;
	} | null>(null);

	const [internalSorting, setInternalSorting] = useState<SortingState>([]);

	const sorting = controlledSorting ?? internalSorting;

	const handleSortingChange: OnChangeFn<SortingState> = useCallback(
		(updater) => {
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

	const columns = useMemo((): ColumnDef<Record<string, unknown>>[] => {
		let cols: ColumnDef<Record<string, unknown>>[] = getCellForFieldType(
			schema,
			plugins,
		);

		// Apply column overrides
		if (columnOverrides) {
			cols = cols.map((col) => {
				const colId = (col as { id?: string }).id ?? "";
				const override = columnOverrides[colId];
				if (override) {
					return { ...col, ...override } as ColumnDef<Record<string, unknown>>;
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

	const [internalPage, setInternalPage] = useState(1);

	const handleRowClick = useCallback(
		(row: Record<string, unknown>) => {
			const index = data.indexOf(row);
			if (editable) {
				setEditingRow({ index, values: row });
			}
			onRowClick?.(index, row);
		},
		[data, editable, onRowClick],
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

	// Compute pagination for DataTable from client-side pagination params
	const currentPage = internalPage;
	const total = pageCount ? pageCount * (pageSize ?? 1) : data.length;

	const handlePageChange = useCallback(
		(page: number) => {
			setInternalPage(page);
			onPageChange?.(page);
		},
		[onPageChange],
	);

	// Slice data for client-side pagination
	const paginatedData = useMemo(() => {
		if (!pageSize) return data;
		const start = (currentPage - 1) * pageSize;
		return data.slice(start, start + pageSize);
	}, [data, pageSize, currentPage]);

	return (
		<div data-testid="spec-data-table">
			<DataTable
				columns={columns}
				data={paginatedData}
				sorting={sorting}
				onSortingChange={handleSortingChange}
				onRowClick={isClickable ? handleRowClick : undefined}
				variant={variant}
				selectable={selectable}
				rowSelection={rowSelection}
				onRowSelectionChange={onRowSelectionChange}
				loading={loading}
				emptyState={emptyState}
				{...(pageSize
					? {
							total,
							page: currentPage,
							pageSize,
							onPageChange: handlePageChange,
						}
					: {})}
			/>

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
