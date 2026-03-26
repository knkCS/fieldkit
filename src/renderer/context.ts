// src/renderer/context.ts
import { createContext } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { FieldKitAdapters } from "./adapters";

export interface FieldKitContextValue {
	getPlugin: (id: string) => FieldTypePlugin | undefined;
	getAllPlugins: () => FieldTypePlugin[];
	adapters: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
}

export const FieldKitContext = createContext<FieldKitContextValue | null>(null);
