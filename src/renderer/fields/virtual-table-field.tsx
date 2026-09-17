import { Box, Button, Flex, IconButton, Stack, Text } from "@chakra-ui/react";
import { DataTable } from "@knkcs/anker/components";
import { FormField } from "@knkcs/anker/forms";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	useFieldArray,
	useFormContext,
	useFormState,
	useWatch,
} from "react-hook-form";
import { linkedBlueprintId } from "../../schema/blueprint-link";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { FieldProps } from "../../schema/plugin";
import type { Field as FieldDef } from "../../schema/types";
import { getCellForFieldType } from "../../table/get-cell-for-type";
import { useFieldKit } from "../provider";
import { VirtualTableRowDrawer } from "./virtual-table-row-drawer";
import {
	absoluteRowIndex,
	clampPage,
	pageCount,
	pageOfRows,
	rowErrorMessages,
	rowsPerPage,
} from "./virtual-table-rows";

/** One empty array for every Field whose value is not one yet, so a table with
 * nothing stored does not hand `DataTable` a new `data` array each render. */
const NO_ROWS: Record<string, unknown>[] = [];

/** "ready" covers both "nothing to fetch" and "the fetch came back". */
type ResolveStatus = "ready" | "loading" | "error";

/** Which row the drawer is editing: a position in the array, or `null` for a
 * row being added — one that has no position until it is saved. */
type RowDraft = { index: number | null };

/**
 * `virtual_table` — the repeating table type, edited as a table.
 *
 * Its columns are the resolved Row Spec's Fields: `field.children`, whether
 * they were authored there (an **embedded** Row Spec) or put there by
 * `resolveSpec()` from the Blueprint the Field links (ADR-0017). One shape,
 * whichever way the Author declared it — the same thing the Schema builder and
 * the table cell read.
 *
 * A Consumer who skipped `resolveSpec()` gets the Fieldset degrade path: a
 * linked Row Spec is self-resolved here **for display only**, so the table has
 * columns even though the Schema was built before those Fields existed.
 *
 * Rows are added and edited in a drawer, never inline: a Row Spec column is a
 * Field with its own control, its own validation and its own drawer of its own
 * (a media picker), and a table cell is one row of height.
 */
export function VirtualTableField({
	field,
	readOnly,
}: FieldProps<VirtualTableSettings>) {
	const { adapters } = useFieldKit();
	const { config } = field;
	const accessor = config.api_accessor;
	const blueprintAdapter = adapters.blueprint;
	const blueprintId = linkedBlueprintId(field);

	// Presence, not length, exactly as a Fieldset reads it: `resolveSpec()`
	// attaches an EMPTY array for a Blueprint with no Fields, and that is a
	// resolved Row Spec — re-fetching it would be the double round-trip
	// resolving exists to avoid.
	const isResolved = field.children != null;
	const needsFetch = !isResolved && !!blueprintAdapter && !!blueprintId;

	const [fetched, setFetched] = useState<FieldDef[] | null>(null);
	// Seeded rather than defaulted to "ready", so the empty-Row-Spec table does
	// not flash before the first effect runs.
	const [status, setStatus] = useState<ResolveStatus>(() =>
		needsFetch ? "loading" : "ready",
	);

	useEffect(() => {
		// Nothing to fetch — and that includes a Blueprint the Author has just
		// cleared, so the columns and the status from the previous one go with
		// it rather than sitting on screen under a Field that no longer names
		// it.
		if (isResolved || !blueprintAdapter || !blueprintId) {
			setFetched(null);
			setStatus("ready");
			return;
		}

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

	const resolvedChildren = field.children;
	const rowSpec = useMemo(
		() =>
			(isResolved ? (resolvedChildren ?? []) : (fetched ?? [])).filter(
				(column) => !column.config.hidden,
			),
		[isResolved, resolvedChildren, fetched],
	);

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
					<VirtualTableEditor
						field={field}
						rowSpec={rowSpec}
						readOnly={readOnly}
					/>
				);
			}}
		</FormField>
	);
}
VirtualTableField.displayName = "VirtualTableField";

