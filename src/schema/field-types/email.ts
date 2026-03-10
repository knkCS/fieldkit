import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Mail } from "lucide-react";

export interface EmailSettings {
  placeholder?: string;
}

export const emailPlugin: FieldTypePlugin<EmailSettings> = {
  id: "email",
  name: "Email",
  description: "An email address",
  icon: Mail,
  category: "text",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<EmailSettings>) {
    let schema = z.string();

    if (field.config.required) {
      schema = schema.email(`${field.config.name} must be a valid email`);
    } else {
      // When optional, still validate format if a value is provided
      schema = schema.email("Invalid email format").or(z.literal(""));
    }

    return schema;
  },

  defaultSettings: { placeholder: "" },
  availableIn: ["blueprint", "task", "form"],
};
