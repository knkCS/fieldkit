// src/schema/registry.ts
import type {
	Consumer,
	FieldTypeCategory,
	FieldTypePlugin,
	Position,
} from "./plugin";
import { allowedInPosition, offeredToConsumer } from "./positions";

export interface PluginRegistry {
	register(plugin: FieldTypePlugin): void;
	registerAll(plugins: FieldTypePlugin[]): void;
	get(id: string): FieldTypePlugin | undefined;
	getAll(): FieldTypePlugin[];
	getByCategory(category: FieldTypeCategory): FieldTypePlugin[];
	/** The types this Consumer's picker offers (ADR-0022). Advice only. */
	getByConsumer(consumer: Consumer): FieldTypePlugin[];
	/** The types a Field in this Position may be (ADR-0022). */
	getByPosition(position: Position): FieldTypePlugin[];
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

		getByConsumer(consumer) {
			return this.getAll().filter((p) => offeredToConsumer(p, consumer));
		},

		getByPosition(position) {
			return this.getAll().filter((p) => allowedInPosition(p, position));
		},
	};
}
