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

	defaultSettings: { accept: undefined, max_items: undefined },
	availableIn: ["blueprint", "task", "form"],
};
