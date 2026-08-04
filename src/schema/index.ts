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
	ReferencePluginOptions,
	ReferenceSettings,
	RichTextSettings,
	SelectSettings,
	SingleReferenceSettings,
	SlugSettings,
	TextareaSettings,
	TextSettings,
	UrlSettings,
	VirtualTableSettings,
} from "./field-types";
// Built-in field type plugins, and the factory a Consumer mints its own
// reference-shaped type with (ADR-0010)
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
	createReferencePlugin,
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
	singleReferencePlugin,
	slugPlugin,
	structuralFieldTypes,
	textareaPlugin,
	textPlugin,
	timePlugin,
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
	ReadProps,
	RenderReadValue,
	SettingsProps,
} from "./plugin";
// The Reference value shape
export {
	asReference,
	type PinMode,
	type PinningMode,
	type Reference,
	withPin,
} from "./reference";
// The Reference Tree model — only the parts a Consumer assembling its own
// reference-shaped type needs: the rows `ReferenceTree` renders, and the count
// `max_items` caps. The drag arithmetic stays the tree control's own business.
export {
	countReferences,
	type FlatReference,
	type FlatReferenceValue,
	type ReferenceRow,
	readReferenceTree,
} from "./reference-tree";
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
