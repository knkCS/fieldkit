import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Calendar } from "lucide-react";

export interface DateSettings {
  enable_range?: boolean;
  min_date?: string;
  max_date?: string;
}

export const datePlugin: FieldTypePlugin<DateSettings> = {
  id: "date",
  name: "Date",
  description: "A date value",
  icon: Calendar,
  category: "date",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<DateSettings>) {
    let schema = z.string();

    if (field.config.required) {
      schema = schema.min(1, `${field.config.name} is required`);
    }

    return schema;
  },

  defaultSettings: { enable_range: false },
  availableIn: ["blueprint", "task", "form"],
};
