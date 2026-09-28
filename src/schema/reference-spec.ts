// src/schema/reference-spec.ts
/**
 * The Reference Spec: the Fields a Reference Field declares once, and every
 * Reference it holds fills in — its `values`.
 *
 * A value about the *pointing* — the page a citation appears on, the role a
 * credit names — not about either Content. In knkCMS core these are bare
 * strings positionally aligned to a settings array (and were fieldkit's
 * `attributes`); here they are ordinary Fields, so "page" can be a number and
 * "role" a select and either can be required, and the values are stored keyed
 * by Accessor rather than by position (ADR-0008, amended).
 *
 * ## Where the Spec lives, and what that costs
 *
 * Embedded in `settings.spec`, following the Blocks precedent — and replaced,
 * never merged, by a linked Blueprint Release in `settings.blueprints[].
 * spec_blueprint` for References to that entry's Blueprint (`referenceSpecFor`
 * in `./reference.ts` decides which). `validateSpec()` walks both as the
 * `reference_spec` Position (ADR-0022) — the reference plugins name them
 * through `heldSpecs` — so a duplicate, empty or reserved Accessor, an empty
 * name and a type that may not sit there are all reported, in TS and in Go.
 *
 * `resolveMarkerConvention()` still walks `Field.children` only, which is
 * ADR-0007's boundary for it. `resolveSpec()` and `specPins()` walk these
 * Specs as `validateSpec()` does, and resolve a linked one into its entry's
 * `spec`; a Fieldset declared in a Reference Spec is refused by
 * `validateSpec()`, since `fieldset` does not list `reference_spec`.
 *
 * The reference plugins compose these Fields themselves, exactly as the Blocks
 * plugin composes a Block Type's. Composing is not walking, so it does not move
 * the boundary; ADR-0007 is the canonical statement of it.
 */
import { type ZodTypeAny, z } from "zod";
import type { ComposeChildrenSchema } from "./plugin";
import type { Field } from "./types";
import { isField } from "./types";
import { fieldProducesValue } from "./zod-builder";

/**
 * The entries of a Reference Spec that are Fields at all.
 *
 * The Spec may have been written by hand, so a stray entry is possible and must
 * cost only itself — reading an Accessor off a string would take down every
 * surface that touches the Spec. Every other function here starts from this.
 */
export function referenceSpecFields(spec: readonly unknown[]): Field[] {
	return spec.filter(isField);
}

/**
 * The Fields of a Reference Spec an Author is actually being asked for.
 *
 * Exactly what the shared builder composes, by the same predicate — so a hidden
 * Field, and a value-less Marker a hand-written Spec slipped in (the type picker
 * offers neither), are skipped here too. Counting one of those would leave a
 * Reference permanently one short of full, with nothing on screen to fill.
 */
export function declaredReferenceFields(spec: readonly unknown[]): Field[] {
	return referenceSpecFields(spec).filter(fieldProducesValue);
}

/**
 * Whether one value of a Reference has been answered.
 *
 * The four ways a control says "nothing here" are empty; everything else is a
 * value. `false` and `0` count as filled deliberately — they are what an
 * unchecked box and a zero page number *are*, and a count that disagreed with
 * the Schema about whether a required Field was satisfied would be worse than
 * no count at all.
 */
export function isReferenceValueFilled(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/**
 * How many of the Reference Spec's Fields one Reference has filled in.
 *
 * Counted over the *Spec*, never over the stored record: a key left behind by a
 * Field an Author has since deleted is not something anyone can still see or
 * change, so counting it would report attention that no drawer offers.
 */
export function countFilledValues(
	spec: readonly unknown[],
	values: Record<string, unknown> | undefined,
): number {
	if (!values) return 0;
	return declaredReferenceFields(spec).filter((field) =>
		isReferenceValueFilled(values[field.config.api_accessor]),
	).length;
}

/** Whether any of a Reference Spec's Fields must be answered before submit. */
export function hasRequiredReferenceField(spec: readonly unknown[]): boolean {
	return declaredReferenceFields(spec).some((field) => field.config.required);
}

/**
 * The Schema for one Reference's `values` record.
 *
 * Composed through the plugin's `composeChildren` argument (ADR-0007), so a
 * Field of the Reference Spec obeys the same required/optional shaping, the
 * same hidden skip and the same per-type Zod as it would as a Field of its own
 * — and a required one reports at its own key under the Reference that owns
 * it.
 *
 * Three shapes, and each is deliberate:
 *
 * - **`passthrough`**, like both container types: a stored record carries keys
 *   the Spec no longer declares, and validation arriving is no reason to prune
 *   an Author's data.
 * - **Required Fields make the record itself required**, seeded with `{}`
 *   when it is missing altogether — otherwise a Reference added before the
 *   Field was declared would store no `values` key and slip past the check
 *   entirely.
 * - **No required Field leaves it optional**, and a Reference that has none
 *   stores no key.
 *
 * `undefined` — the Reference Spec is not known (`referenceSpecFor`) — and a
 * call without `composeChildren` (`toZodType` is public API and a Consumer may
 * call it with a Field alone) leave the record opaque, as ADR-0008 declares it.
 */
export function referenceValuesZodType(
	spec: readonly unknown[] | undefined,
	composeChildren?: ComposeChildrenSchema,
): ZodTypeAny {
	// The Fields, and only the Fields: the shared builder makes its own hidden
	// and Marker skips, but it would throw on a stray entry rather than skip it.
	const fields = referenceSpecFields(spec ?? []);
	if (!composeChildren || fields.length === 0) {
		return z.record(z.unknown()).optional();
	}
	const composed = composeChildren(fields).passthrough();
	return hasRequiredReferenceField(fields)
		? composed.default({})
		: composed.optional();
}
