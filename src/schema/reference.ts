// src/schema/reference.ts
import { z } from "zod";

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
