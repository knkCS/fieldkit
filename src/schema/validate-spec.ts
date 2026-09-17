import { partitionSchemaBySections } from "./partition";
import { partitionTabByCards } from "./partition-cards";
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";
import {
	isVirtualTableRowFieldType,
	virtualTableRowSpecKind,
} from "./virtual-table-row-spec";

export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor"
	| "loose_field_in_carded_tab"
	/** A Virtual Table naming a Blueprint *and* carrying children — two Row
	 * Specs where ADR-0017 allows exactly one. */
	| "virtual_table_row_spec_ambiguous"
	/** A Virtual Table with neither a linked nor an embedded Row Spec. */
	| "virtual_table_row_spec_missing"
	/** A Field a Row Spec may not hold — a Marker, a container, or any type
	 * outside `VIRTUAL_TABLE_ROW_FIELD_TYPES`. */
	| "virtual_table_row_field_type";

export interface SpecFieldError {
	accessor: string;
	code: SpecFieldErrorCode;
	message: string;
}

export interface SpecValidationResult {
	valid: boolean;
	errors: string[];
	fieldErrors: SpecFieldError[];
}

export function validateSpec(
	fields: Field[],
	plugins: Map<string, FieldTypePlugin>,
): SpecValidationResult {
	const errors: string[] = [];
	const fieldErrors: SpecFieldError[] = [];

	// Count fields per type
	const typeCounts = new Map<string, number>();
	for (const field of fields) {
		typeCounts.set(
			field.field_type,
			(typeCounts.get(field.field_type) ?? 0) + 1,
		);
	}

	// Check maxPerSpec constraints
	for (const [typeId, count] of typeCounts) {
		const plugin = plugins.get(typeId);
		if (plugin?.maxPerSpec != null && count > plugin.maxPerSpec) {
			errors.push(
				`Field type "${plugin.name}" (${typeId}) is limited to ${plugin.maxPerSpec} per spec, but ${count} were found`,
			);
		}
	}

	// Check accessor constraints: empty name, empty accessor, duplicates.
	// Recurses into group children (F5) — each field list (top-level, or one
	// group's children) is its OWN duplicate-accessor namespace: the same
	// accessor reused in a sibling group, or at a different nesting level, is
	// NOT a collision, so `seen` must not be shared across recursive calls.
	// Fields nested inside blocks/array settings are NOT traversed — they
	// live in `settings` (e.g. allowed_blocks[].fields), not
	// `Field.children`. Documented-by-design; resolveMarkerConvention and
	// resolveSpec share the same boundary (see their docstrings). Those
	// Fields DO reach a Schema, composed by the plugin that owns them —
	// composing is not walking, so none of the checks below see them and a
	// duplicate accessor among a block type's fields goes unreported.
	// ADR-0007 states the boundary and what it costs.
	checkAccessors(fields, fieldErrors);
	checkCardLayout(fields, fieldErrors);
	checkVirtualTables(fields, fieldErrors);
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}

	return { valid: errors.length === 0, errors, fieldErrors };
}

function checkAccessors(fields: Field[], fieldErrors: SpecFieldError[]): void {
	const seen = new Map<string, number>();
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		// Card markers are exempt from the empty-name rule: a card's title is
		// OPTIONAL (empty = untitled, card-layout Decision 3). Accessor rules
		// below apply to them unchanged.
		if (field.field_type !== "card" && !field.config.name.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_name",
				message: "Name must not be empty",
			});
		}
		if (!accessor.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_accessor",
				message: "Accessor must not be empty",
			});
		} else {
			seen.set(accessor, (seen.get(accessor) ?? 0) + 1);
		}
		if (field.children && field.children.length > 0) {
			checkAccessors(field.children, fieldErrors);
		}
	}
	for (const [accessor, count] of seen) {
		if (count > 1) {
			fieldErrors.push({
				accessor,
				code: "duplicate_accessor",
				message: `Duplicate accessor "${accessor}"`,
			});
		}
	}
}

