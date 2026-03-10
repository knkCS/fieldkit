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
