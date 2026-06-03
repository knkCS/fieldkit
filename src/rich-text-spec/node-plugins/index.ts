// src/rich-text-spec/node-plugins/index.ts
import type { EditorNodePlugin } from "../types";
import { builtInCoreNodePlugins } from "./core-nodes";
import { builtInMarkPlugins } from "./marks";
import { builtInMediaNodePlugins } from "./media-nodes";

// Public API: only the aggregate collections are re-exported here. Individual
// node/mark plugins remain internal to their leaf modules (core-nodes.ts,
// marks.ts, media-nodes.ts) — importing them across the module must reference
// those files directly. Keeping this barrel a 1:1 mirror of the public surface
// is what verify-exports asserts against the built .d.ts.
//
// builtInMarkPlugins is re-exported directly because it is itself a leaf
// collection; builtInNodePlugins and builtInEditorPlugins below are new arrays
// composed here. The value import on line 4 is what the builtInEditorPlugins
// spread consumes — do not remove it when touching this re-export.
export { builtInMarkPlugins } from "./marks";

/** All built-in node plugins (core + media). */
export const builtInNodePlugins: EditorNodePlugin[] = [
	...builtInCoreNodePlugins,
	...builtInMediaNodePlugins,
];

/** All built-in editor plugins (marks + nodes). */
export const builtInEditorPlugins: EditorNodePlugin[] = [
	...builtInMarkPlugins,
	...builtInNodePlugins,
];
