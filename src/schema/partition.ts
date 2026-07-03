import type { SectionSettings } from "./field-types/section";
import type { Field, Schema } from "./types";

export interface SpecTab {
	/** The section field that opens this tab; null for the implicit first tab. */
	section: Field<SectionSettings> | null;
	fields: Field[];
}

export interface SpecPartition {
	tabs: SpecTab[];
	hasSections: boolean;
	/** Whole-form tab orientation, read from the first section. */
	orientation: "horizontal" | "vertical";
}

/**
 * Splits a flat schema into tab partitions at each `section` field.
 * Pure and React-free — shared by SpecForm and the spec editor.
 */
export function partitionSchemaBySections(schema: Schema): SpecPartition {
	const tabs: SpecTab[] = [];
	let current: SpecTab | null = null;
	let firstSection: Field<SectionSettings> | null = null;

	for (const field of schema) {
		if (field.field_type === "section") {
			const section = field as Field<SectionSettings>;
			if (!firstSection) firstSection = section;
			current = { section, fields: [] };
			tabs.push(current);
		} else {
			if (!current) {
				current = { section: null, fields: [] };
				tabs.push(current);
			}
			current.fields.push(field);
		}
	}

	return {
		tabs,
		hasSections: firstSection !== null,
		orientation: firstSection?.settings?.orientation ?? "horizontal",
	};
}
