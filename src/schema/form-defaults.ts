// src/schema/form-defaults.ts

import type { FieldTypePlugin } from "./plugin";
import { mintMissingIds } from "./row-ids";
import type { Field } from "./types";
import { getDefaultValues } from "./zod-builder";

/**
 * What a form editing `stored` against `schema` is seeded with: the stored
 * value, with the Spec's defaults (`getDefaultValues`) filled in under every
 * key it has none for, and an `_id` minted into every row missing one
 * (ADR-0023), inside containers too.
 *
 * A key the stored value holds wins, even when it holds Unset — a Field the
 * user cleared stays cleared rather than falling back to its default. Keys
 * the Spec does not name (a record's id, its timestamps) are kept.
 *
 * For a Consumer that seeds `useForm({ defaultValues })` itself, before
 * SpecForm mounts — a form held above a router outlet, say: seeded through
 * this, it is clean on load and passes a Save even if SpecForm never mounts.
 * EditDrawer seeds through it too. SpecForm's own minting stays the safety
 * net for a form seeded any other way.
 *
 * Idempotent: normalised input comes back equal.
 */
export function formDefaults(
	schema: readonly Field[],
	stored: Record<string, unknown> | undefined,
	plugins: readonly FieldTypePlugin[],
): Record<string, unknown> {
	const specDefaults = getDefaultValues(
		schema as Field[],
		plugins as FieldTypePlugin[],
	);
	return mintMissingIds(schema, { ...specDefaults, ...stored }, plugins);
}
