// @knkcs/fieldkit/renderer — Field renderer

// Adapters
export type {
	BlueprintSummary,
	DataPage,
	DataQuery,
	EditorSpecData,
	EditorSpecGlobalSettings,
	FieldKitAdapters,
	MediaFilter,
	MediaItem,
	PinTarget,
	ReferenceItem,
	ReferenceSearchQuery,
	ReferenceSearchResult,
} from "./adapters";
export type { FieldComponentProps } from "./field-component";
export { FieldComponent } from "./field-component";
export { FieldErrorBoundary } from "./field-error-boundary";
export type { FieldRendererProps } from "./field-renderer";
// Components
export { FieldRenderer } from "./field-renderer";
// Read mode's "nothing to show" em dash, for a Consumer writing a plugin's
// `readComponent` (see `ReadProps` in `/schema`): read mode renders this for
// an empty value before any plugin is consulted, and a read component
// rendering its own dash for a malformed one should render the same thing.
export { EmptyReadValue } from "./fields/empty-value";
// The Reference Tree control — the rows *inside* the Reference Field, not the
// Field itself — exported so a Consumer can assemble a reference-shaped type
// around it rather than rebuild one (ADR-0010). Feed it `readReferenceTree`'s
// rows from `/schema`; resolving `names` is the Consumer's own job, since only
// its Adapter can. `depthCeiling` is a seam nothing fills in yet and is not
// settled until caps land.
export {
	ReferenceTree,
	type ReferenceTreeProps,
} from "./fields/reference-tree";
export type { FieldKitProviderProps } from "./provider";
// Provider
export { FieldKitProvider, useFieldKit } from "./provider";
// SpecForm
export {
	SpecForm,
	type SpecFormLabels,
	type SpecFormProps,
} from "./spec-form/spec-form";
