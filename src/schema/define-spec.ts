// src/schema/define-spec.ts
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";
import { getDefaultValues } from "./zod-builder";

export interface SpecDefinition {
	fields: Field[];
	defaultValues: Record<string, unknown>;
}

export interface DefineSpecOptions {
	/** Enables per-type value defaults (#38): fields without an explicit
	 * config.default_value are seeded from their plugin's defaultValue. */
	plugins?: FieldTypePlugin[];
}

export function defineSpec(
	fieldsOrNested: (Field | Field[])[],
	options?: DefineSpecOptions,
): SpecDefinition {
	const fields = fieldsOrNested.flat();

	return {
		fields,
		defaultValues: getDefaultValues(fields, options?.plugins),
	};
}
