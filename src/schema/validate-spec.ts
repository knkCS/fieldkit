import { blockTypeSpecs, duplicateBlockTypes } from "./block-types";
import { partitionSchemaBySections } from "./partition";
import { partitionTabByCards } from "./partition-cards";
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";
import { toPath, validateSettings } from "./validate-settings";
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
	| "virtual_table_row_field_type"
	/** A Block Type of a Blocks Field repeating the `type` an earlier one
	 * declared — reported at each repeat's `type`. */
	| "duplicate_block_type"
	/** A Field whose `field_type` no plugin in the map registers. Its
	 * settings are not checked — there is nothing to check them against. */
	| "unknown_field_type"
	/** A settings key the type's `settingsSchema` does not declare. */
	| "unknown_setting"
	/** A declared setting whose value the type's `settingsSchema` refuses. */
	| "invalid_setting";

export interface SpecFieldError {
	accessor: string;
	code: SpecFieldErrorCode;
	message: string;
	/**
	 * Where in the Spec the error is, `/`-separated: the Accessor of each
	 * Field from the root, with `children` between a Field and the Fields it
	 * holds, then — for a settings error — `settings` and the key:
	 * `/authors/children/name/settings/placeholder`. A segment holding `/` or
	 * `~` is escaped as in RFC 6901. The grammar is shared with the Go
	 * module's `ValidateSpec` (`conformance/README.md`).
	 */
	path: string;
	/** Detail a message may interpolate, keyed by name — `field_type` for
	 * `unknown_field_type`. Absent when the code says everything. */
	params?: Record<string, unknown>;
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

	// Every check below but the card-layout rule walks every Spec a Field
	// holds (`nestedSpecs`): a Group's or a Virtual Table's `children`, and
	// the Fields of each Block Type of a Blocks Field, which live in its
	// settings (`allowed_blocks[].fields`) rather than in `children`. Each
	// field list is its OWN duplicate-accessor namespace: the same accessor
	// reused in a sibling group, in a Block Type, or at a different nesting
	// level is NOT a collision, so `seen` is never shared across lists.
	//
	// Walking Block Types moves the line ADR-0007 drew for this function,
	// which walked `children` only and so left a duplicate accessor among a
	// Block Type's Fields unreported (#208). The settings' shape is still read
	// by the Blocks Field's own module (`block-types.ts`), never here.
	checkAccessors(fields, [], fieldErrors);
	checkCardLayout(fields, fieldErrors);
	checkVirtualTables(fields, [], fieldErrors);
	checkTypesAndSettings(fields, [], plugins, fieldErrors);
	checkBlockTypes(fields, [], fieldErrors);
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}

	return { valid: errors.length === 0, errors, fieldErrors };
}

type Segments = readonly (string | number)[];

/**
 * The field lists a Field holds, each with the path segments of the list
 * itself: its `children` at `…/children`, and — for a Blocks Field — each
 * Block Type's Fields at `…/settings/allowed_blocks/<i>/fields`. A Field in a
 * list sits at the list's segments plus its Accessor: the path grammar
 * `conformance/README.md` states and Go's `ValidateSpec` shares.
 */
function nestedSpecs(
	field: Field,
	segments: Segments,
): { list: Segments; fields: Field[] }[] {
	const lists: { list: Segments; fields: Field[] }[] = [];
	if (field.children?.length) {
		lists.push({ list: [...segments, "children"], fields: field.children });
	}
	for (const spec of blockTypeSpecs(field).specs) {
		lists.push({ list: [...segments, ...spec.segments], fields: spec.fields });
	}
	return lists;
}

