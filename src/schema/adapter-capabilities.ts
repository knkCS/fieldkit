// src/schema/adapter-capabilities.ts
import type { AdapterCapability, FieldTypePlugin } from "./plugin";

/** Every Adapter capability a Field Type may require (ADR-0027). */
export const ADAPTER_CAPABILITIES: readonly AdapterCapability[] = [
	"blueprint.search",
	"textType.search",
];

/**
 * The part of a Consumer's Adapters a capability is read from — structural,
 * so the schema layer need not know the renderer's `FieldKitAdapters` (which
 * satisfies it).
 */
export interface AdapterCapabilitySource {
	blueprint?: { search?: unknown };
	textType?: { search?: unknown };
}

/** Whether the Adapters provide this capability: the Adapter is registered
 * and offers the method. An Adapter without `search` is no source for a
 * picker (ADR-0027). */
export function hasAdapterCapability(
	adapters: AdapterCapabilitySource,
	capability: AdapterCapability,
): boolean {
	switch (capability) {
		case "blueprint.search":
			return typeof adapters.blueprint?.search === "function";
		case "textType.search":
			return typeof adapters.textType?.search === "function";
	}
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
