// @knkcs/fieldkit/publishing — the opt-in publishing package (ADR-0002,
// amended): Field Types only knkCMS's publishing services use, which nothing
// registers by default. A Consumer opts in by adding them to the plugins it
// passes — `[...builtInFieldTypes, ...publishingFieldTypes]` — to
// FieldKitProvider, the editor, validateSpec, validateValue and the rest.
//
// Their Catalogue section is its own file, `go/publishing/catalogue.json`,
// shipped as `@knkcs/fieldkit/publishing/catalogue.json` and embedded by the
// Go package `github.com/knkcs/fieldkit/go/publishing`.
//
// Their editing UI is optional until it is ported: a Consumer attaches its
// own by spreading a plugin — `{ ...manipulationTreePlugin, fieldComponent:
// Mine }` — and passing that instead.

import type { FieldTypePlugin } from "../schema/plugin";
import { manipulationTreePlugin } from "./field-types/manipulation-tree";
import { outlineTreePlugin } from "./field-types/outline-tree";
import { referenceFilterPlugin } from "./field-types/reference-filter";
import { templateTextPlugin } from "./field-types/template-text";
import { tiOverlayPlugin } from "./field-types/ti-overlay";

export type {
	ManipulationIntent,
	ManipulationNode,
	ManipulationReplacement,
	ManipulationTreeSettings,
} from "./field-types/manipulation-tree";
export { MANIPULATION_INTENTS } from "./field-types/manipulation-tree";
export type {
	OutlineNode,
	OutlineTreeSettings,
} from "./field-types/outline-tree";
export type { ReferenceFilterSettings } from "./field-types/reference-filter";
export type { TemplateTextSettings } from "./field-types/template-text";
export type {
	InlineAnchor,
	TiOverlayEntry,
	TiOverlaySettings,
	TiOverlayValue,
} from "./field-types/ti-overlay";
export {
	INLINE_ANCHOR_WINDOW,
	inlineAnchorSchema,
	TI_SET_KIND,
	TI_SET_PIN,
	TiOverlayCell,
	TiOverlayField,
	tiOverlayEntrySchema,
	tiOverlayPlugin,
} from "./field-types/ti-overlay";
export { OutlineTreeCell, OutlineTreeField } from "./fields/outline-tree-view";
export { UnportedField } from "./fields/unported-field";
export {
	manipulationTreePlugin,
	outlineTreePlugin,
	referenceFilterPlugin,
	templateTextPlugin,
};

/** Every publishing type: the publishing Catalogue section's plugins. */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const publishingFieldTypes: FieldTypePlugin<any>[] = [
	manipulationTreePlugin,
	referenceFilterPlugin,
	outlineTreePlugin,
	templateTextPlugin,
	tiOverlayPlugin,
];
