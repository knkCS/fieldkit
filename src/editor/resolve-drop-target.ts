// src/editor/resolve-drop-target.ts
import type { SpecPartition } from "../schema/partition";
import type { Field, Schema } from "../schema/types";
import { flatInsertIndex } from "./draft-ops";

/** The card marker owning `field`: the nearest preceding `card` in the
 * flat schema, cut off at a `section` boundary (cards never span tabs).
 * Null for loose fields with no marker before them in their tab.
 * (Moved verbatim from editor-canvas.tsx — 0.11.0 drag-feedback rework.) */
export function owningCard(schema: Schema, field: Field): Field | null {
	const index = schema.indexOf(field);
	for (let i = index - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") return schema[i];
	}
	return null;
}

/** The card marker whose body contains the insertion SLOT before flat index
 * `slotIndex` — `owningCard`'s walk, but from a slot instead of a field:
 * the slot right after a marker (the card's top) belongs to that marker. */
function owningCardOfSlot(schema: Schema, slotIndex: number): string | null {
	for (let i = slotIndex - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") {
			return schema[i].config.api_accessor;
		}
	}
	return null;
}

export interface FieldDropTarget {
	kind: "field";
	/** The active field's current flat index (moveField's fromIndex). */
	fromIndex: number;
	/** moveField's splice index (post-removal dialect) — the card-marker
	 * snap (upward drags land one past the marker) already applied. */
	targetIndex: number;
	/** The PRE-removal flat index the indicator line precedes
	 * (draft.length = the end of the last tab). */
	indicatorIndex: number;
	/** Where the line renders, in the ⊕ insertion-boundary dialect —
	 * flatInsertIndex(draft, partition, tabIndex, position) equals
	 * indicatorIndex. Null only if no boundary maps (defensive; duplicate
	 * consumer-schema accessors can defeat the accessor-keyed lookup). */
	indicator: { tabIndex: number; position: number } | null;
	/** The card whose body contains the insertion slot — the ONE frame to
	 * tint (Decision 4); null in card-less tabs and before a leading
	 * implicit (hand-written-schema) group. */
	tintCardAccessor: string | null;
}

export interface CardBlockDropTarget {
	kind: "card-block";
	targetCardAccessor: string;
	placement: "before" | "after";
}

export interface TabDropTarget {
	kind: "tab";
	tabIndex: number;
}

export type ResolvedDropTarget =
	| FieldDropTarget
	| CardBlockDropTarget
	| TabDropTarget;

/** Maps a flat insertion index back to the (tabIndex, position) dialect the
 * canvas renders boundaries with — probed through `flatInsertIndex` itself,
 * so line geometry and ⊕ boundaries can never disagree. */
function indicatorPosition(
	draft: Schema,
	partition: SpecPartition,
	indicatorIndex: number,
): { tabIndex: number; position: number } | null {
	for (let tabIndex = 0; tabIndex < partition.tabs.length; tabIndex++) {
		const length = partition.tabs[tabIndex].fields.length;
		for (let position = 0; position <= length; position++) {
			if (
				flatInsertIndex(draft, partition, tabIndex, position) === indicatorIndex
			) {
				return { tabIndex, position };
			}
		}
	}
	return null;
}

/**
 * ONE source of truth for "where would releasing land this drag?" — used by
 * BOTH handleDragEnd (which applies it) and the live drag feedback (the
 * indicator line, card tint, and tab-trigger highlight render from the same
 * answer, so they can never disagree with the drop; drag-feedback spec
 * 2026-07-14, Decisions 3–4). Returns null for every no-op: self drops,
 * no-moves, own-tab trigger drops (fields AND cards), and unresolvable ids.
 * The decision logic is a verbatim port of the pre-0.11 handleDragEnd — drop
 * SEMANTICS are frozen.
 */
