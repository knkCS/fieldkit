// src/table/get-cell-for-type.tsx
import type { ColumnDef } from "@tanstack/react-table";
import { FieldErrorBoundary } from "../renderer/field-error-boundary";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";

/**
 * Generates TanStack Table ColumnDef[] from a Schema and plugins.
 *
 * Skips section (structural) fields and hidden fields.
 * Uses plugin cellComponent when available, otherwise falls back to
 * simple string rendering.
 */
export function getCellForFieldType(
	schema: Schema,
	plugins: FieldTypePlugin[],
): ColumnDef<Record<string, unknown>>[] {
	const pluginMap = new Map(plugins.map((p) => [p.id, p]));

	return schema
		.filter((field) => {
			// Skip section fields (structural only, no data)
			if (field.field_type === "section") return false;
			// Skip hidden fields
			if (field.config.hidden) return false;
			return true;
		})
		.map((field) => {
			const plugin = pluginMap.get(field.field_type);
			const CellComponent = plugin?.cellComponent;

			return {
				id: field.config.api_accessor,
				accessorKey: field.config.api_accessor,
				header: field.config.name,
				cell: CellComponent
					? ({ getValue }) => {
							const value = getValue();
							return (
								<FieldErrorBoundary fieldId={field.config.api_accessor}>
									<CellComponent field={field} value={value} />
								</FieldErrorBoundary>
							);
						}
					: ({ getValue }) => {
							const value = getValue();
							return <span>{value != null ? String(value) : ""}</span>;
						},
			} satisfies ColumnDef<Record<string, unknown>>;
		});
}
