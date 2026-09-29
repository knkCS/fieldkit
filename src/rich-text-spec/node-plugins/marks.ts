// src/rich-text-spec/node-plugins/marks.ts

import {
	Bold,
	Italic,
	Strikethrough,
	Subscript,
	Superscript,
	Underline,
} from "lucide-react";
import type { EditorNodePlugin } from "../types";

export const boldPlugin: EditorNodePlugin = {
	id: "bold",
	name: "Bold",
	description: "Bold text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: true,
	icon: Bold,
};

export const italicPlugin: EditorNodePlugin = {
	id: "italic",
	name: "Italic",
	description: "Italic text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: true,
	icon: Italic,
};

export const underlinePlugin: EditorNodePlugin = {
	id: "underline",
	name: "Underline",
	description: "Underline text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: true,
	icon: Underline,
};

export const strikePlugin: EditorNodePlugin = {
	id: "strike",
	name: "Strikethrough",
	description: "Strikethrough text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: false,
	icon: Strikethrough,
};

export const subscriptPlugin: EditorNodePlugin = {
	id: "subscript",
	name: "Subscript",
	description: "Subscript text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: false,
	icon: Subscript,
};

export const superscriptPlugin: EditorNodePlugin = {
	id: "superscript",
	name: "Superscript",
	description: "Superscript text formatting",
	category: "formatting",
	isMark: true,
	defaultEnabled: false,
	icon: Superscript,
};

/**
 * All built-in mark plugins.
 *
 * @deprecated Since 0.18; removed in 0.19 (ADR-0026). Text Types replace
 * `/rich-text-spec`: a `rich_text` Field pins a Text Type Release in
 * `settings.text_type`, knkeditor owns the vocabulary and generates the
 * option forms, and blueprinthub owns the Releases. See
 * `docs/migration-0.18.md`.
 */
export const builtInMarkPlugins: EditorNodePlugin[] = [
	boldPlugin,
	italicPlugin,
	underlinePlugin,
	strikePlugin,
	subscriptPlugin,
	superscriptPlugin,
];
