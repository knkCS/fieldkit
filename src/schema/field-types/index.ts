import { textPlugin } from "./text";
import { textareaPlugin } from "./textarea";
import { numberPlugin } from "./number";
import { booleanPlugin } from "./boolean";
import { colorPlugin } from "./color";
import { emailPlugin } from "./email";
import { urlPlugin } from "./url";
import { timePlugin } from "./time";
import { datePlugin } from "./date";
import { slugPlugin } from "./slug";
import { selectPlugin } from "./select";
import { radioPlugin } from "./radio";
import { checkboxesPlugin } from "./checkboxes";
import { sectionPlugin } from "./section";
import { groupPlugin } from "./group";
import { blocksPlugin } from "./blocks";
import { arrayPlugin } from "./array";
import { markdownPlugin } from "./markdown";
import { codePlugin } from "./code";
import { richTextPlugin } from "./rich-text";
import { referencePlugin } from "./reference";
import { tocReferencePlugin } from "./toc-reference";
import { mediaPlugin } from "./media";
import { virtualTablePlugin } from "./virtual-table";
import type { FieldTypePlugin } from "../plugin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
export const selectionFieldTypes: FieldTypePlugin<any>[] = [
  selectPlugin,
  radioPlugin,
  checkboxesPlugin,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
export const structuralFieldTypes: FieldTypePlugin<any>[] = [
  sectionPlugin,
  groupPlugin,
  blocksPlugin,
  arrayPlugin,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
export const complexTextFieldTypes: FieldTypePlugin<any>[] = [
  markdownPlugin,
  codePlugin,
  richTextPlugin,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
export const referenceFieldTypes: FieldTypePlugin<any>[] = [
  referencePlugin,
  tocReferencePlugin,
  mediaPlugin,
  virtualTablePlugin,
];

/** All built-in field type plugins. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous plugin array requires widening the generic
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

// Settings types
export type { TextSettings } from "./text";
export type { TextareaSettings } from "./textarea";
export type { NumberSettings } from "./number";
export type { ColorSettings } from "./color";
export type { EmailSettings } from "./email";
export type { UrlSettings } from "./url";
export type { DateSettings } from "./date";
export type { SlugSettings } from "./slug";
export type { SelectSettings } from "./select";
export type { RadioSettings } from "./radio";
export type { CheckboxesSettings } from "./checkboxes";
export type { GroupSettings } from "./group";
export type { BlocksSettings, BlockDefinition } from "./blocks";
export type { ArraySettings } from "./array";
export type { MarkdownSettings } from "./markdown";
export type { CodeSettings } from "./code";
export type { RichTextSettings } from "./rich-text";
export type { ReferenceSettings } from "./reference";
export type { TocReferenceSettings } from "./toc-reference";
export type { MediaSettings } from "./media";
export type { VirtualTableSettings } from "./virtual-table";
