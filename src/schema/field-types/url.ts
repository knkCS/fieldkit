import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Link } from "lucide-react";

export interface UrlSettings {
  placeholder?: string;
}

export const urlPlugin: FieldTypePlugin<UrlSettings> = {
  id: "url",
  name: "URL",
  description: "A web address",
  icon: Link,
  category: "text",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<UrlSettings>) {
    let schema = z.string();

    if (field.config.required) {
      schema = schema.url(`${field.config.name} must be a valid URL`);
    } else {
      schema = schema.url("Invalid URL format").or(z.literal(""));
    }

    return schema;
  },

  defaultSettings: { placeholder: "" },
  availableIn: ["blueprint", "task", "form"],
};
