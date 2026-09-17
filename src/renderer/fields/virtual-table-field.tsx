import { Box, Table, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { type ReactNode, useEffect, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { FieldProps } from "../../schema/plugin";
import type { Field as FieldDef } from "../../schema/types";
import { virtualTableBlueprintId } from "../../schema/virtual-table-row-spec";
import { useFieldKit } from "../provider";

/** "ready" covers both "nothing to fetch" and "the fetch came back". */
type ResolveStatus = "ready" | "loading" | "error";

/** How many columns the read-only preview draws. The full editor (#731)
 * replaces this component; until then a preview stays inside one row's width
 * rather than growing a Row Spec's worth of columns. */
const PREVIEW_COLUMN_LIMIT = 5;

/**
 * `virtual_table` — the repeating table type, previewed read-only.
 *
 * Its columns are the resolved Row Spec's Fields: `field.children`, whether
 * they were authored there (an **embedded** Row Spec) or put there by
 * `resolveSpec()` from the Blueprint the Field links (ADR-0017). One shape,
 * whichever way the Author declared it — the same thing the Schema builder and
 * the table cell read.
 *
 * A Consumer who skipped `resolveSpec()` gets the Fieldset degrade path: a
 * linked Row Spec is self-resolved here **for display only**, so the preview
 * has headers even though the Schema was built before those Fields existed.
 *
 * This ticket keeps the preview read-only; #731 replaces it with a full editor
 * on anker's `DataTable`.
 */
export function VirtualTableField({
	field,
	readOnly,
}: FieldProps<VirtualTableSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const { config } = field;
	const accessor = config.api_accessor;
	const blueprintAdapter = adapters.blueprint;
	const blueprintId = virtualTableBlueprintId(field);

	// Presence, not length, exactly as a Fieldset reads it: `resolveSpec()`
	// attaches an EMPTY array for a Blueprint with no Fields, and that is a
	// resolved Row Spec — re-fetching it would be the double round-trip
	// resolving exists to avoid.
	const isResolved = field.children != null;
	const needsFetch = !isResolved && !!blueprintAdapter && !!blueprintId;

	const [fetched, setFetched] = useState<FieldDef[] | null>(null);
	// Seeded rather than defaulted to "ready", so the empty-Row-Spec preview
	// does not flash before the first effect runs.
	const [status, setStatus] = useState<ResolveStatus>(() =>
		needsFetch ? "loading" : "ready",
	);

	useEffect(() => {
		if (isResolved || !blueprintAdapter || !blueprintId) return;

		let cancelled = false;
		setStatus("loading");
		blueprintAdapter
			.getSchema(blueprintId)
			.then((fields) => {
				if (cancelled) return;
				setFetched(fields);
				setStatus("ready");
			})
			.catch((error) => {
				if (cancelled) return;
				console.error("Blueprint schema fetch failed:", error);
				setFetched(null);
				setStatus("error");
			});

		// A Blueprint swapped mid-flight must not be overwritten by the
		// previous Blueprint's fields arriving late.
		return () => {
			cancelled = true;
		};
	}, [isResolved, blueprintAdapter, blueprintId]);

	const rowSpec = isResolved ? (field.children ?? []) : (fetched ?? []);
	const columns = rowSpec
		.filter((column) => !column.config.hidden)
		.slice(0, PREVIEW_COLUMN_LIMIT);

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() => {
				if (!isResolved && blueprintId && !blueprintAdapter) {
					return <StatusText>Blueprint adapter not configured</StatusText>;
				}
				if (status === "loading") {
					return <StatusText>Loading table schema...</StatusText>;
				}
				if (status === "error") {
					return <StatusText>Failed to load schema</StatusText>;
				}

				return (
					<Controller
						name={accessor}
						control={control}
						render={({ field: formField }) => {
							const rows: Record<string, unknown>[] = Array.isArray(
								formField.value,
							)
								? formField.value
								: [];

							return (
								<Box>
									<Box overflowX="auto">
										<Table.Root size="sm" variant="outline">
											<Table.Header>
												<Table.Row>
													{columns.map((col) => (
														<Table.ColumnHeader key={col.config.api_accessor}>
															{col.config.name}
														</Table.ColumnHeader>
													))}
													{columns.length === 0 && (
														<Table.ColumnHeader>Data</Table.ColumnHeader>
													)}
												</Table.Row>
											</Table.Header>
											<Table.Body>
												{rows.length === 0 ? (
													<Table.Row>
														<Table.Cell
															colSpan={columns.length || 1}
															textAlign="center"
															color="fg.muted"
														>
															No records
														</Table.Cell>
													</Table.Row>
												) : (
													rows.map((row, idx) => (
														// biome-ignore lint/suspicious/noArrayIndexKey: preview rows are positional; virtual-table records carry no stable id
														<Table.Row key={idx}>
															{columns.map((col) => (
																<Table.Cell key={col.config.api_accessor}>
																	{row[col.config.api_accessor] != null
																		? String(row[col.config.api_accessor])
																		: "—"}
																</Table.Cell>
															))}
															{columns.length === 0 && (
																<Table.Cell>{JSON.stringify(row)}</Table.Cell>
															)}
														</Table.Row>
													))
												)}
											</Table.Body>
										</Table.Root>
									</Box>
									<Text fontSize="xs" color="fg.muted" mt={1}>
										{rows.length} record{rows.length !== 1 ? "s" : ""}
										{readOnly ? " (read only)" : ""}
									</Text>
								</Box>
							);
						}}
					/>
				);
			}}
		</FormField>
	);
}
VirtualTableField.displayName = "VirtualTableField";

function StatusText({ children }: { children: ReactNode }) {
	return (
		<Text color="fg.muted" fontSize="sm">
			{children}
		</Text>
	);
}
StatusText.displayName = "StatusText";
