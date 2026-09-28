import { Image } from "lucide-react";
import { z } from "zod";
import { MediaField } from "../../renderer/fields/media-field";
import { MediaCell } from "../../table/cells/media-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface MediaSettings {
	accept?: string[];
	max_items?: number;
}

export const mediaPlugin: FieldTypePlugin<MediaSettings> = {
	id: "media",
	name: "Media",
	description: "Upload or select media files",
	icon: Image,
	category: "media",

	fieldComponent: MediaField,
	cellComponent: MediaCell,

	toZodType(field: Field<MediaSettings>) {
		let schema = z.array(z.string());

		if (field.config.required) {
			schema = schema.min(1, `${field.config.name} is required`);
		}

		return schema;
	},

	settingsSchema: z
		.object({
			accept: z.array(z.string()).optional(),
			max_items: z.number().int().nonnegative().optional(),
		})
		.strict(),

	catalogue: { since: "0.18.0", hasText: false, pins: [] },

	// Its value is a list of Asset ids: one `media` edge per Asset, at the
	// Field itself — the value is one whole, never addressed by index
	// (ADR-0023) — and an Asset listed twice is one edge.
	edges(_field, value) {
		if (!Array.isArray(value)) return [];
		const assets = new Set(
			value.filter((id): id is string => typeof id === "string" && !!id),
		);
		return [...assets].map((asset) => ({
			kind: "media",
			target: { asset },
		}));
	},

	defaultSettings: { accept: undefined, max_items: undefined },

	defaultValue: () => [],

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
