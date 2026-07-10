import type { SpecPartition } from "../schema/partition";
import { partitionSchemaBySections } from "../schema/partition";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Field, Schema } from "../schema/types";

/** Ported verbatim from field-modal.tsx:17-22. Shared by draft-ops'
 * addSection (which falls back to "section" for an all-punctuation/empty
 * name) and the panel's ConfigSection (which does NOT fall back — an empty
 * slug there must surface the accessorEmpty validation message instead). */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_]/g, "");
}

export function insertFieldAt(
	schema: Schema,
	field: Field,
	index: number,
): Schema {
	const next = [...schema];
	next.splice(index, 0, field);
	return next;
}

/**
 * Flat schema index for "insert at position `position` of tab `tabIndex`".
 * Position 0 lands right after the tab's opening marker (or at the very
 * start of the schema for the implicit first tab); position k>0 lands
 * right after the tab's (k-1)th field — so `position === tab.fields.length`
 * appends at the end of the tab. An out-of-range tab index falls back to
 * the end of the schema; an overflowing position clamps to the tab's end.
 */
export function flatInsertIndex(
	schema: Schema,
	partition: SpecPartition,
	tabIndex: number,
	position: number,
): number {
	const tab = partition.tabs[tabIndex];
	if (!tab) return schema.length;

	// Clamp: an overflowing position appends at the tab's end instead of
	// falling through to the tab's front.
	const clamped = Math.min(position, tab.fields.length);
	const precedingField = tab.fields[clamped - 1];
	if (precedingField) {
		const idx = schema.findIndex(
			(f) => f.config.api_accessor === precedingField.config.api_accessor,
		);
		return idx + 1;
	}

	if (tab.section) {
		const idx = schema.findIndex(
			(f) =>
				f.field_type === "section" &&
				f.config.api_accessor === tab.section?.config.api_accessor,
		);
		return idx + 1;
	}

	// Implicit first tab, inserting before any of its fields.
	return 0;
}

export function updateField(
	schema: Schema,
	accessor: string,
	next: Field,
): Schema {
	if (!schema.some((f) => f.config.api_accessor === accessor)) return schema;
	return schema.map((f) => (f.config.api_accessor === accessor ? next : f));
}

export function removeField(schema: Schema, accessor: string): Schema {
	if (!schema.some((f) => f.config.api_accessor === accessor)) return schema;
	return schema.filter((f) => f.config.api_accessor !== accessor);
}

/**
 * Removes exactly the field at `index` — unlike `removeField`, safe against
 * consumer-supplied schemas with DUPLICATE accessors (F2): an accessor-keyed
 * removal would delete every field sharing that accessor, destroying the
 * other one's config. Callers resolve the flat index via `schema.indexOf`
 * on the exact field OBJECT reference (draft fields keep stable identity
 * until edited), not by re-searching for the accessor.
 */
export function removeFieldAt(schema: Schema, index: number): Schema {
	if (index < 0 || index >= schema.length) return schema;
	const next = [...schema];
	next.splice(index, 1);
	return next;
}

export function moveField(
	schema: Schema,
	fromIndex: number,
	toIndex: number,
): Schema {
	if (fromIndex < 0 || fromIndex > schema.length - 1) return schema;
	if (toIndex < 0 || toIndex > schema.length) return schema;
	if (fromIndex === toIndex) return schema;
	const next = [...schema];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);
	return next;
}

/**
 * Shared probe loop for `nextAccessor`/`uniquifyAccessor`: returns `base` if
 * it's free, otherwise the first `suffix(n)` (n = 1, 2, 3, …) not already
 * taken. Each call site's `suffix` encodes its own numbering scheme —
 * `nextAccessor`'s plain `_2, _3, …` vs. `uniquifyAccessor`'s unnumbered
 * `_copy` followed by `_copy2, _copy3, …`.
 */
function probeAccessor(
	taken: Set<string>,
	base: string,
	suffix: (n: number) => string,
): string {
	if (!taken.has(base)) return base;
	let n = 1;
	while (taken.has(suffix(n))) n++;
	return suffix(n);
}

export function uniquifyAccessor(schema: Schema, base: string): string {
	const taken = new Set(schema.map((f) => f.config.api_accessor));
	return probeAccessor(taken, base, (n) =>
		n === 1 ? `${base}_copy` : `${base}_copy${n}`,
	);
}

