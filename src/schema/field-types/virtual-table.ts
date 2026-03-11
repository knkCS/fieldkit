import { Table2 } from "lucide-react";
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";

export interface VirtualTableSettings {
	blueprint?: string;
	always_latest?: boolean;
	max_records_per_page?: number;
}

export const virtualTablePlugin: FieldTypePlugin<VirtualTableSettings> = {
	id: "virtual_table",
	name: "Virtual Table",
	description: "Embedded table of records from another blueprint",
	icon: Table2,
	category: "reference",

	fieldComponent: () => null,
	cellComponent: undefined,

	toZodType(_field: Field<VirtualTableSettings>) {
		return z.array(z.record(z.unknown()));
	},

	defaultSettings: { max_records_per_page: 25 },
	availableIn: ["blueprint"],
};
