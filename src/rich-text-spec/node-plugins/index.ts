// src/rich-text-spec/node-plugins/index.ts
import type { EditorNodePlugin } from "../types";
import { builtInMarkPlugins } from "./marks";
import { builtInCoreNodePlugins } from "./core-nodes";
import { builtInMediaNodePlugins } from "./media-nodes";

export { builtInMarkPlugins } from "./marks";
export {
	boldPlugin,
	italicPlugin,
	underlinePlugin,
	strikePlugin,
	subscriptPlugin,
	superscriptPlugin,
} from "./marks";

export { builtInCoreNodePlugins } from "./core-nodes";
export {
	headingPlugin,
	paragraphPlugin,
	blockquotePlugin,
	bulletListPlugin,
	orderedListPlugin,
	tablePlugin,
	horizontalRulePlugin,
	codeBlockPlugin,
} from "./core-nodes";

export { builtInMediaNodePlugins } from "./media-nodes";
export {
	imagePlugin,
	contentLinkPlugin,
	weblinkPlugin,
	footnotePlugin,
} from "./media-nodes";

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
