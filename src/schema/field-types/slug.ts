import { z } from "zod";
import type { ZodTypeAny } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Link as LinkIcon } from "lucide-react";

export interface SlugSettings {
  source_field?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugPlugin: FieldTypePlugin<SlugSettings> = {
  id: "slug",
  name: "Slug",
  description: "A URL-friendly identifier",
  icon: LinkIcon,
  category: "text",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<SlugSettings>): ZodTypeAny {
    const slugSchema = z
      .string()
      .regex(SLUG_PATTERN, "Must be a valid slug (lowercase letters, numbers, and hyphens)");

    if (field.config.required) {
      return slugSchema;
    }

    // When optional, allow empty strings
    return slugSchema.or(z.literal(""));
  },

  defaultSettings: {},
  availableIn: ["blueprint", "task", "form"],
};