/**
 * Card-layout Decision 4: once a tab contains a card marker, every field in
 * that tab lives in a card — a field BEFORE the tab's first marker is an
 * error, flagged per field so shells outline and tab badges count it. The
 * editor never produces this state: insertCard AND moveCardToSection
 * (0.13.0, #46) both auto-wrap a target tab's loose fields first — the
 * rule catches hand-written schemas. The renderer still degrades gracefully (implicit
 * untitled card) — a schema is data; this rule only reports the violation.
 * Top-level only: cards inside groups are a non-goal.
 */
function checkCardLayout(fields: Field[], fieldErrors: SpecFieldError[]): void {
	for (const tab of partitionSchemaBySections(fields).tabs) {
		const { cards, hasCards } = partitionTabByCards(tab.fields);
		// No separate `cards.length === 0` check: partitionTabByCards only
		// ever returns an empty `cards` array when hasCards is ALSO false
		// (an empty tab, or one with no card markers), so `!hasCards` already
		// covers it.
		if (!hasCards || cards[0].card !== null) continue;
		for (const loose of cards[0].fields) {
			fieldErrors.push({
				accessor: loose.config.api_accessor,
				code: "loose_field_in_carded_tab",
				message: `Field "${loose.config.api_accessor}" must be inside a card`,
			});
		}
	}
}

/**
 * ADR-0017: a Virtual Table declares its Row Spec in exactly one of two ways —
 * a linked Blueprint in `settings.blueprint`, or an embedded one in its own
 * `children` — and a Row Spec holds only flat value Fields.
 *
 * Both rules are checked here rather than in the plugin's `toZodType`, because
 * an authored Spec with two Row Specs or a Group in one is a Spec the Author
 * must fix before saving, not a value to reject at submit: the editor shows
 * these against the offending Field the way it shows a duplicate Accessor.
 *
 * Walks `children` like the accessor check, so a Virtual Table inside a Group
 * is checked too — and, on the same ADR-0007 boundary, one declared inside a
 * Block Type's settings Fields is not.
 *
 * **Takes an authored Spec**, as every check here does. `resolveSpec()` puts a
 * linked Row Spec into `children` (ADR-0004), so a *Resolved* linked Virtual
 * Table names a Blueprint and has children at once and is reported ambiguous.
 * That is not a contradiction with the Field-type check below reading those
 * same `children`: an authored Field's children are its embedded Row Spec, and
 * the check is about what an Author declared. A Resolved Spec is the renderer's
 * and the Schema builder's input, never this function's — validate before you
 * resolve.
 */
function checkVirtualTables(
	fields: Field[],
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		if (field.field_type === "virtual_table") {
			checkVirtualTable(field, fieldErrors);
		}
		if (field.children?.length) {
			checkVirtualTables(field.children, fieldErrors);
		}
	}
}

function checkVirtualTable(field: Field, fieldErrors: SpecFieldError[]): void {
	const accessor = field.config.api_accessor;
	const kind = virtualTableRowSpecKind(field);

	if (kind === "both") {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_ambiguous",
			message: `Virtual Table "${accessor}" has both a linked and an embedded Row Spec; it must have exactly one`,
		});
	} else if (kind === "neither") {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_missing",
			message: `Virtual Table "${accessor}" has no Row Spec: link a Blueprint or declare its Fields`,
		});
	}

	// Checked whichever way the Row Spec was declared: an embedded one is the
	// Author's to fix, and a linked one resolved into `children` would be the
	// Blueprint's — reported either way rather than silently rendering a Field
	// no cell can draw.
	for (const rowField of field.children ?? []) {
		if (isVirtualTableRowFieldType(rowField.field_type)) continue;
		fieldErrors.push({
			accessor: rowField.config.api_accessor,
			code: "virtual_table_row_field_type",
			message: `Field "${rowField.config.api_accessor}" of type "${rowField.field_type}" is not allowed in a Row Spec`,
		});
	}
}
