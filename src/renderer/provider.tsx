// src/renderer/provider.tsx
import { type ReactNode, useContext, useMemo } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { ResolvedSpec } from "../schema/resolve-spec";
import type { FieldKitAdapters } from "./adapters";
import { FieldKitContext, type FieldKitContextValue } from "./context";

export interface FieldKitProviderProps {
	plugins: FieldTypePlugin[];
	adapters?: FieldKitAdapters;
	/**
	 * The opaque parts of the Resolved Spec the forms inside render
	 * (`resolveSpec(...).parts`, ADR-0020): a resolved Text Type per Text Type
	 * Release id under `text_type`, and so on. A Field that pins one reads it
	 * from here — the knkeditor-backed `rich_text` field of
	 * `@knkcs/fieldkit/rich-text` does — and falls back to its adapter when
	 * the part is missing. Fieldkit never looks inside.
	 */
	parts?: ResolvedSpec["parts"];
	onError?: (error: Error, fieldId: string) => void;
	children: ReactNode;
}

/** One empty `parts` for every provider given none, so the context value
 * stays stable across renders. */
const NO_PARTS: ResolvedSpec["parts"] = {};

export function FieldKitProvider({
	plugins,
	adapters = {},
	parts = NO_PARTS,
	onError,
	children,
}: FieldKitProviderProps) {
	const value = useMemo<FieldKitContextValue>(() => {
		const pluginMap = new Map(plugins.map((p) => [p.id, p]));

		return {
			getPlugin: (id) => pluginMap.get(id),
			getAllPlugins: () => plugins,
			adapters,
			parts,
			onError,
		};
	}, [plugins, adapters, parts, onError]);

	return (
		<FieldKitContext.Provider value={value}>
			{children}
		</FieldKitContext.Provider>
	);
}
FieldKitProvider.displayName = "FieldKitProvider";

export function useFieldKit(): FieldKitContextValue {
	const context = useContext(FieldKitContext);
	if (!context) {
		throw new Error("useFieldKit must be used within a FieldKitProvider");
	}
	return context;
}
