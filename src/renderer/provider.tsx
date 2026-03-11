// src/renderer/provider.tsx
import { type ReactNode, useContext, useMemo } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { FieldKitAdapters } from "./adapters";
import { FieldKitContext, type FieldKitContextValue } from "./context";

export interface FieldKitProviderProps {
	plugins: FieldTypePlugin[];
	adapters?: FieldKitAdapters;
	children: ReactNode;
}

export function FieldKitProvider({
	plugins,
	adapters = {},
	children,
}: FieldKitProviderProps) {
	const value = useMemo<FieldKitContextValue>(() => {
		const pluginMap = new Map(plugins.map((p) => [p.id, p]));

		return {
			getPlugin: (id) => pluginMap.get(id),
			getAllPlugins: () => plugins,
			adapters,
		};
	}, [plugins, adapters]);

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
