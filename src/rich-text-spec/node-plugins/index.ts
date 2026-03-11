// src/rich-text-spec/node-plugins/index.ts
import type { EditorNodePlugin } from "../types";
import { builtInCoreNodePlugins } from "./core-nodes";
import { builtInMarkPlugins } from "./marks";
import { builtInMediaNodePlugins } from "./media-nodes";

export {
	blockquotePlugin,
	builtInCoreNodePlugins,
	bulletListPlugin,
	codeBlockPlugin,
	headingPlugin,
	horizontalRulePlugin,
	orderedListPlugin,
	paragraphPlugin,
	tablePlugin,
} from "./core-nodes";
export {
	boldPlugin,
	builtInMarkPlugins,
	italicPlugin,
	strikePlugin,
	subscriptPlugin,
	superscriptPlugin,
	underlinePlugin,
} from "./marks";
export {
	builtInMediaNodePlugins,
	contentLinkPlugin,
	footnotePlugin,
	imagePlugin,
	weblinkPlugin,
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
