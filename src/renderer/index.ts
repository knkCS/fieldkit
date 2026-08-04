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
