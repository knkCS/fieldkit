import { partitionSchemaBySections } from "./partition";
import { partitionTabByCards } from "./partition-cards";
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";

export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor"
	| "loose_field_in_carded_tab";

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
	// `Field.children`. Documented-by-design; resolveMarkerConvention
	// shares the same boundary (see its docstring).
	checkAccessors(fields, fieldErrors);
	checkCardLayout(fields, fieldErrors);
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
 * editor's insertCard auto-wraps loose fields, but a cross-section card
 * MOVE into a tab with loose fields (0.12.0 drag/menu) reaches this state
 * legitimately — the flag guides the author to "+ Card" or undo; the rule
 * also catches hand-written schemas. The renderer still degrades gracefully (implicit
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
