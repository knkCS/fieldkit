import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Layers } from "lucide-react";

export interface GroupSettings {
  min_items?: number;
  max_items?: number;
}

export const groupPlugin: FieldTypePlugin<GroupSettings> = {
  id: "group",
  name: "Group",
  description: "A repeating group of fields",
  icon: Layers,
  category: "structural",

  fieldComponent: () => null,
  cellComponent: undefined,

  toZodType(field: Field<GroupSettings>) {
    const settings = field.settings ?? {};
    let schema = z.array(z.record(z.unknown()));

    if (settings.min_items !== undefined) {
      schema = schema.min(settings.min_items);
    }

    if (settings.max_items !== undefined) {
      schema = schema.max(settings.max_items);
    }

    return schema;
  },

  defaultSettings: {},
  availableIn: ["blueprint", "task", "form"],
};
