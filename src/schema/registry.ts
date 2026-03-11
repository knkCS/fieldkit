// src/schema/registry.ts
import type {
	FieldContext,
	FieldTypeCategory,
	FieldTypePlugin,
} from "./plugin";

export interface PluginRegistry {
	register(plugin: FieldTypePlugin): void;
	registerAll(plugins: FieldTypePlugin[]): void;
	get(id: string): FieldTypePlugin | undefined;
	getAll(): FieldTypePlugin[];
	getByCategory(category: FieldTypeCategory): FieldTypePlugin[];
	getByContext(context: FieldContext): FieldTypePlugin[];
}

export function createRegistry(): PluginRegistry {
	const plugins = new Map<string, FieldTypePlugin>();

	return {
		register(plugin) {
			if (plugins.has(plugin.id)) {
				throw new Error(`Field type "${plugin.id}" is already registered`);
			}
			plugins.set(plugin.id, plugin);
		},

		registerAll(list) {
			for (const plugin of list) {
				this.register(plugin);
			}
		},

		get(id) {
			return plugins.get(id);
		},

		getAll() {
			return Array.from(plugins.values());
		},

		getByCategory(category) {
			return this.getAll().filter((p) => p.category === category);
		},

		getByContext(context) {
			return this.getAll().filter(
				(p) => !p.availableIn || p.availableIn.includes(context),
			);
		},
	};
}
