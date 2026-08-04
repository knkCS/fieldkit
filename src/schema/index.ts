// @knkcs/fieldkit/schema — Field types, registry, Zod generation, defineSpec()

export { boolean, number, section, select, text } from "./builders";
export type { DefineSpecOptions, SpecDefinition } from "./define-spec";
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
	FieldsetSettings,
	GroupSettings,
	ListSettings,
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
	cardPlugin,
	checkboxesPlugin,
	codePlugin,
	colorPlugin,
	complexTextFieldTypes,
	datePlugin,
	emailPlugin,
	fieldsetPlugin,
	groupPlugin,
	listPlugin,
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
export type { SectionSettings } from "./field-types/section";
// Marker convention
export {
	type MarkerConvention,
	resolveMarkerConvention,
} from "./marker-convention";
// Partition
export {
	partitionSchemaBySections,
	type SpecPartition,
	type SpecTab,
} from "./partition";
// Card partition (within one tab)
export {
	type CardGroup,
	type CardPartition,
	partitionTabByCards,
} from "./partition-cards";
// Plugin types
export type {
	CellProps,
	ComposeChildrenDefaults,
	ComposeChildrenSchema,
	FieldContext,
	FieldProps,
	FieldTypeCategory,
	FieldTypePlugin,
	SettingsProps,
} from "./plugin";
export type { PluginRegistry } from "./registry";
// Registry
export { createRegistry } from "./registry";
// Spec resolution (adapter-backed containers → Resolved Spec)
export type {
	BlueprintSchemaAdapter,
	BlueprintSummary,
	ResolveSpecAdapters,
} from "./resolve-spec";
export { resolveSpec } from "./resolve-spec";
// Types
export type {
	Field,
	FieldCondition,
	FieldConfig,
	FieldValidation,
	Schema,
} from "./types";
// Spec validation
export type {
	SpecFieldError,
	SpecFieldErrorCode,
	SpecValidationResult,
} from "./validate-spec";
export { validateSpec } from "./validate-spec";
// Zod builder
export type { ZodBuilderOptions } from "./zod-builder";
export { getDefaultValues, specToZodSchema } from "./zod-builder";
