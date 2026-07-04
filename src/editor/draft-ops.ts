import { partitionSchemaBySections } from "../schema/partition";
import type { Field, Schema } from "../schema/types";

function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_]/g, "");
	return slug || "section";
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

export function moveField(
	schema: Schema,
	fromIndex: number,
	toIndex: number,
): Schema {
	if (fromIndex < 0 || fromIndex > schema.length - 1) return schema;
	if (toIndex < 0 || toIndex > schema.length) return schema;
	const next = [...schema];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);
	return next;
}

export function uniquifyAccessor(schema: Schema, base: string): string {
	const taken = new Set(schema.map((f) => f.config.api_accessor));
	if (!taken.has(base)) return base;
	if (!taken.has(`${base}_copy`)) return `${base}_copy`;
	let n = 2;
	while (taken.has(`${base}_copy${n}`)) n++;
	return `${base}_copy${n}`;
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
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}_${n}`)) n++;
	return `${base}_${n}`;
}

export function addSection(schema: Schema, name: string): Schema {
	const section: Field = {
		field_type: "section",
		config: {
			name,
			api_accessor: uniquifyAccessor(schema, slugify(name)),
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
	return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
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
