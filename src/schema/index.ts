// @knkcs/fieldkit/schema — Field types, registry, Zod generation, defineSpec()

// The Blueprint a Fieldset or a linked Virtual Table names — one reader for
// both.
export { linkedBlueprintId } from "./blueprint-link";
export { boolean, number, section, select, text } from "./builders";
// Spec resolution: every Pin → a Resolved Spec envelope (ADR-0020), the same
// answers as the Go module's Resolve and Pins
export { CATALOGUE_VERSION } from "./catalogue-version";
// Edges and Texts over a whole Content: the same answers as the Go module's
// Edges and Texts (contenthub ADRs 0009, 0019)
export {
	type Edge,
	edges,
	type FieldText,
	texts,
	valueText,
} from "./content-walk";
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
	LookupSettings,
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
	lookupPlugin,
	markdownPlugin,
	mediaPlugin,
	numberPlugin,
	radioPlugin,
	referenceDepthCeiling,
	referenceFieldTypes,
	referenceItemCap,
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
// Locked settings (ADR-0011) — reading the list a Consumer freezes settings
// with, and honouring it on a write
export { findLockedSetting, restoreLockedSettings } from "./locked-settings";
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
	CatalogueFacts,
	CataloguePin,
	CellProps,
	ComposeChildrenDefaults,
	ComposeChildrenSchema,
	Consumer,
	EdgeTarget,
	FieldProps,
	FieldTypeCategory,
	FieldTypePlugin,
	HeldRecord,
	HeldSpec,
	MintIdsContext,
	Position,
	ReadProps,
	RenderReadValue,
	SettingsProps,
	SettingsRuleError,
	ValueContext,
	ValueEdge,
} from "./plugin";
// Where a Field may sit (enforced) and which Consumers offer a type (advice),
// ADR-0022
export {
	allowedInPosition,
	CONSUMERS,
	DEFAULT_POSITIONS,
	offeredToConsumer,
	POSITIONS,
	positionsOf,
} from "./positions";
// The Reference value shape, and which Reference Spec a Reference follows
export {
	asReference,
	type PinMode,
	type PinningMode,
	type Reference,
	type ReferenceBlueprint,
	type ReferenceSpecSettings,
	referenceBlueprintIds,
	referenceSpecFor,
	type TargetBlueprint,
	withPin,
} from "./reference";
// The Reference Tree model — only the parts a Consumer assembling its own
// reference-shaped type needs: the rows `ReferenceTree` renders, the count
// `max_items` caps, and where a tree breaks the depth `max_depth` caps. The
// drag arithmetic stays the tree control's own business.
export {
	countReferences,
	type FlatReference,
	type FlatReferenceValue,
	type ReferenceRow,
	readReferenceTree,
	referencesPastDepth,
} from "./reference-tree";
export type { PluginRegistry } from "./registry";
// Registry
export { createRegistry } from "./registry";
export type {
	BlueprintSchemaAdapter,
	BlueprintSummary,
	PartFetcher,
	ResolvedSpec,
	ResolveSpecAdapters,
	ResolveSpecErrorCode,
	ResolveSpecOptions,
	SpecPin,
} from "./resolve-spec";
export {
	RESOLVE_CAPS,
	ResolveSpecError,
	resolveSpec,
	specPins,
} from "./resolve-spec";
// Row `_id`s (ADR-0023): minting them, normalising values loaded without them,
// copying rows, and the `_id`-based value path
export {
	copyRows,
	isRowId,
	mintId,
	mintMissingIds,
	mintRowIds,
	ROW_ID_MAX_LENGTH,
	rowIdSchema,
	toIdPath,
} from "./row-ids";
// `config.search`
export {
	isSearchWeight,
	SEARCH_WEIGHTS,
	type SearchWeight,
} from "./search";
// Types
export type {
	Field,
	FieldCondition,
	FieldConfig,
	FieldValidation,
	LockedSetting,
	Schema,
} from "./types";
// Value validation and the canonical stored form (ADR-0021): the same answers
// as the Go module's ValidateValue.
export { canonicalSpecSettings, canonicalValue, isUnset } from "./unset";
// Spec validation
export type {
	SpecFieldError,
	SpecFieldErrorCode,
	SpecPolicy,
	SpecPolicyError,
	SpecValidationResult,
	ValidateSpecOptions,
} from "./validate-spec";
export { validateSpec } from "./validate-spec";
export type { ValueError, ValueErrorCode } from "./validate-value";
export { VALUE_CAPS, validateValue } from "./validate-value";
// The Virtual Table's Row Spec rule (ADR-0017): which of the two ways a
// Field declares one. What a column may be is the `row` Position (ADR-0022).
export type { VirtualTableRowSpecKind } from "./virtual-table-row-spec";
export { virtualTableRowSpecKind } from "./virtual-table-row-spec";
// Zod builder
export type { ZodBuilderOptions } from "./zod-builder";
export { getDefaultValues, specToZodSchema } from "./zod-builder";
