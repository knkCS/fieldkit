// src/schema/blueprint-link.ts
import type { Field } from "./types";

/**
 * The Blueprint a Field links to, or undefined for one that links none.
 *
 * Two Field Types link a Blueprint, and both store it under the same settings
 * key: a Fieldset, which embeds its Fields as one record (ADR-0003), and a
 * Virtual Table whose Row Spec is linked rather than embedded (ADR-0017). One
 * reader for both, so the validator, the resolver and the renderer cannot read
 * a link differently — the divergence each of their doc comments claims to
 * prevent.
 *
 * A blank id is no link: that is what an Author clearing the picker leaves
 * behind, and it is not a Blueprint any adapter could be asked for.
 *
 * The settings cast lives here and nowhere else. Settings are `unknown` on
 * `Field` by design — a plugin owns its own — so shared code reading one key
 * out of them does it in a single documented place rather than per caller.
 */
export function linkedBlueprintId(field: Field): string | undefined {
	const blueprint = (
		field.settings as { blueprint?: unknown } | null | undefined
	)?.blueprint;
	if (typeof blueprint !== "string") return undefined;
	const trimmed = blueprint.trim();
	return trimmed === "" ? undefined : trimmed;
}
