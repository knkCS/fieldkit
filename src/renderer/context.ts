// src/renderer/context.ts
import { createContext } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { ResolvedSpec } from "../schema/resolve-spec";
import type { FieldKitAdapters } from "./adapters";

export interface FieldKitContextValue {
	getPlugin: (id: string) => FieldTypePlugin | undefined;
	getAllPlugins: () => FieldTypePlugin[];
	adapters: FieldKitAdapters;
	/** The Resolved Spec's opaque parts (`FieldKitProviderProps.parts`), `{}`
	 * when none were given. */
	parts: ResolvedSpec["parts"];
	onError?: (error: Error, fieldId: string) => void;
}

export const FieldKitContext = createContext<FieldKitContextValue | null>(null);
