import { PenLine } from "lucide-react";
import { z } from "zod";
import { RichTextField } from "../../renderer/fields/rich-text-field";
import { RichTextCell } from "../../table/cells/rich-text-cell";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface RichTextSettings {
	editor_spec?: string;
	view_mode?: "full" | "compact";
}

export const richTextPlugin: FieldTypePlugin<RichTextSettings> = {
	id: "rich_text",
	name: "Rich Text",
	description: "Rich text content with formatting",
	icon: PenLine,
	category: "text",

	fieldComponent: RichTextField,
	cellComponent: RichTextCell,

	toZodType(_field: Field<RichTextSettings>) {
		// Rich text content is stored as JSON (ProseMirror document structure)
		return z.any();
	},

	defaultSettings: { view_mode: "full" },
	availableIn: ["blueprint", "task", "form"],
};
