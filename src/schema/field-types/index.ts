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
