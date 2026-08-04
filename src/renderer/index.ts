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
// its Adapter can. `depthCeiling` is a depth index, roots being 0 —
// `referenceDepthCeiling` in `/schema` converts a `max_depth` setting into one.
// `onInsert` is what puts the insertion strips on the tree: it is asked to find
// a Content for the gap somebody clicked, and hands back the write that puts
// one there (ADR-0012). Without it there are no strips, since only a Consumer's
// own Adapter can produce a Reference. The request also carries `destination` —
// the sentence the strip announced, including any rows it will adopt — to be
// shown by whatever opens next, rather than phrased a second time.
export {
	type ReferenceInsertRequest,
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