export function duplicateField(schema: Schema, accessor: string): Schema {
	const index = schema.findIndex((f) => f.config.api_accessor === accessor);
	if (index === -1) return schema;
	const original = schema[index];
	const copy: Field = {
		...original,
		system: false, // a copy is always user-created, even when the original is a system field
		config: {
			...original.config,
			api_accessor: uniquifyAccessor(schema, accessor),
		},
	};
	return insertFieldAt(schema, copy, index + 1);
}

/** Accessor for a freshly inserted field: base, base_2, base_3… (no "_copy" — it isn't a copy). */
export function nextAccessor(schema: Schema, base: string): string {
	const taken = new Set(schema.map((f) => f.config.api_accessor));
	return probeAccessor(taken, base, (n) => `${base}_${n + 1}`);
}

/** Builds the default Field for a freshly inserted instance of `plugin`:
 * a unique accessor (via nextAccessor), the plugin's defaultSettings (or
 * null), and system:false (freshly inserted fields are always user-created). */
export function createField(plugin: FieldTypePlugin, schema: Schema): Field {
	return {
		field_type: plugin.id,
		config: {
			name: plugin.name,
			api_accessor: nextAccessor(schema, plugin.id),
			required: false,
			instructions: "",
		},
		settings: plugin.defaultSettings ?? null,
		system: false,
	};
}

