// src/schema/zod-builder.ts
import { type ZodObject, type ZodRawShape, type ZodTypeAny, z } from "zod";
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";

/** Structural field types that don't produce a value in the form data.
 * One set covers BOTH paths: specToZodSchema (schema) and getDefaultValues
 * (defaults) skip these before any plugin/config lookup. */
const STRUCTURAL_TYPES = new Set(["section", "card"]);

export interface ZodBuilderOptions {
	overrides?: Record<string, (base: ZodTypeAny) => ZodTypeAny>;
}

type PluginMap = Map<string, FieldTypePlugin>;

export function specToZodSchema(
	fields: Field[],
	plugins: FieldTypePlugin[],
	options?: ZodBuilderOptions,
): ZodObject<ZodRawShape> {
	return buildObject(fields, new Map(plugins.map((p) => [p.id, p])), options);
}

/** One level of a Spec as a Zod object. Called again, through the
 * `composeChildren` argument below, for every container plugin that holds
 * child Fields — so a Fieldset's children obey the same rules its siblings do,
 * and a Fieldset embedding a Fieldset composes all the way down. Termination
 * is `resolveSpec()`'s job: it rejects a Blueprint cycle before children ever
 * reach here. */
function buildObject(
	fields: Field[],
	pluginMap: PluginMap,
	options?: ZodBuilderOptions,
): ZodObject<ZodRawShape> {
	const shape: ZodRawShape = {};

	for (const field of fields) {
		if (STRUCTURAL_TYPES.has(field.field_type)) continue;
		if (field.config.hidden) continue;

		const plugin = pluginMap.get(field.field_type);
		if (!plugin) continue;

		let zodType = plugin.toZodType(field as Field<unknown>, (children) =>
			// No `options`: overrides are keyed by top-level accessor and belong
			// to the Consumer's own Fields, not to whatever a Blueprint happens
			// to name the same.
			buildObject(children, pluginMap),
		);

		if (!field.config.required) {
			// Optional strings are "empty or valid" (#38): a cleared text
			// control produces "" and must not fail min/regex checks — an
			// optional slug you can't empty isn't optional. "" is kept in the
			// parsed output. Required fields are unaffected ("" still fails
			// their checks).
			if (zodType._def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
				zodType = zodType.or(z.literal("")).optional() as ZodTypeAny;
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

export function getDefaultValues(
	fields: Field[],
	plugins?: FieldTypePlugin[],
): Record<string, unknown> {
	return buildDefaults(
		fields,
		plugins ? new Map(plugins.map((p) => [p.id, p])) : undefined,
	);
}

/** The defaults twin of `buildObject`, recursing on the same terms. */
function buildDefaults(
	fields: Field[],
	pluginMap?: PluginMap,
): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};

	for (const field of fields) {
		if (STRUCTURAL_TYPES.has(field.field_type)) continue;
		if (field.config.hidden) continue;
		if (field.config.default_value !== undefined) {
			defaults[field.config.api_accessor] = field.config.default_value;
			continue;
		}
		const defaultValue = pluginMap?.get(field.field_type)?.defaultValue;
		if (defaultValue) {
			defaults[field.config.api_accessor] = defaultValue(
				field as Field<unknown>,
				(children) => buildDefaults(children, pluginMap),
			);
		}
	}

	return defaults;
}
