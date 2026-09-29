// @knkcs/fieldkit/rich-text-spec — Rich text editor specification
//
// DEPRECATED since 0.18, removed in 0.19 (ADR-0026). Text Types replace this
// layer: knkeditor owns the vocabulary and generates the option forms,
// blueprinthub owns Text Type Releases, and a `rich_text` Field pins one in
// `settings.text_type`. Every export below carries `@deprecated` on its
// declaration (asserted by __tests__/deprecation.test.ts); the migration is in
// docs/migration-0.18.md.

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
