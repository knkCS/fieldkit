// @knkcs/fieldkit/rich-text — the knkeditor-backed rich_text field (ADR-0026).
//
// Opt-in, the way the publishing package is: nothing else in fieldkit imports
// it, so only a Consumer who imports this subpath pays for knkeditor's peers
// (`@knkcms/knkeditor-editor` and the extensions, TipTap, i18next and emotion
// it declares). Without it, the core renderer shows a rich_text Field
// read-only.
//
// A Consumer opts in by passing a rich_text plugin with these components in
// place of the built-in one — `knkRichTextPlugin`, or spread it itself:
// `{ ...richTextPlugin, fieldComponent: KnkRichTextField, readComponent:
// KnkRichTextRead }` — and hands the Resolved Spec's `parts` to
// `FieldKitProvider`, so each Field finds its Text Type there.

import { richTextPlugin } from "../schema/field-types/rich-text";
import type { FieldTypePlugin } from "../schema/plugin";
import { KnkRichTextField, KnkRichTextRead } from "./knk-rich-text-field";

export { KnkRichTextField, KnkRichTextRead } from "./knk-rich-text-field";

/** The built-in `rich_text` plugin with the knkeditor-backed field and read
 * view: pass it in place of `richTextPlugin` among the plugins. Everything
 * but the two components is the built-in plugin's, so the Catalogue, the Zod
 * type and the settings editor are unchanged. */
export const knkRichTextPlugin: FieldTypePlugin = {
	...(richTextPlugin as FieldTypePlugin),
	fieldComponent: KnkRichTextField as FieldTypePlugin["fieldComponent"],
	readComponent: KnkRichTextRead as FieldTypePlugin["readComponent"],
};
