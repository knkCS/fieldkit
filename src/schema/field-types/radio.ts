import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { CircleDot } from "lucide-react";

export interface RadioSettings {
  options: Record<string, string>;
}

export const radioPlugin: FieldTypePlugin<RadioSettings> = {
  id: "radio",
  name: "Radio",
  description: "A set of radio buttons for single selection",
  icon: CircleDot,
  category: "selection",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<RadioSettings>) {
    let schema = z.string();
    if (field.config.required) {
      schema = schema.min(1, `${field.config.name} is required`);
    }
    return schema;
  },

  defaultSettings: { options: {} },
  availableIn: ["blueprint", "task", "form"],
};
