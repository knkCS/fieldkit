// src/schema/positions.ts
import type { Consumer, FieldTypePlugin, Position } from "./plugin";

/** Every Position, in the order the Catalogue lists them. */
export const POSITIONS: readonly Position[] = [
	"root",
	"row",
	"reference_spec",
	"block_type",
];

/** Every Consumer a built-in type may name. */
export const CONSUMERS: readonly Consumer[] = ["blueprint", "task", "form"];

/**
 * Where a type that declares no `positions` may sit: the root and a Block
 * Type. A Row Spec and a Reference Spec are narrower (ADR-0017, ADR-0022), so a
 * type has to be declared fit for them — a Consumer's own plugin is kept out
 * until it says otherwise, the conservative direction and the cheap one to
 * widen.
 */
export const DEFAULT_POSITIONS: readonly Position[] = ["root", "block_type"];

/** The Positions a type may sit in. */
export function positionsOf(plugin: FieldTypePlugin): readonly Position[] {
	return plugin.positions ?? DEFAULT_POSITIONS;
}

/** Whether a Field of this type may sit in this Position. */
export function allowedInPosition(
	plugin: FieldTypePlugin,
	position: Position,
): boolean {
	return positionsOf(plugin).includes(position);
}

/** Whether this Consumer's type picker offers the type. Advice only. */
export function offeredToConsumer(
	plugin: FieldTypePlugin,
	consumer: Consumer,
): boolean {
	return !plugin.consumers || plugin.consumers.includes(consumer);
}