export function resolveDropTarget(
	activeId: string,
	overId: string,
	draft: Schema,
	partition: SpecPartition,
): ResolvedDropTarget | null {
	// Card block move — checked BEFORE the shared tabdrop branch because a
	// card's OWN-tab trigger guard needs the card-aware source lookup.
	const activeField = draft.find((f) => f.config.api_accessor === activeId);
	if (activeField?.field_type === "card") {
		if (overId.startsWith("tabdrop-")) {
			const tabIndex = Number(overId.slice("tabdrop-".length));
			const sourceTabIndex = partition.tabs.findIndex((tab) =>
				tab.fields.some((f) => f.config.api_accessor === activeId),
			);
			// Own-tab trigger: releasing there must be a no-op, exactly like
			// the field path below.
			if (sourceTabIndex === tabIndex) return null;
			return { kind: "tab", tabIndex };
		}
		const overField = draft.find((f) => f.config.api_accessor === overId);
		if (!overField) return null;
		// Resolve the card OWNING the drop target: the target marker itself,
		// or a field's nearest preceding marker — block moves snap to card
		// boundaries (a mid-card insertion would split the target card in
		// the flat model).
		const targetCard =
			overField.field_type === "card"
				? overField
				: owningCard(draft, overField);
		if (!targetCard || targetCard.config.api_accessor === activeId) {
			return null;
		}
		// 0.12.0 (spring-loaded sections): the 0.8.0 same-tab guard is gone.
		// A visible foreign card is a LEGITIMATE target now — the only way a
		// foreign tab's cards become visible mid-drag is an explicit spring
		// (pointer dwell / keyboard zone landing); hidden tabs' droppables
		// stay filtered by isVisibleDroppable, so accidental cross-tab moves
		// remain impossible.
		const fromIndex = draft.indexOf(activeField);
		const toIndex = draft.indexOf(targetCard);
		return {
			kind: "card-block",
			targetCardAccessor: targetCard.config.api_accessor,
			placement: fromIndex < toIndex ? "after" : "before",
		};
	}

	if (overId.startsWith("tabdrop-")) {
		const tabIndex = Number(overId.slice("tabdrop-".length));
		// Releasing over the field's OWN tab trigger must be a no-op:
		// moveFieldToSection appends to the target tab, so an unguarded
		// self-drop would silently jump the field to its tab's end.
		const sourceTabIndex = partition.tabs.findIndex((tab) =>
			tab.fields.some((f) => f.config.api_accessor === activeId),
		);
		if (sourceTabIndex === tabIndex) return null;
		return { kind: "tab", tabIndex };
	}

	if (activeId === overId) return null;
	const fromIndex = draft.findIndex((f) => f.config.api_accessor === activeId);
	const toIndex = draft.findIndex((f) => f.config.api_accessor === overId);
	if (fromIndex === -1 || toIndex === -1) return null;
	// Dropping a FIELD onto a `card` MARKER must land it INSIDE that card,
	// not before it in the flat array: on a DOWNWARD drag splicing at
	// toIndex already lands right after the marker (toIndex shifts down by
	// one once the source is removed); snap UPWARD drags one slot past the
	// marker so they land inside it too — otherwise a tab's FIRST card
	// would strand the field ahead of every card (a
	// loose_field_in_carded_tab violation).
	const overField = draft[toIndex];
	const targetIndex =
		overField.field_type === "card" && fromIndex > toIndex
			? toIndex + 1
			: toIndex;
	// The marker snap can resolve to the field's own slot (a card's first
	// field dropped on its own marker): pre-0.11 this applied
	// moveField(i, i), which returns the schema unchanged — null is the
	// same end state and keeps the live feedback honest (no line for a
	// drop that moves nothing).
	if (targetIndex === fromIndex) return null;
	// The line precedes this PRE-removal flat index: splicing at
	// targetIndex (post-removal dialect) lands the field immediately before
	// the item currently at targetIndex (upward drags) or at targetIndex + 1
	// (downward drags — removing the source shifts later items up by one).
	const indicatorIndex =
		targetIndex < fromIndex ? targetIndex : targetIndex + 1;
	return {
		kind: "field",
		fromIndex,
		targetIndex,
		indicatorIndex,
		indicator: indicatorPosition(draft, partition, indicatorIndex),
		tintCardAccessor: owningCardOfSlot(draft, indicatorIndex),
	};
}
