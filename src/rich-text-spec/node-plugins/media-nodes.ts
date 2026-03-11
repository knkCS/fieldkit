// src/rich-text-spec/node-plugins/media-nodes.ts
import type { EditorNodePlugin } from "../types";
import { Image, Link, ExternalLink, StickyNote } from "lucide-react";

export const imagePlugin: EditorNodePlugin = {
	id: "image",
	name: "Image",
	description: "Embedded image block",
	category: "media",
	isMark: false,
	defaultEnabled: false,
	icon: Image,
};

export const contentLinkPlugin: EditorNodePlugin = {
	id: "contentLink",
	name: "Content Link",
	description: "Link to internal content",
	category: "reference",
	isMark: false,
	defaultEnabled: false,
	icon: Link,
};

export const weblinkPlugin: EditorNodePlugin = {
	id: "weblink",
	name: "Web Link",
	description: "Link to external URL",
	category: "reference",
	isMark: false,
	defaultEnabled: true,
	icon: ExternalLink,
};

export const footnotePlugin: EditorNodePlugin = {
	id: "footnote",
	name: "Footnote",
	description: "Footnote reference and content",
	category: "special",
	isMark: false,
	defaultEnabled: false,
	icon: StickyNote,
};

export const builtInMediaNodePlugins: EditorNodePlugin[] = [
	imagePlugin,
	contentLinkPlugin,
	weblinkPlugin,
	footnotePlugin,
];
