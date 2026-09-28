// src/schema/zod-builder.ts
import {
	type ParseInput,
	type ParseReturnType,
	type SyncParseReturnType,
	ZodObject,
	type ZodRawShape,
	type ZodTypeAny,
	z,
} from "zod";
import type { FieldTypePlugin } from "./plugin";
import { mintMissingIds } from "./row-ids";
import type { Field } from "./types";
import { stripUnset } from "./unset";

/** Structural field types that don't produce a value in the form data.
 * One set covers BOTH paths: specToZodSchema (schema) and getDefaultValues
 * (defaults) skip these before any plugin/config lookup. */
const STRUCTURAL_TYPES = new Set(["section", "card"]);

/**
 * Whether a Field contributes a key to the form's data at all.
 *
 * The value-less Markers produce none, and a hidden Field is not asked for.
 * Exported because a caller counting what a Spec *asks* for — the Attribute
 * count on a Reference row — has to agree with what this builder composes, and
 * two copies of the skip list would be two things to drift.
 */
export function fieldProducesValue(field: Field): boolean {
	return !STRUCTURAL_TYPES.has(field.field_type) && !field.config.hidden;
}

export interface ZodBuilderOptions {
	overrides?: Record<string, (base: ZodTypeAny) => ZodTypeAny>;
}

type PluginMap = Map<string, FieldTypePlugin>;

/**
 * The Zod schema a form over `fields` validates with.
 *
 * What it parses is the value **in canonical form** (ADR-0021): every key
 * holding an Unset value — `null`, `""`, `[]`, `{}`, `undefined` — is
 * stripped from the output at every depth, so the values a form submits
 * through `zodResolver(specToZodSchema(…))` are what Go's `ValidateValue`
 * accepts, and a cleared control is stored as absent. Validation is
 * unaffected: a required Field's `""` still fails with its own message.
 *
 * The result is a `ZodObject`, `.shape` and all. The stripping belongs to
 * this object only — a schema derived from it with `.extend()`, `.merge()`,
 * `.pick()` and the like validates the same but no longer strips.
 */
export function specToZodSchema(
	fields: Field[],
	plugins: FieldTypePlugin[],
	options?: ZodBuilderOptions,
): ZodObject<ZodRawShape> {
	const object = buildObject(
		fields,
		new Map(plugins.map((p) => [p.id, p])),
		options,
	);
	return new CanonicalZodObject(object._def);
}

/**
 * A `ZodObject` whose parsed output is canonical. Subclassed rather than
 * `.transform()`ed so the return type stays a `ZodObject`: Consumers and the
 * row drawers read `.shape`, and a `ZodEffects` would break them.
 */
class CanonicalZodObject<T extends ZodRawShape> extends ZodObject<T> {
	override _parse(input: ParseInput): ParseReturnType<this["_output"]> {
		const result = super._parse(input);
		return result instanceof Promise
			? result.then(canonicalResult)
			: canonicalResult(result);
	}
}

function canonicalResult<T>(
	result: SyncParseReturnType<T>,
): SyncParseReturnType<T> {
	if (result.status === "aborted") return result;
	return { status: result.status, value: stripUnset(result.value) as T };
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
		if (!fieldProducesValue(field)) continue;

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
			// optional slug you can't empty isn't optional. The "" passes here
			// and is then stripped from the output as Unset (ADR-0021, see
			// specToZodSchema). Required fields are unaffected ("" still fails
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

/**
 * The values a form over `fields` starts from: each Field's
 * `config.default_value`, else its plugin's `defaultValue`.
 *
 * With `plugins`, every row in them carries an `_id` (ADR-0023) — a
 * `default_value` holding rows is minted into, freshly on every call, so two
 * forms never share a row's id.
 */
export function getDefaultValues(
	fields: Field[],
	plugins?: FieldTypePlugin[],
): Record<string, unknown> {
	if (!plugins) return buildDefaults(fields);
	const pluginMap = new Map(plugins.map((p) => [p.id, p]));
	return mintMissingIds(fields, buildDefaults(fields, pluginMap), pluginMap);
}

/** The defaults twin of `buildObject`, recursing on the same terms. */
function buildDefaults(
	fields: Field[],
	pluginMap?: PluginMap,
): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};

	for (const field of fields) {
		if (!fieldProducesValue(field)) continue;
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
