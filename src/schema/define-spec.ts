// src/schema/define-spec.ts
import type { Field } from "./types";
import { getDefaultValues } from "./zod-builder";

export interface SpecDefinition {
  fields: Field[];
  defaultValues: Record<string, unknown>;
}

export function defineSpec(fieldsOrNested: (Field | Field[])[]): SpecDefinition {
  const fields = fieldsOrNested.flat();

  return {
    fields,
    defaultValues: getDefaultValues(fields),
  };
}
