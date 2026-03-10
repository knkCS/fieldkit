// @knkcs/fieldkit/schema — Field types, registry, Zod generation, defineSpec()

// Types
export type {
  Field,
  FieldConfig,
  FieldCondition,
  FieldValidation,
  Schema,
} from "./types";

// Plugin types
export type {
  FieldTypePlugin,
  FieldTypeCategory,
  FieldContext,
  FieldProps,
  SettingsProps,
  CellProps,
} from "./plugin";

// Registry
export { createRegistry } from "./registry";
export type { PluginRegistry } from "./registry";

// Zod builder
export { specToZodSchema, getDefaultValues } from "./zod-builder";

// Builder API
export { defineSpec } from "./define-spec";
export type { SpecDefinition } from "./define-spec";
export { text, number, boolean, select, section } from "./builders";

// Built-in field type plugins
export { simpleFieldTypes, selectionFieldTypes, structuralFieldTypes } from "./field-types";
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
} from "./field-types";
export type {
  TextSettings,
  TextareaSettings,
  NumberSettings,
  ColorSettings,
  EmailSettings,
  UrlSettings,
  DateSettings,
  SlugSettings,
  SelectSettings,
  RadioSettings,
  CheckboxesSettings,
  GroupSettings,
  BlocksSettings,
  BlockDefinition,
  ArraySettings,
} from "./field-types";
