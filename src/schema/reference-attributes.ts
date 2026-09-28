// src/schema/reference-attributes.ts
/**
 * The Attribute Spec: the Fields a Reference Field declares once, and every
 * Reference it holds fills in.
 *
 * An Attribute is a value about the *pointing* — the page a citation appears
 * on, the role a credit names — not about either Content. In knkCMS core these
 * are bare strings positionally aligned to a settings array; here they are
 * ordinary Fields, so "page" can be a number and "role" a select and either can
 * be required, and the values are stored keyed by Accessor rather than by
 * position.
 *
 * ## Where the Spec lives, and what that costs
 *
 * In `settings.attributes`, following the Blocks precedent. `validateSpec()`
 * walks it as the `reference_spec` Position (ADR-0022) — the reference plugin
 * names it through `heldSpecs` — so a duplicate, empty or reserved Accessor,
 * an empty name and a type that may not sit there are all reported. The Go
 * module does not yet: `reference` is not in the Catalogue until #215.
 *
 * `resolveMarkerConvention()` still walks `Field.children` only, which is
 * ADR-0007's boundary for it. `resolveSpec()` and `specPins()` walk this Spec
 * as `validateSpec()` does (#212), so a Pin in it is listed and resolved; a
 * Fieldset declared as an Attribute is still refused by `validateSpec()`,
 * since `fieldset` does not list `reference_spec` — see `Position`.
 *
 * The reference plugin composes these Fields itself, exactly as the Blocks
 * plugin composes a block type's. Composing is not walking, so it does not move
 * the boundary; ADR-0007 is the canonical statement of it.
 */
import { type ZodTypeAny, z } from "zod";
import type { ComposeChildrenSchema } from "./plugin";
import type { Field } from "./types";
import { isField } from "./types";
import { fieldProducesValue } from "./zod-builder";

/**
 * The entries of an Attribute Spec that are Fields at all.
 *
 * Nothing shared validates this Spec (ADR-0007) and it may have been written by
 * hand, so a stray entry is possible and must cost only itself — reading an
 * Accessor off a string would take down every surface that touches the Spec.
 * Every other function here starts from this.
 */
export function attributeFields(spec: readonly unknown[]): Field[] {
	return spec.filter(isField);
}

/**
 * The Attributes an Author is actually being asked for.
 *
 * Exactly what the shared builder composes, by the same predicate — so a hidden
 * Field, and a value-less Marker a hand-written Spec slipped in (the type picker
 * offers neither), are skipped here too. Counting one of those would leave a
 * Reference permanently one short of full, with nothing on screen to fill.
 */
export function declaredAttributes(spec: readonly unknown[]): Field[] {
	return attributeFields(spec).filter(fieldProducesValue);
}

/**
 * Whether an Attribute has been answered.
 *
 * The four ways a control says "nothing here" are empty; everything else is a
 * value. `false` and `0` count as filled deliberately — they are what an
 * unchecked box and a zero page number *are*, and a count that disagreed with
 * the Schema about whether a required Attribute was satisfied would be worse
 * than no count at all.
 */
export function isAttributeFilled(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/**
 * How many of the declared Attributes one Reference has filled in.
 *
 * Counted over the *Spec*, never over the stored record: a key left behind by
 * an Attribute an Author has since deleted is not something anyone can still
 * see or change, so counting it would report attention that no drawer offers.
 */
export function countFilledAttributes(
	spec: readonly unknown[],
	attributes: Record<string, unknown> | undefined,
): number {
	if (!attributes) return 0;
	return declaredAttributes(spec).filter((attribute) =>
		isAttributeFilled(attributes[attribute.config.api_accessor]),
	).length;
}

/** Whether any declared Attribute must be answered before submit. */
export function hasRequiredAttribute(spec: readonly unknown[]): boolean {
	return declaredAttributes(spec).some(
		(attribute) => attribute.config.required,
	);
}

/**
 * The Schema for one Reference's `attributes` record.
 *
 * Composed through the plugin's `composeChildren` argument (ADR-0007), so an
 * Attribute obeys the same required/optional shaping, the same hidden skip and
 * the same per-type Zod as it would as a Field of its own — and a required one
 * reports at its own key under the Reference that owns it.
 *
 * Three shapes, and each is deliberate:
 *
 * - **`passthrough`**, like both container types: a stored record carries keys
 *   the Spec no longer declares, and validation arriving is no reason to prune
 *   an Author's data.
 * - **Required Attributes make the record itself required**, seeded with `{}`
 *   when it is missing altogether — otherwise a Reference added before the
 *   Attribute was declared would store no `attributes` key and slip past the
 *   check entirely.
 * - **No required Attribute leaves it optional**, and a Reference that has none
 *   stores no key — the shape it had before Attributes existed.
 *
 * Without `composeChildren` — `toZodType` is public API and a Consumer may call
 * it with a Field alone — the record stays the opaque one ADR-0008 declares.
 */
export function attributesZodType(
	spec: readonly unknown[] | undefined,
	composeChildren?: ComposeChildrenSchema,
): ZodTypeAny {
	// The Fields, and only the Fields: the shared builder makes its own hidden
	// and Marker skips, but it would throw on a stray entry rather than skip it.
	const attributes = attributeFields(spec ?? []);
	if (!composeChildren || attributes.length === 0) {
		return z.record(z.unknown()).optional();
	}
	const composed = composeChildren(attributes).passthrough();
	return hasRequiredAttribute(attributes)
		? composed.default({})
		: composed.optional();
}
