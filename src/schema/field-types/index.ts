import type { FieldTypePlugin } from "../plugin";
import { arrayPlugin } from "./array";
import { blocksPlugin } from "./blocks";
import { booleanPlugin } from "./boolean";
import { checkboxesPlugin } from "./checkboxes";
import { codePlugin } from "./code";
import { colorPlugin } from "./color";
import { datePlugin } from "./date";
import { emailPlugin } from "./email";
import { groupPlugin } from "./group";
import { markdownPlugin } from "./markdown";
import { mediaPlugin } from "./media";
import { numberPlugin } from "./number";
import { radioPlugin } from "./radio";
import { referencePlugin } from "./reference";
import { richTextPlugin } from "./rich-text";
import { sectionPlugin } from "./section";
import { selectPlugin } from "./select";
import { slugPlugin } from "./slug";
import { textPlugin } from "./text";
import { textareaPlugin } from "./textarea";
import { timePlugin } from "./time";
import { tocReferencePlugin } from "./toc-reference";
import { urlPlugin } from "./url";
import { virtualTablePlugin } from "./virtual-table";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const simpleFieldTypes: FieldTypePlugin<any>[] = [
	textPlugin,
	textareaPlugin,
	numberPlugin,
	booleanPlugin,
	colorPlugin,
	emailPlugin,
	urlPlugin,
	timePlugin,
	datePlugin,
	slugPlugin,
];

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const selectionFieldTypes: FieldTypePlugin<any>[] = [
	selectPlugin,
	radioPlugin,
	checkboxesPlugin,
];

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const structuralFieldTypes: FieldTypePlugin<any>[] = [
	sectionPlugin,
	groupPlugin,
	blocksPlugin,
	arrayPlugin,
];

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const complexTextFieldTypes: FieldTypePlugin<any>[] = [
	markdownPlugin,
	codePlugin,
	richTextPlugin,
];

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const referenceFieldTypes: FieldTypePlugin<any>[] = [
	referencePlugin,
	tocReferencePlugin,
	mediaPlugin,
	virtualTablePlugin,
];

/** All built-in field type plugins. */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin array requires widening the generic
export const builtInFieldTypes: FieldTypePlugin<any>[] = [
	...simpleFieldTypes,
	...selectionFieldTypes,
	...structuralFieldTypes,
	...complexTextFieldTypes,
	...referenceFieldTypes,
];

export {
	textPlugin,
	textareaPlugin,
	numberPlugin,
	booleanPlugin,
	colorPlugin,
	emailPlugin,
	urlPlugin,
	timePlugin,
	datePlugin,
	slugPlugin,
	selectPlugin,
	radioPlugin,
	checkboxesPlugin,
	sectionPlugin,
	groupPlugin,
	blocksPlugin,
	arrayPlugin,
	markdownPlugin,
	codePlugin,
	richTextPlugin,
	referencePlugin,
	tocReferencePlugin,
	mediaPlugin,
	virtualTablePlugin,
};

export type { ArraySettings } from "./array";
export type { BlockDefinition, BlocksSettings } from "./blocks";
export type { CheckboxesSettings } from "./checkboxes";
export type { CodeSettings } from "./code";
export type { ColorSettings } from "./color";
export type { DateSettings } from "./date";
export type { EmailSettings } from "./email";
export type { GroupSettings } from "./group";
export type { MarkdownSettings } from "./markdown";
export type { MediaSettings } from "./media";
export type { NumberSettings } from "./number";
export type { RadioSettings } from "./radio";
export type { ReferenceSettings } from "./reference";
export type { RichTextSettings } from "./rich-text";
export type { SelectSettings } from "./select";
export type { SlugSettings } from "./slug";
// Settings types
export type { TextSettings } from "./text";
export type { TextareaSettings } from "./textarea";
export type { TocReferenceSettings } from "./toc-reference";
export type { UrlSettings } from "./url";
export type { VirtualTableSettings } from "./virtual-table";
