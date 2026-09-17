// src/renderer/fields/virtual-table-rows.ts

/**
 * The paging and error-reading arithmetic behind the Virtual Table editor.
 *
 * Pure on purpose: a Virtual Table pages over the array it already holds — no
 * adapter, no fetch — and the questions that raises (which slice is on screen,
 * which page survives a delete, which Row Spec column an error belongs to) are
 * answerable without React, so they are answered here and tested here rather
 * than through a rendered table.
 */

/** Rows per page when the Field names no `max_records_per_page`. The plugin's
 * `defaultSettings` reads it from here, so a Field saved before the setting
 * existed pages the same way as one saved with the default. */
export const DEFAULT_MAX_RECORDS_PER_PAGE = 25;

/** The page size a Field asks for, floored at one row: a page of zero rows
 * would page forever through a table nobody could read. */
export function rowsPerPage(maxRecordsPerPage: number | undefined): number {
	if (maxRecordsPerPage === undefined || !Number.isFinite(maxRecordsPerPage)) {
		return DEFAULT_MAX_RECORDS_PER_PAGE;
	}
	return Math.max(1, Math.floor(maxRecordsPerPage));
}

/** How many pages `rowCount` rows fill. Always at least one: an empty table
 * still shows page one, with its empty state. */
export function pageCount(rowCount: number, pageSize: number): number {
	return Math.max(1, Math.ceil(rowCount / Math.max(1, pageSize)));
}

/**
 * The page actually shown, given how many rows there are now.
 *
 * Deleting the last row of the last page leaves the stored page number past
 * the end of the array; clamping here means the table falls back to the new
 * last page instead of drawing an empty one that looks like a lost table.
 */
export function clampPage(
	page: number,
	rowCount: number,
	pageSize: number,
): number {
	return Math.min(Math.max(1, page), pageCount(rowCount, pageSize));
}

/** The rows of one page. */
export function pageOfRows<T>(
	rows: readonly T[],
	page: number,
	pageSize: number,
): T[] {
	const size = Math.max(1, pageSize);
	const start = (clampPage(page, rows.length, size) - 1) * size;
	return rows.slice(start, start + size);
}

/** Position in the whole array of the row shown at `indexOnPage`. The table
 * hands its cells a page-local index; every write goes to the array. */
export function absoluteRowIndex(
	indexOnPage: number,
	page: number,
	pageSize: number,
	rowCount: number,
): number {
	const size = Math.max(1, pageSize);
	return (clampPage(page, rowCount, size) - 1) * size + indexOnPage;
}

/** Walks a dotted accessor into react-hook-form's error tree. A Field's own
 * Accessor may be dotted — a Virtual Table inside a Fieldset — and the errors
 * for it are nested a segment at a time. */
function at(errors: unknown, path: string): unknown {
	let node = errors;
	for (const segment of path.split(".")) {
		if (node == null || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[segment];
	}
	return node;
}

function messageOf(node: unknown): string | undefined {
	if (node == null || typeof node !== "object") return undefined;
	const message = (node as { message?: unknown }).message;
	return typeof message === "string" && message !== "" ? message : undefined;
}

/**
 * The validation messages standing against one row, keyed by the Accessor of
 * the Row Spec Field they belong to.
 *
 * Read off the form the Consumer owns rather than recomputed: the row array's
 * Zod type reports at `line_items.1.quantity` (`row-array.ts`), which is the
 * path the drawer registers that column under, so the message the table shows
 * on a row and the message the drawer shows on a column are the same string
 * from the same parse.
 *
 * A message sitting on the row itself — not on any column — is keyed by the
 * empty string, so a row-level error still reaches the row.
 */
export function rowErrorMessages(
	errors: unknown,
	accessor: string,
	index: number,
): Record<string, string> {
	const rowErrors = at(errors, accessor);
	if (rowErrors == null || typeof rowErrors !== "object") return {};
	const row = (rowErrors as Record<string, unknown>)[String(index)];
	if (row == null || typeof row !== "object") return {};

	const messages: Record<string, string> = {};
	const own = messageOf(row);
	if (own !== undefined) messages[""] = own;
	// No skip-list for react-hook-form's own `type`, `message` and `ref` keys:
	// `messageOf` already rejects the two strings and the DOM node, and a Row
	// Spec is perfectly entitled to a column accessor spelled `type`.
	for (const [accessor, node] of Object.entries(
		row as Record<string, unknown>,
	)) {
		const message = messageOf(node);
		if (message !== undefined) messages[accessor] = message;
	}
	return messages;
}
