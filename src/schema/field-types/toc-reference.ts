import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { BookOpen } from "lucide-react";

export interface TocReferenceSettings {
  blueprints?: string[];
  always_latest?: boolean;
  max_items?: number;
  max_depth?: number;
  attributes?: string[];
}

export const tocReferencePlugin: FieldTypePlugin<TocReferenceSettings> = {
  id: "toc_reference",
  name: "TOC Reference",
  description: "Table of contents reference to a single content item",
  icon: BookOpen,
  category: "reference",

  fieldComponent: () => null,
  cellComponent: undefined,

  maxPerSpec: 1,

  toZodType(field: Field<TocReferenceSettings>) {
    let schema = z.string();

    if (field.config.required) {
      schema = schema.min(1, `${field.config.name} is required`);
    }

    return schema;
  },

  defaultSettings: {},
  availableIn: ["blueprint"],
};
