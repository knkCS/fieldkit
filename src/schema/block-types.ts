// src/schema/block-types.ts
import type { Field } from "./types";

/**
 * A Spec a Blocks Field holds in its settings: one Block Type's Fields, and
 * the settings path they sit at, relative to the Blocks Field's own —
 * `["settings", "allowed_blocks", 0, "fields"]`.
 */
export interface BlockTypeSpec {
	segments: readonly (string | number)[];
	fields: Field[];
}

/** What the Block Types of a Blocks Field hold, read leniently. */
export interface BlockTypeSpecs {
	/** The Block Types whose `fields` are a list of Fields, in order. */
	specs: BlockTypeSpec[];
	/** Block Types whose `fields` is a list but not of Fields — each an
	 * `invalid_setting` at its path, the way Go refuses to decode it. */
	invalid: (readonly (string | number)[])[];
}

/**
 * The Specs a Blocks Field's Block Types hold, so `validateSpec()` walks them
 * as it walks `children`.
 *
 * A Block Type's Fields live in `settings.allowed_blocks[].fields`, not in
 * `children` (ADR-0007), so the one reader of that shape lives beside the
 * plugin that owns it rather than inside the shared walk — the walk asks this
 * function and learns nothing of the settings' shape.
 *
 * Read leniently, as `linkedBlueprintId()` reads a link: settings of the wrong
 * shape hold no Spec here, and the settings schema reports them. `fields` that
 * is Unset (absent or `[]`) holds none either. A `fields` list whose items are
 * not Field objects cannot be walked, and is reported by the caller.
 */
export function blockTypeSpecs(field: Field): BlockTypeSpecs {
	const out: BlockTypeSpecs = { specs: [], invalid: [] };
	if (field.field_type !== "blocks") return out;
	const allowed = (
		field.settings as { allowed_blocks?: unknown } | null | undefined
	)?.allowed_blocks;
	if (!Array.isArray(allowed)) return out;
	allowed.forEach((blockType, index) => {
		if (!isObject(blockType)) return;
		const fields = blockType.fields;
		if (!Array.isArray(fields) || fields.length === 0) return;
		const segments = ["settings", "allowed_blocks", index, "fields"] as const;
		if (fields.every(isFieldShaped)) {
			out.specs.push({ segments, fields: fields as Field[] });
		} else {
			out.invalid.push(segments);
		}
	});
	return out;
}

/**
 * The indices of Block Types repeating a `type` an earlier one declared.
 *
 * A Block's `_type` names the Block Type it was added from, so two Block Types
 * sharing one make a stored Block ambiguous — and the Blocks plugin's
 * discriminated union cannot even be built from them. Each repeat is reported,
 * the first declaration is not. A `type` that is not a non-empty string is the
 * settings schema's to report, not a duplicate.
 */
export function duplicateBlockTypes(field: Field): number[] {
	if (field.field_type !== "blocks") return [];
	const allowed = (
		field.settings as { allowed_blocks?: unknown } | null | undefined
	)?.allowed_blocks;
	if (!Array.isArray(allowed)) return [];
	const seen = new Set<string>();
	const repeats: number[] = [];
	allowed.forEach((blockType, index) => {
		if (!isObject(blockType)) return;
		const type = blockType.type;
		if (typeof type !== "string" || type === "") return;
		if (seen.has(type)) repeats.push(index);
		else seen.add(type);
	});
	return repeats;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Enough of a Field for the walk not to trip: an object with a `config`
 * object. Anything less is refused whole, never half-walked. */
function isFieldShaped(value: unknown): boolean {
	return isObject(value) && isObject(value.config);
}
