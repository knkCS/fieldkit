// src/schema/zod-builder.ts
import { type ZodObject, type ZodRawShape, type ZodTypeAny, z } from "zod";
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";

/** Structural field types that don't produce a value in the form data. */
const STRUCTURAL_TYPES = new Set(["section"]);

export interface ZodBuilderOptions {
	overrides?: Record<string, (base: ZodTypeAny) => ZodTypeAny>;
}

export function specToZodSchema(
	fields: Field[],
	plugins: FieldTypePlugin[],
	options?: ZodBuilderOptions,
): ZodObject<ZodRawShape> {
	const pluginMap = new Map(plugins.map((p) => [p.id, p]));
	const shape: ZodRawShape = {};

	for (const field of fields) {
		if (STRUCTURAL_TYPES.has(field.field_type)) continue;
		if (field.config.hidden) continue;

		const plugin = pluginMap.get(field.field_type);
		if (!plugin) continue;

		let zodType = plugin.toZodType(field as Field<unknown>);

		if (!field.config.required) {
			// For string-validated types (email, url, slug), allow empty string
			// so forms can submit with an empty optional field.
			// Only apply .or(z.literal("")) when the ZodString has no
			// length or pattern checks (min, max, regex) — otherwise the
			// empty-string branch would silently bypass those constraints.
			if (zodType._def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
				const zodString = zodType as z.ZodString;
				const hasConstraints = zodString._def.checks.some(
					(c) => c.kind === "min" || c.kind === "max" || c.kind === "regex",
				);
				if (hasConstraints) {
					zodType = zodType.optional() as ZodTypeAny;
				} else {
					zodType = zodType.or(z.literal("")).optional() as ZodTypeAny;
				}
			} else {
				zodType = zodType.optional() as ZodTypeAny;
			}
		}

		if (options?.overrides?.[field.config.api_accessor]) {
			zodType = options.overrides[field.config.api_accessor](zodType);
		}

		shape[field.config.api_accessor] = zodType;
	}

	return z.object(shape);
}

export function getDefaultValues(fields: Field[]): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};

	for (const field of fields) {
		if (field.config.hidden) continue;
		if (field.config.default_value !== undefined) {
			defaults[field.config.api_accessor] = field.config.default_value;
		}
	}

	return defaults;
}
