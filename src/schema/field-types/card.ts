import { PanelTop } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

/**
 * Card layout marker (spec 2026-07-10): a purely visual grouping marker one
 * level below `section` — within a tab, fields after the marker belong to
 * the card until the next `card` or `section` marker. `config.name` is the
 * OPTIONAL title (empty = untitled). `settings` carries nothing in v1.
 * No `defaultValue`: markers never produce a form value.
 */
export const cardPlugin: FieldTypePlugin = {
	id: "card",
	name: "Card",
	description: "A visual card that groups the fields after it",
	icon: PanelTop,
	category: "structural",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field) {
		return z.never();
	},

	defaultSettings: {},
	availableIn: ["blueprint", "task", "form"],
};
