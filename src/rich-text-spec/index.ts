// @knkcs/fieldkit/rich-text-spec — Rich text editor specification

// Types
export type {
	EditorNodePlugin,
	EditorSpec,
	NodeOptions,
	EditorNodeCategory,
} from "./types";

// Editor component
export { EditorSpecEditor } from "./editor-spec-editor";
export type { EditorSpecEditorProps } from "./editor-spec-editor";

// Built-in plugins
export {
	builtInMarkPlugins,
	builtInNodePlugins,
	builtInEditorPlugins,
} from "./node-plugins";
