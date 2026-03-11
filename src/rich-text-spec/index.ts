// @knkcs/fieldkit/rich-text-spec — Rich text editor specification

export type { EditorSpecEditorProps } from "./editor-spec-editor";

// Editor component
export { EditorSpecEditor } from "./editor-spec-editor";
// Built-in plugins
export {
	builtInEditorPlugins,
	builtInMarkPlugins,
	builtInNodePlugins,
} from "./node-plugins";
// Types
export type {
	EditorNodeCategory,
	EditorNodePlugin,
	EditorSpec,
	NodeOptions,
} from "./types";
