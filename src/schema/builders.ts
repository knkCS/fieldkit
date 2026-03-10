// src/schema/builders.ts
import type { Field, FieldConfig, FieldValidation } from "./types";

interface BaseOptions {
  name?: string;
  required?: boolean;
  instructions?: string;
  default_value?: unknown;
  unique?: boolean;
  localizable?: boolean;
  hidden?: boolean;
  read_only?: boolean;
  validation?: Partial<FieldValidation>;
}

function buildConfig(apiAccessor: string, options?: BaseOptions): FieldConfig {
  return {
    name: options?.name ?? apiAccessor,
    api_accessor: apiAccessor,
    required: options?.required ?? false,
    instructions: options?.instructions ?? "",
    default_value: options?.default_value,
    unique: options?.unique,
    localizable: options?.localizable,
    hidden: options?.hidden,
    read_only: options?.read_only,
  };
}

function buildField<S>(
  fieldType: string,
  apiAccessor: string,
  options?: BaseOptions & Record<string, unknown>,
  settingsKeys?: string[],
): Field<S> {
  const {
    name, required, instructions, default_value,
    unique, localizable, hidden, read_only, validation,
    ...rest
  } = options ?? {};

  const settings = settingsKeys
    ? (Object.fromEntries(
        settingsKeys.filter((k) => k in rest).map((k) => [k, rest[k]]),
      ) as S)
    : (Object.keys(rest).length > 0 ? rest as S : null);

  return {
    field_type: fieldType,
    config: buildConfig(apiAccessor, options),
    validation: validation as FieldValidation | undefined,
    settings: settings && Object.keys(settings as object).length > 0 ? settings : null,
    children: null,
    system: false,
  };
}

export function text(apiAccessor: string, options?: BaseOptions & { placeholder?: string; prepend?: string; append?: string }) {
  return buildField<{ placeholder?: string; prepend?: string; append?: string }>(
    "text", apiAccessor, options, ["placeholder", "prepend", "append"],
  );
}

export function number(apiAccessor: string, options?: BaseOptions & { min?: number; max?: number; step?: number; prepend?: string; append?: string }) {
  return buildField("number", apiAccessor, options, ["min", "max", "step", "prepend", "append"]);
}

export function boolean(apiAccessor: string, options?: BaseOptions) {
  return buildField("boolean", apiAccessor, options);
}

export function select(apiAccessor: string, options?: BaseOptions & { options?: Record<string, string>; multiple?: boolean }) {
  return buildField("select", apiAccessor, options, ["options", "multiple"]);
}

export function section(name: string, children: Field[]): Field[] {
  const sectionField: Field = {
    field_type: "section",
    config: {
      name,
      api_accessor: `section_${name.toLowerCase().replace(/\s+/g, "_")}`,
      required: false,
      instructions: "",
    },
    settings: null,
    children: null,
    system: false,
  };
  return [sectionField, ...children];
}
