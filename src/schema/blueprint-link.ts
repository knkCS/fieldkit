// src/schema/blueprint-link.ts
import type { CataloguePin } from "./plugin";
import type { Field } from "./types";

/**
 * The setting that links a Blueprint, as the Catalogue records it: the key a
 * Fieldset and a Virtual Table both hold their link under, and the kind of
 * Release it pins — a Blueprint's (ADR-0020). Both plugins declare this one
 * object as their Pin and `linkedBlueprintId()` reads the same key, so the
 * Catalogue cannot name a key the validator, the resolver and the renderer do
 * not read.
 *
 * The value names a **Blueprint Release** (ADR-0020): one opaque Release id
 * string — never a Blueprint id, a Revision, or "latest". The Release id is
 * all resolution needs to fetch it, and whoever issues Release ids already
 * knows which Blueprint each belongs to, so the value carries nothing beside
 * it.
 */
export const BLUEPRINT_PIN: CataloguePin = {
	key: "blueprint",
	kind: "blueprint",
};

/**
 * The Blueprint Release a Field links to, or undefined for one that links
 * none. (The name predates Releases: the value is a Release id, ADR-0020.)
 *
 * Two Field Types link a Blueprint, and both store it under the same settings
 * key: a Fieldset, which embeds its Fields as one record (ADR-0003), and a
 * Virtual Table whose Row Spec is linked rather than embedded (ADR-0017). One
 * reader for both, so the validator, the resolver and the renderer cannot read
 * a link differently — the divergence each of their doc comments claims to
 * prevent.
 *
 * A blank id is no link: that is what an Author clearing the picker leaves
 * behind, and it is not a Release any adapter could be asked for.
 */
export function linkedBlueprintId(field: Field): string | undefined {
	return pinnedRelease(field, BLUEPRINT_PIN.key);
}

/**
 * The Release a Pin setting names, or undefined for none: a string that is not
 * blank. Every Pin is read through here — `linkedBlueprintId()` for the
 * Blueprint one, `resolveSpec()` and `specPins()` for whichever keys the
 * Catalogue records — so no two readers disagree about what a blank or a
 * non-string setting means. Go's `pinRelease` reads it the same way.
 *
 * The settings cast lives here and nowhere else. Settings are `unknown` on
 * `Field` by design — a plugin owns its own — so shared code reading one key
 * out of them does it in a single documented place rather than per caller.
 */
export function pinnedRelease(field: Field, key: string): string | undefined {
	const settings = field.settings as Record<string, unknown> | null | undefined;
	const value = settings?.[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}