export function addSection(schema: Schema, name: string): Schema {
	const section: Field = {
		field_type: "section",
		config: {
			name,
			api_accessor: uniquifyAccessor(schema, slugify(name) || "section"),
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	};
	return [...schema, section];
}

function isSectionMarker(field: Field, sectionAccessor: string): boolean {
	return (
		field.field_type === "section" &&
		field.config.api_accessor === sectionAccessor
	);
}

export function renameSection(
	schema: Schema,
	sectionAccessor: string,
	name: string,
): Schema {
	if (!schema.some((f) => isSectionMarker(f, sectionAccessor))) return schema;
	return schema.map((f) =>
		isSectionMarker(f, sectionAccessor)
			? { ...f, config: { ...f.config, name } }
			: f,
	);
}

/** A section block = the marker plus every field up to the next marker. */
function sectionBlockRange(
	schema: Schema,
	sectionAccessor: string,
): [number, number] | null {
	const start = schema.findIndex(
		(f) =>
			f.field_type === "section" && f.config.api_accessor === sectionAccessor,
	);
	if (start === -1) return null;
	let end = schema.length;
	for (let i = start + 1; i < schema.length; i++) {
		if (schema[i].field_type === "section") {
			end = i;
			break;
		}
	}
	return [start, end];
}

export function moveSection(
	schema: Schema,
	sectionAccessor: string,
	direction: -1 | 1,
): Schema {
	const range = sectionBlockRange(schema, sectionAccessor);
	if (!range) return schema;
	const [start, end] = range;
	const block = schema.slice(start, end);
	const rest = [...schema.slice(0, start), ...schema.slice(end)];

	// Neighbor section blocks in the remaining list, in order.
	const markers = rest
		.map((f, i) => ({ f, i }))
		.filter(({ f }) => f.field_type === "section");
	// Count markers before `start` in the ORIGINAL schema. Since the moved
	// block (marker included) is absent from `rest`, those markers occupy
	// indices 0…precedingMarkers-1 in `markers`, and the first marker AFTER
	// the block sits at index `precedingMarkers` (everything shifted down by
	// the removed marker).
	const precedingMarkers = schema
		.slice(0, start)
		.filter((f) => f.field_type === "section").length;
	const targetMarkerIndex = precedingMarkers + (direction === -1 ? -1 : 0);
	// Moving the first section left is a NO-OP: the implicit tab (leading fields)
	// cannot be displaced — swapping past it would absorb those fields.
	if (direction === -1 && targetMarkerIndex < 0) return schema;
	// No marker after the block → already the last section → NO-OP.
	if (direction === 1 && targetMarkerIndex >= markers.length) return schema;
	const target = markers[targetMarkerIndex];
	if (!target) return schema;
	let insertAt: number;
	if (direction === -1) {
		insertAt = target.i; // before the previous section's marker
	} else {
		// after the next section's whole block
		const afterRange = sectionBlockRange(rest, target.f.config.api_accessor);
		insertAt = afterRange ? afterRange[1] : rest.length;
	}
	const moved = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
	return transferOrientationOnNewFirstSection(schema, moved);
}

/**
 * F7: `setOrientation` writes the whole-form orientation onto the FIRST
 * section marker (partitionSchemaBySections reads it from there too), but
 * `moveSection` can change which section ends up first — without this, the
 * author's orientation choice would silently vanish (the new first section
 * has no `orientation` key, so partition falls back to "horizontal") while a
 * stale, now-shadowed copy sits dead on the section that used to be first.
 *
 * Reads the effective orientation of the INPUT schema's first section and,
 * if the OUTPUT's first section is a different one, writes it onto the new
 * first section and strips the key from the old one (so it doesn't resurface
 * if THAT section is later moved back to first without an explicit toggle).
 */
function transferOrientationOnNewFirstSection(
	input: Schema,
	output: Schema,
): Schema {
	const inputFirstIndex = input.findIndex((f) => f.field_type === "section");
	const outputFirstIndex = output.findIndex((f) => f.field_type === "section");
	if (inputFirstIndex === -1 || outputFirstIndex === -1) return output;

	const inputFirst = input[inputFirstIndex];
	const outputFirst = output[outputFirstIndex];
	if (inputFirst.config.api_accessor === outputFirst.config.api_accessor) {
		return output; // first section unchanged — nothing to transfer
	}

	const orientationSettings = inputFirst.settings as
		| { orientation?: "horizontal" | "vertical" }
		| null
		| undefined;
	const hadOrientation =
		!!orientationSettings && "orientation" in orientationSettings;
	if (!hadOrientation) return output; // nothing set — no-op, no spurious keys

	return output.map((f, i) => {
		if (i === outputFirstIndex) {
			return {
				...f,
				settings: {
					...(f.settings ?? {}),
					orientation: orientationSettings.orientation,
				},
			};
		}
		if (
			f.field_type === "section" &&
			f.config.api_accessor === inputFirst.config.api_accessor
		) {
			const { orientation: _drop, ...restSettings } = f.settings as Record<
				string,
				unknown
			>;
			return { ...f, settings: restSettings };
		}
		return f;
	});
}

export function deleteSection(schema: Schema, sectionAccessor: string): Schema {
	if (!schema.some((f) => isSectionMarker(f, sectionAccessor))) return schema;
	return schema.filter((f) => !isSectionMarker(f, sectionAccessor));
}

export function setOrientation(
	schema: Schema,
	orientation: "horizontal" | "vertical",
): Schema {
	const firstSectionIndex = schema.findIndex((f) => f.field_type === "section");
	if (firstSectionIndex === -1) return schema;
	return schema.map((f, i) =>
		i === firstSectionIndex
			? { ...f, settings: { ...(f.settings ?? {}), orientation } }
			: f,
	);
}

export function moveFieldToSection(
	schema: Schema,
	accessor: string,
	tabIndex: number,
): Schema {
	const field = schema.find((f) => f.config.api_accessor === accessor);
	if (!field) return schema;

	// Partition original schema to find the target tab by index
	const originalPartition = partitionSchemaBySections(schema);
	const targetTab = originalPartition.tabs[tabIndex];
	if (!targetTab) return schema;

	// Remove the field
	const without = removeField(schema, accessor);

	// Partition the modified schema and find the target tab by section marker
	const partition = partitionSchemaBySections(without);
	const tab = partition.tabs.find((t) => {
		if (targetTab.section === null) return t.section === null;
		return (
			t.section?.config.api_accessor === targetTab.section.config.api_accessor
		);
	});

	if (!tab) return schema;
	// Flat index just after the tab's last field (or just after its marker when empty).
	const lastOfTab = tab.fields[tab.fields.length - 1] ?? tab.section;
	if (!lastOfTab) return [field, ...without]; // implicit empty first tab
	const insertAfter = without.findIndex(
		(f) => f.config.api_accessor === lastOfTab.config.api_accessor,
	);
	return insertFieldAt(without, field, insertAfter + 1);
}

/** A card block = the marker plus every field up to the next `card` or
 * `section` marker (cards never span tabs) — the card-layout sibling of
 * `sectionBlockRange`. */
function cardBlockRange(
	schema: Schema,
	cardAccessor: string,
): [number, number] | null {
	const start = schema.findIndex(
		(f) => f.field_type === "card" && f.config.api_accessor === cardAccessor,
	);
	if (start === -1) return null;
	let end = schema.length;
	for (let i = start + 1; i < schema.length; i++) {
		if (schema[i].field_type === "card" || schema[i].field_type === "section") {
			end = i;
			break;
		}
	}
	return [start, end];
}

/**
 * Appends an untitled, empty card to the end of tab `tabIndex`. Decision 4
 * (all-in-cards): adding the FIRST card to a tab that already has loose
 * fields first wraps them by inserting another untitled marker at the tab's
 * start, THEN appends the new card after them. Contract relied on by the
 * canvas: the NEW empty card is always the LAST card marker of the target
 * tab. Markers are untitled (name "") — the title is optional and authored
 * in the config panel — with accessors from `nextAccessor(…, "card")`
 * (card, card_2, card_3, …).
 */
export function insertCard(schema: Schema, tabIndex: number): Schema {
	const partition = partitionSchemaBySections(schema);
	const tab = partition.tabs[tabIndex];
	if (!tab) return schema;

	const makeMarker = (current: Schema): Field => ({
		field_type: "card",
		config: {
			name: "",
			api_accessor: nextAccessor(current, "card"),
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	});

	let next = schema;
	const hasCards = tab.fields.some((f) => f.field_type === "card");
	if (!hasCards && tab.fields.length > 0) {
		next = insertFieldAt(
			next,
			makeMarker(next),
			flatInsertIndex(next, partition, tabIndex, 0),
		);
	}

	// Re-partition: the wrap marker (if inserted) changed the tab's length.
	const nextPartition = partitionSchemaBySections(next);
	return insertFieldAt(
		next,
		makeMarker(next),
		flatInsertIndex(
			next,
			nextPartition,
			tabIndex,
			nextPartition.tabs[tabIndex].fields.length,
		),
	);
}

/**
 * Block move for the card header's drag handle: relocates marker + contained
 * fields as ONE unit, snapped to the target card's block boundary — an
 * arbitrary mid-card insertion would split the target card (fields after the
 * insertion point would silently change owners in the flat model).
 */
export function moveCard(
	schema: Schema,
	cardAccessor: string,
	targetCardAccessor: string,
	position: "before" | "after",
): Schema {
	if (cardAccessor === targetCardAccessor) return schema;
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;
	const block = schema.slice(start, end);
	const rest = [...schema.slice(0, start), ...schema.slice(end)];
	const targetRange = cardBlockRange(rest, targetCardAccessor);
	if (!targetRange) return schema;
	const insertAt = position === "before" ? targetRange[0] : targetRange[1];
	return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

/**
 * "Delete card" (non-destructive): removes ONLY the marker.
 * - A previous card exists in the same tab → its fields absorb them (flat
 *   order already does this once the marker is gone).
 * - FIRST card of its tab with another card after it → the next card's
 *   marker is hoisted above the orphaned fields, so they merge into the
 *   NEXT card instead of going loose (which would violate all-in-cards).
 * - ONLY card of its tab → the tab returns to the bare card-less state,
 *   which is legal again.
 */
export function deleteCardMerge(schema: Schema, cardAccessor: string): Schema {
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;

	// A preceding card marker before any section boundary means a previous
	// card exists in the SAME tab — plain marker removal merges into it.
	for (let i = start - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") break;
		if (schema[i].field_type === "card") {
			return removeFieldAt(schema, start);
		}
	}

	// First card of its tab. cardBlockRange guarantees schema[end] is the
	// next card marker, a section marker, or past the end.
	const nextIsCard = end < schema.length && schema[end].field_type === "card";
	const without = removeFieldAt(schema, start);
	if (!nextIsCard) return without; // only card → bare card-less tab
	// In `without` the next marker sits at end-1; hoist it to `start` so the
	// orphaned fields join the NEXT card (at its front).
	return moveField(without, end - 1, start);
}

/** "Delete card and fields" (destructive; caller confirms): removes the
 * whole block — marker and every contained field. */
export function deleteCardWithFields(
	schema: Schema,
	cardAccessor: string,
): Schema {
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;
	return [...schema.slice(0, start), ...schema.slice(end)];
}
