// src/rich-text-spec/node-plugins/core-nodes.ts
import type { EditorNodePlugin } from "../types";
import {
	Heading,
	Pilcrow,
	Quote,
	List,
	ListOrdered,
	Table,
	Minus,
	Code,
} from "lucide-react";

export const headingPlugin: EditorNodePlugin = {
	id: "heading",
	name: "Heading",
	description: "Section headings (H1-H6)",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	settingsSpec: [
		{
			field_type: "text",
			config: {
				name: "Levels",
				api_accessor: "levels",
				required: false,
				instructions: "Comma-separated heading levels to allow (e.g. 1,2,3)",
			},
			settings: null,
			children: null,
			system: false,
		},
	],
	defaultSettings: { levels: [1, 2, 3] },
	icon: Heading,
};

export const paragraphPlugin: EditorNodePlugin = {
	id: "paragraph",
	name: "Paragraph",
	description: "Text paragraph block",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	icon: Pilcrow,
};

export const blockquotePlugin: EditorNodePlugin = {
	id: "blockquote",
	name: "Blockquote",
	description: "Quoted text block",
	category: "structure",
	isMark: false,
	defaultEnabled: false,
	icon: Quote,
};

export const bulletListPlugin: EditorNodePlugin = {
	id: "bulletList",
	name: "Bullet List",
	description: "Unordered bullet list",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	icon: List,
};

export const orderedListPlugin: EditorNodePlugin = {
	id: "orderedList",
	name: "Ordered List",
	description: "Numbered ordered list",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	icon: ListOrdered,
};

export const tablePlugin: EditorNodePlugin = {
	id: "table",
	name: "Table",
	description: "Data table with rows and columns",
	category: "structure",
	isMark: false,
	defaultEnabled: false,
	icon: Table,
};

export const horizontalRulePlugin: EditorNodePlugin = {
	id: "horizontalRule",
	name: "Horizontal Rule",
	description: "Horizontal divider line",
	category: "structure",
	isMark: false,
	defaultEnabled: false,
	icon: Minus,
};

export const codeBlockPlugin: EditorNodePlugin = {
	id: "codeBlock",
	name: "Code Block",
	description: "Preformatted code block",
	category: "structure",
	isMark: false,
	defaultEnabled: false,
	icon: Code,
};

export const builtInCoreNodePlugins: EditorNodePlugin[] = [
	headingPlugin,
	paragraphPlugin,
	blockquotePlugin,
	bulletListPlugin,
	orderedListPlugin,
	tablePlugin,
	horizontalRulePlugin,
	codeBlockPlugin,
];
