// src/schema/adapter-capabilities.ts
import type { AdapterCapability, FieldTypePlugin } from "./plugin";

/**
 * Which setting a Blueprint picker is choosing for (ADR-0027), so one
 * `blueprint` Adapter can offer each setting what fits it — and, through the
 * Adapter's `purposes`, say which settings it serves at all (ADR-0027,
 * amended):
 *
 * - `reference_target` — the Blueprints a `reference` or `single_reference`
 *   Field may point at (its `blueprints` entries' `blueprint`);
 * - `fieldset` — a Blueprint Release whose Fields are embedded: a Fieldset's
 *   `blueprint`, and a linked Reference Spec (a `blueprints` entry's
 *   `spec_blueprint`), which is embedded into each Reference the same way;
 * - `row_spec` — the Blueprint Release a linked Virtual Table's rows hold.
 *
 * Fieldkit filters nothing itself — it has no notion of a Blueprint kind
 * (ADR-0002). The purpose is only what it tells the Consumer.
 */
export type BlueprintPurpose = (typeof BLUEPRINT_PURPOSES)[number];

/** Every {@link BlueprintPurpose}: what a `blueprint` Adapter that declares
 * no `purposes` serves. The one list the purpose types are derived from. */
export const BLUEPRINT_PURPOSES = [
	"reference_target",
	"fieldset",
	"row_spec",
] as const;

/** The capability a setting choosing for one {@link BlueprintPurpose}
 * needs. */
export type BlueprintPurposeCapability = `blueprint.search:${BlueprintPurpose}`;

/** Every Adapter capability a Field Type may require (ADR-0027, amended). */
export const ADAPTER_CAPABILITIES: readonly AdapterCapability[] = [
	"blueprint.search",
	...BLUEPRINT_PURPOSES.map(blueprintSearchFor),
	"textType.search",
];

/**
 * The part of a Consumer's Adapters a capability is read from — structural,
 * so the schema layer need not know the renderer's `FieldKitAdapters` (which
 * satisfies it).
 */
export interface AdapterCapabilitySource {
	blueprint?: { search?: unknown; purposes?: readonly string[] };
	textType?: { search?: unknown };
}

/** The capability a setting choosing for `purpose` needs. */
export function blueprintSearchFor(
	purpose: BlueprintPurpose,
): BlueprintPurposeCapability {
	return `blueprint.search:${purpose}`;
}

/** The purpose a purpose capability names — looked up, never parsed. */
const PURPOSE_OF = new Map<AdapterCapability, BlueprintPurpose>(
	BLUEPRINT_PURPOSES.map((purpose) => [blueprintSearchFor(purpose), purpose]),
);

/** Whether the `blueprint` Adapter can search, for any purpose. */
function canSearchBlueprints(adapters: AdapterCapabilitySource): boolean {
	return typeof adapters.blueprint?.search === "function";
}

/**
 * Whether the `blueprint` Adapter searches but says it does not serve this
 * purpose — its `purposes` leave it out. That is a setting the Consumer
 * declined, which is hidden, as distinct from a Consumer with no Blueprint
 * search at all, whose setting says the application has no source for it
 * (ADR-0027, amended). Absent `purposes` declines nothing.
 */
export function declinesBlueprintPurpose(
	adapters: AdapterCapabilitySource,
	purpose: BlueprintPurpose,
): boolean {
	const purposes = adapters.blueprint?.purposes;
	return (
		canSearchBlueprints(adapters) &&
		purposes !== undefined &&
		!purposes.includes(purpose)
	);
}

/** Whether the Adapters provide this capability: the Adapter is registered,
 * offers the method and — for a purpose-specific Blueprint capability —
 * serves that purpose. An Adapter without `search` is no source for a
 * picker (ADR-0027). */
export function hasAdapterCapability(
	adapters: AdapterCapabilitySource,
	capability: AdapterCapability,
): boolean {
	const purpose = PURPOSE_OF.get(capability);
	if (purpose) {
		return (
			canSearchBlueprints(adapters) &&
			!declinesBlueprintPurpose(adapters, purpose)
		);
	}
	switch (capability) {
		case "blueprint.search":
			return canSearchBlueprints(adapters);
		case "textType.search":
			return typeof adapters.textType?.search === "function";
	}
	return false;
}

/**
 * Whether a Consumer with these Adapters can serve the type — every capability
 * its `requiresAdapters` names is provided. A type picker offers only the types
 * this holds for; it never invalidates a stored Field (ADR-0027, ADR-0022).
 */
export function servedByAdapters(
	plugin: FieldTypePlugin,
	adapters: AdapterCapabilitySource,
): boolean {
	return (plugin.requiresAdapters ?? []).every((capability) =>
		hasAdapterCapability(adapters, capability),
	);
}
