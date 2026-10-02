import { Link as LinkIcon } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { SlugField } from "../../renderer/fields/slug-field";
import { SlugCell } from "../../table/cells/slug-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { stringText } from "../value-text";

export interface SlugSettings {
	source_field?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugPlugin: FieldTypePlugin<SlugSettings> = {
	id: "slug",
	name: "Slug",
	description: "A URL-friendly identifier",
	icon: LinkIcon,
	category: "text",

	fieldComponent: SlugField,
	cellComponent: SlugCell,

	toZodType(_field: Field<SlugSettings>): ZodTypeAny {
		return z
			.string()
			.regex(
				SLUG_PATTERN,
				"Must be a valid slug (lowercase letters, numbers, and hyphens)",
			);
	},

	settingsSchema: z
		.object({
			source_field: z.string().optional(),
		})
		.strict(),

	catalogue: {
		since: "0.18.0",
		hasText: true,
		pins: [],
		validations: ["unique"],
	},
	text: stringText,

	defaultSettings: {},

	defaultValue: () => "",

	consumers: ["blueprint", "task", "form"],
	positions: ["root", "row", "reference_spec", "block_type"],
};
