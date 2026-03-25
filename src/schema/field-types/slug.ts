import { Link as LinkIcon } from "lucide-react";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { SlugField } from "../../renderer/fields/slug-field";
import { SlugCell } from "../../table/cells/slug-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

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

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
