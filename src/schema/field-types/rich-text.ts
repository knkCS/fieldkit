import { PenLine } from "lucide-react";
import { z } from "zod";
import { RichTextSettingsEditor } from "../../editor/field-settings/rich-text-settings";
import { RichTextField } from "../../renderer/fields/rich-text-field";
import { RichTextCell } from "../../table/cells/rich-text-cell";
import type { CataloguePin, FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { TEXT_TYPE_KIND } from "../vocabulary-version";

export interface RichTextSettings {
	/** The Text Type Release this Field's rich text is written in: a Pin
	 * (ADR-0020), resolved into the Resolved Spec's `parts.text_type`. Replaces
	 * the legacy `editor_spec`, which is now an `unknown_setting` — a Spec
	 * holding it is migrated by renaming the key to `text_type` and pointing it
	 * at a Text Type Release. */
	text_type?: string;
	view_mode?: "full" | "compact";
}

/** The setting holding a rich_text Field's Text Type Pin. */
export const TEXT_TYPE_PIN: CataloguePin = {
	key: "text_type",
	kind: TEXT_TYPE_KIND,
};

export const richTextPlugin: FieldTypePlugin<RichTextSettings> = {
	id: "rich_text",
	name: "Rich Text",
	description: "Rich text content with formatting",
	icon: PenLine,
	category: "text",

	fieldComponent: RichTextField,
	cellComponent: RichTextCell,
	settingsComponent: RichTextSettingsEditor,

	// Rich text is stored as a ProseMirror JSON document. What the document
	// may hold is knkeditor's to say, under the Field's Text Type: Go's
	// ValidateValue delegates to knkeditor's module (#216). TS checks the
	// shape only — the npm side has no knkeditor validator — so an object
	// knkeditor refuses passes here and is `invalid_rich_text` in Go. The
	// shared fixtures that hold such a document are Go-only
	// (conformance/README.md, `goOnly`).
	toZodType(_field: Field<RichTextSettings>) {
		return z.record(z.unknown());
	},

	// The document is knkeditor's inside (ADR-0025): its `attrs: null` and
	// `"attributes": {}` are its own, so the form never strips them and
	// `validateValue` never calls them `not_canonical`.
	opaqueDocument: true,

	settingsSchema: z
		.object({
			text_type: z.string().optional(),
			view_mode: z.enum(["full", "compact"]).optional(),
		})
		.strict(),

	// Its text, its edges and its Compare and Merge are knkeditor's reading of
	// the document, which Go delegates to (#216). The Text Type is a Pin.
	catalogue: { since: "0.18.0", hasText: true, pins: [TEXT_TYPE_PIN] },

	// The Catalogue says rich text has text, and Go's Texts yields knkeditor's
	// reading text. TS has no knkeditor reader (see toZodType), so it yields
	// none: a parity gap the `texts` fixtures holding rich text mark Go-only.
	text: () => "",

	defaultSettings: { view_mode: "full" },
	consumers: ["blueprint", "task", "form"],
	positions: ["root", "reference_spec", "block_type"],
};
