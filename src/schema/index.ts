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