function checkAccessors(
	fields: Field[],
	list: Segments,
	fieldErrors: SpecFieldError[],
): void {
	const seen = new Map<string, number>();
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const path = toPath(segments);
		// Card markers are exempt from the empty-name rule: a card's title is
		// OPTIONAL (empty = untitled, card-layout Decision 3). Accessor rules
		// below apply to them unchanged.
		if (field.field_type !== "card" && !field.config.name.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_name",
				message: "Name must not be empty",
				path,
			});
		}
		if (!accessor.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_accessor",
				message: "Accessor must not be empty",
				path,
			});
		} else {
			seen.set(accessor, (seen.get(accessor) ?? 0) + 1);
		}
		for (const nested of nestedSpecs(field, segments)) {
			checkAccessors(nested.fields, nested.list, fieldErrors);
		}
	}
	for (const [accessor, count] of seen) {
		if (count > 1) {
			fieldErrors.push({
				accessor,
				code: "duplicate_accessor",
				message: `Duplicate accessor "${accessor}"`,
				path: toPath([...list, accessor]),
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
				path: toPath([loose.config.api_accessor]),
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
 * Walks every nested Spec like the accessor check, so a Virtual Table inside a
 * Group, or declared among a Block Type's Fields, is checked too.
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
	list: Segments,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const segments = [...list, field.config.api_accessor];
		if (field.field_type === "virtual_table") {
			checkVirtualTable(field, segments, fieldErrors);
		}
		for (const nested of nestedSpecs(field, segments)) {
			checkVirtualTables(nested.fields, nested.list, fieldErrors);
		}
	}
}

function checkVirtualTable(
	field: Field,
	segments: Segments,
	fieldErrors: SpecFieldError[],
): void {
	const accessor = field.config.api_accessor;
	const path = toPath(segments);
	const kind = virtualTableRowSpecKind(field);

	if (kind === "both") {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_ambiguous",
			message: `Virtual Table "${accessor}" has both a linked and an embedded Row Spec; it must have exactly one`,
			path,
		});
	} else if (kind === "neither") {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_missing",
			message: `Virtual Table "${accessor}" has no Row Spec: link a Blueprint or declare its Fields`,
			path,
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
			path: toPath([...segments, "children", rowField.config.api_accessor]),
		});
	}
}

/**
 * ADR-0018: every Field names a registered type, and its `settings` are what
 * that type's `settingsSchema` declares — nothing more, and each of the right
 * shape. The same rule, over the same schemas, is the Go module's
 * `ValidateSpec`; the shared conformance fixtures hold the two to one answer.
 *
 * A type without a `settingsSchema` accepts any settings, as every type did
 * before the Catalogue. A Field of an unknown type is reported once and its
 * settings are left alone; its children are still walked, as every check here
 * walks `children` whatever holds them. A Block Type's Fields are walked the
 * same way, each against its own type.
 */
function checkTypesAndSettings(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const plugin = plugins.get(field.field_type);
		if (!plugin) {
			fieldErrors.push({
				accessor,
				code: "unknown_field_type",
				message: `Field "${accessor}" has an unknown type "${field.field_type}"`,
				path: toPath(segments),
				params: { field_type: field.field_type },
			});
		} else if (plugin.settingsSchema) {
			const settingsPath = toPath([...segments, "settings"]);
			for (const error of validateSettings(
				plugin.settingsSchema,
				field.settings,
			)) {
				fieldErrors.push({
					accessor,
					code: error.code,
					message:
						error.code === "unknown_setting"
							? `Field "${accessor}" has an unknown setting "${error.path}"`
							: `Field "${accessor}" has an invalid setting "${error.path}"`,
					path: settingsPath + error.path,
				});
			}
		}
		for (const nested of nestedSpecs(field, segments)) {
			checkTypesAndSettings(nested.fields, nested.list, plugins, fieldErrors);
		}
	}
}

/**
 * The rules across a Blocks Field's settings that its settings schema cannot
 * state: no two Block Types share a `type`, and a Block Type's `fields` is a
 * list of Fields — one that is not cannot be walked, and is one
 * `invalid_setting` rather than half a Spec. Go's `ValidateSpec` runs the same
 * rules as the `blocks` type's hook.
 */
function checkBlockTypes(
	fields: Field[],
	list: Segments,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		for (const index of duplicateBlockTypes(field)) {
			fieldErrors.push({
				accessor,
				code: "duplicate_block_type",
				message: `Field "${accessor}" has Block Types sharing one type`,
				path: toPath([
					...segments,
					"settings",
					"allowed_blocks",
					index,
					"type",
				]),
			});
		}
		for (const invalid of blockTypeSpecs(field).invalid) {
			fieldErrors.push({
				accessor,
				code: "invalid_setting",
				message: `Field "${accessor}" has an invalid setting "${toPath(invalid.slice(1))}"`,
				path: toPath([...segments, ...invalid]),
			});
		}
		for (const nested of nestedSpecs(field, segments)) {
			checkBlockTypes(nested.fields, nested.list, fieldErrors);
		}
	}
}
