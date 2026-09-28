// @knkcs/fieldkit/publishing — the opt-in publishing package (ADR-0002,
// amended): Field Types only knkCMS's publishing services use, which nothing
// registers by default. A Consumer opts in by adding them to the plugins it
// passes — `[...builtInFieldTypes, ...publishingFieldTypes]` — to
// FieldKitProvider, the editor, validateSpec, validateValue and the rest.
//
// Their Catalogue section is its own file, `go/publishing/catalogue.json`,
// shipped as `@knkcs/fieldkit/publishing/catalogue.json` and embedded by the
// Go package `github.com/knkcs/fieldkit/go/publishing`.

import type { FieldTypePlugin } from "../schema/plugin";
import { outlineTreePlugin } from "./field-types/outline-tree";
import { referenceFilterPlugin } from "./field-types/reference-filter";
import { templateTextPlugin } from "./field-types/template-text";

export type {
	OutlineNode,
	OutlineTreeSettings,
} from "./field-types/outline-tree";
export type { ReferenceFilterSettings } from "./field-types/reference-filter";
export type { TemplateTextSettings } from "./field-types/template-text";
export {
	countOutlineNodes,
	OutlineTreeCell,
	OutlineTreeField,
} from "./fields/outline-tree-view";
export { outlineTreePlugin, referenceFilterPlugin, templateTextPlugin };

/** Every publishing type: the publishing Catalogue section's plugins. */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const publishingFieldTypes: FieldTypePlugin<any>[] = [
	referenceFilterPlugin,
	outlineTreePlugin,
	templateTextPlugin,
];
