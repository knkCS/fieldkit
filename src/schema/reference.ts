// src/schema/reference.ts
import { type ZodTypeAny, z } from "zod";

/**
 * Whether a Reference Field fixes its References to a particular target, and
 * to which kind of target.
 *
 * The setting lives on the Field, never on the value: a Reference's Pin is a
 * bare target id, and this is the only thing that says what that id points at
 * (ADR-0008). Changing it therefore invalidates every Pin at once — they all
 * fall back to the newest Version together, rather than some going stale — and
 * fieldkit cannot itself refuse the change, because only a Consumer knows
 * whether any Content would be stranded by it.
 *
 * `"none"` is the absence of pinning, not a third kind of target: a Field that
 * does not pin never asks for a target and never stores one.
 */
export type PinMode = "none" | "release" | "version";

/**
 * The modes that actually pin.
 *
 * The only ones `listPinTargets` is ever asked for, so an Adapter never has to
 * answer "what are the targets for not pinning".
 */
export type PinningMode = Exclude<PinMode, "none">;

/**
 * The value one Reference Field entry holds.
 *
 * Fieldkit owns this shape; a Consumer maps it to whatever it persists. The
 * whole shape is declared here even though only `id` is populated today —
 * the parts marked below arrive with later Reference tickets, and nothing
 * should have to re-declare the type to add them.
 *
 * Two rules the shape encodes:
 *
 * - **The tree is genuinely nested.** `children` holds References, so an
 *   orphan is unrepresentable. Flat encodings with ancestor lists are the
 *   Consumer's business.
 * - **A display name is never stored.** Names are resolved through the
 *   reference Adapter on load, so a Content renamed elsewhere reads
 *   correctly here instead of going stale in saved data.
 */
export interface Reference {
	/** The referenced Content's id. The only part a Single Reference sets. */
	id: string;
	/**
	 * The Pin's target id, or null/absent for "newest Version".
	 *
	 * Which *kind* of target it is comes from the Field's `pin_mode`, never
	 * from the value — so changing `pin_mode` invalidates every Pin at once
	 * rather than leaving some stale.
	 */
	pin?: string | null;
	/** Attribute values, keyed by the Accessor of the Attribute Field. */
	attributes?: Record<string, unknown>;
	/** Nested References. The tree Reference type only; a Single Reference
	 * holds exactly one Reference and never a branch. */
	children?: Reference[];
}

/**
 * A Reference without its branch — `id`, and the parts later tickets fill in.
 *
 * Unknown keys are stripped rather than rejected, which is how a `children`
 * array reaching a Single Reference is dropped instead of blocking submit.
 * The tree type extends this with a lazily-recursive `children`.
 */
export const referenceValueSchema = z.object({
	id: z.string().min(1),
	pin: z.string().nullable().optional(),
	attributes: z.record(z.unknown()).optional(),
});

/**
 * One Reference of a tree, with `attributes` shaped by the Field's own
 * Attribute Spec.
 *
 * Lazily recursive, because a Reference's `children` are References. The
 * recursion is what keeps a nested value intact through a parse — an object
 * schema that did not name `children` would *strip* it, so a drag would nest
 * a Reference on screen and submit a flat list. It is also what puts the
 * Attribute Spec on every Reference at every level: a nested Reference carries
 * Attributes on exactly the terms a root one does. How deep the nesting may go
 * is a Field setting, enforced in that Field's own Schema rather than here.
 *
 * A factory rather than a constant because the Attribute Spec is a *setting*:
 * only the plugin holding it can compose it (ADR-0007), so the shape of
 * `attributes` has to arrive from outside.
 */
export function referenceTreeSchemaWith(
	attributes: ZodTypeAny,
): z.ZodType<Reference> {
	const node: z.ZodType<Reference> = z.lazy(() =>
		referenceValueSchema.extend({
			attributes,
			children: z.array(node).optional(),
		}),
	);
	return node;
}

/**
 * A Reference Tree that says nothing about its Attributes — the opaque record
 * ADR-0008 declares, which is what a Field with no Attribute Spec holds.
 */
export const referenceTreeSchema: z.ZodType<Reference> =
	referenceTreeSchemaWith(z.record(z.unknown()).optional());

/**
 * The Reference to store for one Content and one Pin.
 *
 * No Pin writes no `pin` key at all, rather than an explicit `null`: an absent
 * Pin already means the newest Version, and a Field that does not pin has to
 * store exactly what it stored before pinning existed. Everything else the
 * Reference carries travels across untouched — it is the same Reference, only
 * its Pin changed.
 *
 * It lives here rather than in either control because it is a rule about the
 * value's shape, and both the tree Field and the Single Reference write Pins.
 */
export function withPin(
	previous: Reference | null | undefined,
	id: string,
	pin: string | null,
): Reference {
	const next: Reference = { ...previous, id };
	delete next.pin;
	if (pin) next.pin = pin;
	return next;
}

/**
 * Reads a form value as one Reference, or `null` when it isn't one.
 *
 * Form data arrives from a Consumer and is only as well-formed as whatever
 * produced it, so every place that renders a stored Reference — the table
 * cell, read mode — goes through this rather than trusting the cast.
 */
export function asReference(value: unknown): Reference | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const { id } = value as Reference;
	return typeof id === "string" && id.length > 0 ? (value as Reference) : null;
}
