// @knkcs/fieldkit/schema — Field types, registry, Zod generation, defineSpec()

export { boolean, number, section, select, text } from "./builders";
export type { SpecDefinition } from "./define-spec";
// Builder API
export { defineSpec } from "./define-spec";
export type {
	ArraySettings,
	BlockDefinition,
	BlocksSettings,
	CheckboxesSettings,
	CodeSettings,
	ColorSettings,
	DateSettings,
	EmailSettings,
	GroupSettings,
	MarkdownSettings,
	MediaSettings,
	NumberSettings,
	RadioSettings,
	ReferenceSettings,
	RichTextSettings,
	SelectSettings,
	SlugSettings,
	TextareaSettings,
	TextSettings,
	TocReferenceSettings,
	UrlSettings,
	VirtualTableSettings,
} from "./field-types";
// Built-in field type plugins
export {
	arrayPlugin,
	blocksPlugin,
	booleanPlugin,
	builtInFieldTypes,
	checkboxesPlugin,
	codePlugin,
	colorPlugin,
	complexTextFieldTypes,
	datePlugin,
	emailPlugin,
	groupPlugin,
	markdownPlugin,
	mediaPlugin,
	numberPlugin,
	radioPlugin,
	referenceFieldTypes,
	referencePlugin,
	richTextPlugin,
	sectionPlugin,
	selectionFieldTypes,
	selectPlugin,
	simpleFieldTypes,
	slugPlugin,
	structuralFieldTypes,
	textareaPlugin,
	textPlugin,
	timePlugin,
	tocReferencePlugin,
	urlPlugin,
	virtualTablePlugin,
} from "./field-types";
// Plugin types
export type {
	CellProps,
	FieldContext,
	FieldProps,
	FieldTypeCategory,
	FieldTypePlugin,
	SettingsProps,
} from "./plugin";
export type { PluginRegistry } from "./registry";
// Registry
export { createRegistry } from "./registry";
// Types
export type {
	Field,
	FieldCondition,
	FieldConfig,
	FieldValidation,
	Schema,
} from "./types";
// Zod builder
export type { ZodBuilderOptions } from "./zod-builder";
export { getDefaultValues, specToZodSchema } from "./zod-builder";