interface VirtualTableEditorProps {
	field: FieldDef<VirtualTableSettings>;
	/** The resolved Row Spec, hidden columns already dropped. */
	rowSpec: FieldDef[];
	readOnly?: boolean;
}

/**
 * The table itself, once there is a Row Spec to draw it from.
 *
 * Everything it shows comes out of the Field's own array value in the form the
 * Consumer owns — no adapter fetch, no page request — so paging is a slice and
 * every edit is a write into that array.
 */
function VirtualTableEditor({
	field,
	rowSpec,
	readOnly,
}: VirtualTableEditorProps) {
	const { control, trigger } = useFormContext();
	const { getAllPlugins } = useFieldKit();
	const accessor = field.config.api_accessor;
	const settings = field.settings;

	// `useFieldArray` for the writes, `useWatch` for the values: the array's
	// own `fields` carry a react-hook-form key that is not part of a row, and
	// a row here is exactly what the Consumer stores.
	const { append, move, remove, update } = useFieldArray({
		control,
		name: accessor,
	});
	const watched = useWatch({ control, name: accessor });
	const rows: Record<string, unknown>[] = Array.isArray(watched)
		? watched
		: NO_ROWS;

	const { errors, isSubmitted } = useFormState({ control, name: accessor });

	const pageSize = rowsPerPage(settings?.max_records_per_page);
	const [requestedPage, setRequestedPage] = useState(1);
	const page = clampPage(requestedPage, rows.length, pageSize);
	const pageRows = useMemo(
		() => pageOfRows(rows, page, pageSize),
		[rows, page, pageSize],
	);

	const [draft, setDraft] = useState<RowDraft | null>(null);

	const rowIndexOf = useCallback(
		(indexOnPage: number) =>
			absoluteRowIndex(indexOnPage, page, pageSize, rows.length),
		[page, pageSize, rows.length],
	);

	const messagesFor = useCallback(
		(index: number) => rowErrorMessages(errors, accessor, index),
		[errors, accessor],
	);

	const hasRowErrors = rows.some(
		(_row, index) => Object.keys(messagesFor(index)).length > 0,
	);

	const rowFieldNames = useMemo(() => {
		const names = new Map<string, string>();
		for (const rowField of rowSpec) {
			names.set(rowField.config.api_accessor, rowField.config.name);
		}
		return names;
	}, [rowSpec]);

	const canAdd =
		!readOnly &&
		(settings?.max_items === undefined || rows.length < settings.max_items);
	const canRemove =
		!readOnly &&
		(settings?.min_items === undefined || rows.length > settings.min_items);

	// A write leaves the form's errors describing the row as it was. Only a
	// form that has already been submitted has errors worth re-running: doing
	// it on an untouched one would report every empty required column before
	// the Author ever tried to save.
	const revalidate = useCallback(() => {
		if (isSubmitted) void trigger(accessor);
	}, [isSubmitted, trigger, accessor]);

	const saveDraft = useCallback(
		(values: Record<string, unknown>) => {
			if (draft?.index == null) {
				append(values);
				// A row appended to a full page lands on the next one. Following
				// it there is the difference between adding a row and watching a
				// table not change.
				setRequestedPage(pageCount(rows.length + 1, pageSize));
			} else {
				update(draft.index, values);
			}
			setDraft(null);
			revalidate();
		},
		[draft, append, update, revalidate, rows.length, pageSize],
	);

	const deleteRow = useCallback(
		(index: number) => {
			remove(index);
			revalidate();
		},
		[remove, revalidate],
	);

	/**
	 * A row dragged to a new place in the table, written into the array.
	 *
	 * anker reports both indices against the `data` it was handed, which here
	 * is one page of the array — so each one is translated back to its place in
	 * the whole before the move is applied. A drag cannot leave the page it
	 * started on (anker documents the limit), so both translations use the same
	 * page and the move stays inside it.
	 */
	const reorderRow = useCallback(
		(fromIndexOnPage: number, toIndexOnPage: number) => {
			const from = rowIndexOf(fromIndexOnPage);
			const to = rowIndexOf(toIndexOnPage);
			if (from === to) return;
			move(from, to);
			// The messages standing against the rows are keyed by position, and
			// two of those positions now hold different rows.
			revalidate();
		},
		[rowIndexOf, move, revalidate],
	);

	const columns = useMemo((): ColumnDef<Record<string, unknown>>[] => {
		// Sorting is off on every column: the rows are a stored, ordered array
		// — a Consumer reads row 3 as the third line of the order — and a
		// header that reordered what is on screen would say otherwise without
		// changing anything. The order is changed by dragging a row, which
		// anker only reports correctly on an unsorted table.
		const cols: ColumnDef<Record<string, unknown>>[] = getCellForFieldType(
			rowSpec,
			getAllPlugins(),
		).map((col) => ({ ...col, enableSorting: false }));

		if (hasRowErrors) {
			// Underscored, as anker underscores its own `_select`: a Row Spec
			// Accessor is a backend field name, which these cannot collide with.
			cols.unshift({
				id: "_row_error",
				header: "Issue",
				enableSorting: false,
				cell: ({ row }) => {
					const messages = messagesFor(rowIndexOf(row.index));
					const text = Object.entries(messages)
						.map(([accessor, message]) =>
							accessor === ""
								? message
								: `${rowFieldNames.get(accessor) ?? accessor}: ${message}`,
						)
						.join("; ");
					if (text === "") return null;
					return (
						<Text
							fontSize="xs"
							color="fg.error"
							data-testid="virtual-table-row-error"
						>
							{text}
						</Text>
					);
				},
			});
		}

		if (!readOnly) {
			cols.push({
				id: "_actions",
				header: "Actions",
				enableSorting: false,
				cell: ({ row }) => {
					const index = rowIndexOf(row.index);
					return (
						<Flex gap="1" justify="flex-end">
							<IconButton
								aria-label={`Edit row ${String(index + 1)}`}
								size="xs"
								variant="ghost"
								onClick={() => setDraft({ index })}
							>
								<Pencil size={14} aria-hidden="true" />
							</IconButton>
							{canRemove && (
								<IconButton
									aria-label={`Delete row ${String(index + 1)}`}
									size="xs"
									variant="ghost"
									onClick={() => deleteRow(index)}
								>
									<Trash2 size={14} aria-hidden="true" />
								</IconButton>
							)}
						</Flex>
					);
				},
			});
		}

		return cols;
	}, [
		rowSpec,
		getAllPlugins,
		hasRowErrors,
		messagesFor,
		rowIndexOf,
		rowFieldNames,
		readOnly,
		canRemove,
		deleteRow,
	]);

	const draftErrors = useMemo(
		() => (draft?.index == null ? undefined : messagesFor(draft.index)),
		[draft, messagesFor],
	);

	return (
		<Stack gap="2" data-testid="virtual-table">
			{canAdd && (
				<Flex justify="flex-end">
					<Button
						size="sm"
						variant="outline"
						onClick={() => setDraft({ index: null })}
					>
						<Plus size={16} aria-hidden="true" />
						Add row
					</Button>
				</Flex>
			)}

			<Box>
				<DataTable
					columns={columns}
					data={pageRows}
					variant="line"
					emptyState={
						<Text fontSize="sm" color="fg.muted">
							No rows yet.
						</Text>
					}
					total={rows.length}
					page={page}
					pageSize={pageSize}
					onPageChange={setRequestedPage}
					// Read-only offers no handle at all: the column is injected
					// only when this callback is set.
					onRowReorder={readOnly ? undefined : reorderRow}
				/>
			</Box>

			{draft && (
				<VirtualTableRowDrawer
					rowSpec={rowSpec}
					initialValues={draft.index == null ? undefined : rows[draft.index]}
					initialErrors={draftErrors}
					title={draft.index == null ? "Add row" : "Edit row"}
					onSave={saveDraft}
					onCancel={() => setDraft(null)}
				/>
			)}
		</Stack>
	);
}
VirtualTableEditor.displayName = "VirtualTableEditor";

function StatusText({ children }: { children: ReactNode }) {
	return (
		<Text color="fg.muted" fontSize="sm">
			{children}
		</Text>
	);
}
StatusText.displayName = "StatusText";
