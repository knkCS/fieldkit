// src/schema/validate-value.ts
import type { ZodIssue } from "zod";
import { valueDocuments } from "./documents";
import type { FieldTypePlugin, ValueContext } from "./plugin";
import { itemSegments, toIdPath } from "./row-ids";
import type { Field } from "./types";
import { canonicalValue, isPlainObject, isUnset, stripUnset } from "./unset";
import { toPath } from "./validate-settings";
import { fieldProducesValue, specToZodSchema } from "./zod-builder";

/**
 * The codes value validation reports. Part of the data contract, shared with
 * the Go module's `ValidateValue`: a code is only ever added, never renamed or
 * removed (ADR-0019). The renderer does not show these — a form keeps showing
 * Zod's own messages; the codes are for stored data.
 */
export type ValueErrorCode =
	/** A required Field whose value is Unset (ADR-0021). `0` and `false` are
	 * values. */
	| "required"
	/** A value stored in a form other than its canonical one: a key holding an
	 * Unset value (`null`, `""`, `[]`, `{}`), at any depth. Unset is stored as
	 * absent (ADR-0021). At the key. */
	| "not_canonical"
	/** A value of the wrong JSON type — a number where a string belongs, an
	 * array item that is not a string. */
	| "invalid_type"
	/** A string that is not in its type's format: an email address, a URL, a
	 * slug, or the Field's `validation.pattern`. */
	| "invalid_format"
	/** Below a minimum the Spec states: a string shorter than
	 * `validation.min_length`, a number below `settings.min`, fewer items than
	 * `min_items` — and a blank entry in a required List. */
	| "too_small"
	/** Above a maximum the Spec states: a string longer than
	 * `validation.max_length`, a number above `settings.max`. */
	| "too_big"
	/** More items than allowed: an array (or an object's keys) beyond
	 * `max_items`, or beyond {@link VALUE_CAPS}.maxItems. */
	| "too_many_items"
	/** A string beyond {@link VALUE_CAPS}.maxStringBytes. */
	| "too_many_bytes"
	/** Any other rule a type's `toZodType` states that none of the codes
	 * above names — a Block whose `_type` is not one of its Field's Block
	 * Types. No built-in scalar type reports it. */
	| "invalid_value"
	/** A row of a `group`, `virtual_table` or `blocks` value without an `_id`
	 * (ADR-0023). At the row. */
	| "missing_id"
	/** A row repeating an `_id` an earlier row of the same array holds. At
	 * each repeat. */
	| "duplicate_id"
	/** An array or object nested deeper than {@link VALUE_CAPS}.maxDepth. */
	| "too_deep";

/** One value error. `path` is `/`-separated from the data's root: a Field is
 * its Accessor, an object entry its key, and an array item its `_id` — a
 * row's (`/authors/7f3a…/name`, ADR-0023) — or, for an item without one, its
 * index (`/tags/2`). A segment holding `/` or `~` is escaped as in RFC 6901. */
export interface ValueError {
	path: string;
	code: ValueErrorCode;
	params?: Record<string, unknown>;
}

/**
 * The caps every value obeys, whatever its type, so that no stored document
 * can be pathological. The same numbers are in the Go module (`MaxItems`,
 * `MaxStringBytes`, `MaxDepth`); both sides report them as codes.
 *
 * They are checked by {@link validateValue} only, not by the Zod schema a form
 * runs: nothing a person types into a form comes near them.
 */
export const VALUE_CAPS = {
	/** Most items an array, or keys an object, may hold. */
	maxItems: 10_000,
	/** Most UTF-8 bytes a string may hold: 1 MiB. */
	maxStringBytes: 1_048_576,
	/** Deepest an array or object may sit: the data's root is depth 0, its
	 * values depth 1. It counts fieldkit's structure only: what a rich-text
	 * document nests inside itself is knkeditor's to limit (ADR-0025). */
	maxDepth: 128,
} as const;

/**
 * Validates stored data against a Spec, with the answers the Go module's
 * `ValidateValue` gives (ADR-0018): each value-producing Field's value is
 * checked by exactly what its plugin's `toZodType` checks, the errors
 * reported as `{path, code}` rather than Zod's messages.
 *
 * On top of `toZodType`, ADR-0021:
 *
 * - **Unset** — absent, `null`, `""`, `[]` or `{}` — is one state. A required
 *   Field whose value is Unset is `required`; an optional one is valid, and
 *   its type is not checked.
 * - A key holding an Unset value, at any depth and whether or not the Spec
 *   names it, is `not_canonical`: Unset is stored as absent. A form's
 *   submitted values are canonical already (`specToZodSchema` strips them);
 *   {@link canonicalValue} canonicalises data holding no rich text.
 * - {@link VALUE_CAPS} are enforced as `too_many_items`, `too_many_bytes` and
 *   `too_deep`,
 *   over the whole document — keys the Spec does not name, and the number of
 *   keys at the root, included. Data beyond a cap reports only the caps it
 *   breaks: nothing else is checked.
 *
 * Both stop at a rich-text document (ADR-0025): a `rich_text` Field's value
 * that is an object holding anything is knkeditor's inside — an attribute
 * holding `null`, or `"attributes": {}`, is the document's own, neither
 * stripped nor `not_canonical` — and `too_deep` counts no level inside it. A
 * `rich_text` value of `{}` or `null` is still Unset at the Field. The size
 * caps count the whole document, inside included.
 *
 * Settings and `validation` are read in canonical form too, so a `min: null`
 * is no minimum. Keys the Spec does not name are otherwise ignored, as the
 * form's schema ignores them; hidden Fields and the value-less Markers are not
 * checked. A Field whose type is not among `plugins` is skipped. Data that is
 * not an object is one `invalid_type` at `""`.
 *
 * Containers are validated through their `toZodType` like any type, and so
 * are the `_id`s their rows carry (ADR-0023): a row without one is
 * `missing_id` at the row, a repeat `duplicate_id` at the repeat. Every path
 * addresses an array item by its `_id` where it has one ({@link toIdPath}).
 * A key a row's Fields require, missing, is `required` like a top-level one.
 *
 * `options.targetBlueprint` says whose Blueprint each referenced Content is,
 * for a Reference Field that links a Reference Spec (ADR-0008, amended):
 * without it such a Field's values are checked as an opaque record. Go's
 * `WithTargetBlueprints`.
 */
export function validateValue(
	spec: Field[],
	data: unknown,
	plugins:
		| readonly FieldTypePlugin[]
		| ReadonlyMap<string, FieldTypePlugin<unknown>>,
	options: ValueContext = {},
): ValueError[] {
	const pluginList: FieldTypePlugin[] = Array.isArray(plugins)
		? [...(plugins as readonly FieldTypePlugin[])]
		: [...(plugins as ReadonlyMap<string, FieldTypePlugin>).values()];
	const pluginMap = new Map(pluginList.map((p) => [p.id, p]));

	if (data === undefined) data = {};
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return [{ path: "", code: "invalid_type" }];
	}

	const errors: ValueError[] = [];
	const segments = new WeakMap<readonly unknown[], string[]>();
	const seen = new Set<string>();
	const push = (error: ValueError) => {
		const key = `${error.code}\u0000${error.path}`;
		if (seen.has(key)) return;
		seen.add(key);
		errors.push(error);
	};

	// The documents are found in the data cut off below the depth cap. The
	// caps then cover the whole document, keys the Spec does not name
	// included: nothing else walks a document beyond them.
	const documents = valueDocuments(
		spec,
		data,
		pluginMap,
		options,
		VALUE_CAPS.maxDepth,
	);
	const capped = capErrors(data, documents);
	if (capped.length > 0) return capped;

	reportNonCanonical(data, [], push, documents);
	const canonical = stripUnset(data, documents) as Record<string, unknown>;

	for (const field of spec) {
		if (!fieldProducesValue(field)) continue;
		const plugin = pluginMap.get(field.field_type);
		if (!plugin) continue;

		const accessor = field.config.api_accessor;
		const at = [accessor];
		const value = canonical[accessor];
		if (value === undefined) {
			if (field.config.required) push({ path: toPath(at), code: "required" });
			continue;
		}

		const schema = zodTypeOf(
			plugin,
			canonicalField(field),
			pluginList,
			options,
		);
		const result = schema.safeParse(value);
		if (result.success) continue;
		for (const issue of typeIssues(result.error.issues)) {
			const code = codeOf(issue, valueAt(value, issue.path));
			// A missing `_id` belongs to its row, which has no id to name it by.
			const path = code === "missing_id" ? issue.path.slice(0, -1) : issue.path;
			push({ path: toIdPath(canonical, [...at, ...path], segments), code });
		}
	}

	return errors;
}

/**
 * The Field's Zod type. A `validation.pattern` that is no JS regular
 * expression makes `toZodType` throw; the pattern then checks nothing, and
 * everything else still does — which is also Go's answer to a pattern it
 * cannot compile.
 */
function zodTypeOf(
	plugin: FieldTypePlugin,
	field: Field<unknown>,
	plugins: FieldTypePlugin[],
	context: ValueContext,
) {
	const compose = (children: Field[]) =>
		specToZodSchema(children, plugins, {
			targetBlueprint: context.targetBlueprint,
		});
	try {
		return plugin.toZodType(field, compose, context);
	} catch (error) {
		if (!field.validation?.pattern) throw error;
		const { pattern: _, ...validation } = field.validation;
		return plugin.toZodType({ ...field, validation }, compose, context);
	}
}

/** The Field as `toZodType` should read it: settings and validation in
 * canonical form, so an Unset setting is no setting. */
function canonicalField(field: Field): Field<unknown> {
	return {
		...field,
		settings: canonicalValue(field.settings),
		validation: canonicalValue(field.validation) as Field["validation"],
	};
}

/**
 * The issues a value's own type raised. An optional string inside a row is
 * composed as "the type, or `""`" (`specToZodSchema`, #38), and a value
 * failing both is one `invalid_union` — whose first branch is the type's own
 * answer. `""` itself is Unset and stripped before parsing, so the second
 * branch never has anything to say.
 */
function typeIssues(issues: readonly ZodIssue[]): ZodIssue[] {
	return issues.flatMap((issue) =>
		issue.code === "invalid_union" && issue.unionErrors.length > 0
			? typeIssues(issue.unionErrors[0].issues)
			: [issue],
	);
}

/** The value an issue path points at, or `undefined` where nothing is. */
function valueAt(value: unknown, path: readonly (string | number)[]): unknown {
	let node = value;
	for (const segment of path) {
		if (node === null || typeof node !== "object") return undefined;
		node = (node as Record<string | number, unknown>)[segment];
	}
	return node;
}

/**
 * The code for one Zod issue. `found` is the value at the issue's path: an
 * issue about a value that is not there — whichever Zod code states it, a
 * type check, a literal, a union's discriminator, a refinement — is a missing
 * key, which after canonicalisation is an Unset required value, or a row's
 * missing `_id`.
 */
function codeOf(issue: ZodIssue, found: unknown): ValueErrorCode {
	// A rule a type states itself names its code: `duplicate_id` of a row
	// array or a tree, a Reference Tree's `too_many_items`.
	if (issue.code === "custom" && isValueErrorCode(issue.params?.code)) {
		return issue.params.code;
	}
	if (found === undefined && issue.path.length > 0) {
		return issue.path[issue.path.length - 1] === "_id"
			? "missing_id"
			: "required";
	}
	switch (issue.code) {
		case "invalid_type":
			return "invalid_type";
		case "invalid_string":
			return "invalid_format";
		case "too_small":
			return "too_small";
		case "too_big":
			return issue.type === "array" || issue.type === "set"
				? "too_many_items"
				: "too_big";
		default:
			return "invalid_value";
	}
}

const VALUE_ERROR_CODES: ReadonlySet<string> = new Set<ValueErrorCode>([
	"required",
	"not_canonical",
	"invalid_type",
	"invalid_format",
	"too_small",
	"too_big",
	"too_many_items",
	"too_many_bytes",
	"invalid_value",
	"missing_id",
	"duplicate_id",
	"too_deep",
]);

function isValueErrorCode(code: unknown): code is ValueErrorCode {
	return typeof code === "string" && VALUE_ERROR_CODES.has(code);
}

/** Reports every key holding an Unset value, at every depth. A key that is
 * reported is not looked into: its whole value is Unset. Array items are
 * kept whatever they hold — `[null]` is one item, not Unset — and looked
 * into. A document is not looked into either: inside it, knkeditor's rules
 * apply (ADR-0025). */
function reportNonCanonical(
	value: unknown,
	at: (string | number)[],
	push: (error: ValueError) => void,
	documents: ReadonlySet<unknown>,
): void {
	if (documents.has(value)) return;
	if (Array.isArray(value)) {
		const ids = itemSegments(value);
		value.forEach((item, index) => {
			reportNonCanonical(item, [...at, ids[index]], push, documents);
		});
		return;
	}
	if (!isPlainObject(value)) return;
	for (const [key, child] of Object.entries(value)) {
		if (child === undefined) continue; // absent: the canonical form itself
		if (isUnset(stripUnset(child, documents))) {
			push({ path: toPath([...at, key]), code: "not_canonical" });
		} else {
			reportNonCanonical(child, [...at, key], push, documents);
		}
	}
}

/** One node the cap walk has yet to visit: its path is its parent's plus
 * its segment, read back only for an error. */
interface CapNode {
	node: unknown;
	parent?: CapNode;
	segment?: string;
	/** -1 inside a document, where no depth is counted. */
	depth: number;
}

function capPath(at: CapNode): string {
	const segments: string[] = [];
	for (let n: CapNode | undefined = at; n?.parent; n = n.parent) {
		segments.push(n.segment as string);
	}
	return toPath(segments.reverse());
}

/** The caps a value breaks, at the paths it breaks them. A container beyond
 * `maxDepth` or `maxItems` is not looked into. An array item is addressed by
 * its `_id` where it has one, as every value path is. Inside a document no
 * depth is counted (ADR-0025); its items and strings are.
 *
 * Iterative, in document order, each node knowing its parent rather than its
 * whole path: a document's inside may nest as deep as its JSON does, which
 * neither a call stack nor a path per node is sized for. */
function capErrors(
	value: unknown,
	documents: ReadonlySet<unknown>,
): ValueError[] {
	const errors: ValueError[] = [];
	const stack: CapNode[] = [{ node: value, depth: 0 }];
	for (let at = stack.pop(); at; at = stack.pop()) {
		const { node, depth } = at;
		if (typeof node === "string") {
			if (exceedsStringCap(node)) {
				errors.push({
					path: capPath(at),
					code: "too_many_bytes",
					params: { maximum: VALUE_CAPS.maxStringBytes },
				});
			}
			continue;
		}
		if (!Array.isArray(node) && !isPlainObject(node)) continue;
		if (depth > VALUE_CAPS.maxDepth) {
			errors.push({
				path: capPath(at),
				code: "too_deep",
				params: { maximum: VALUE_CAPS.maxDepth },
			});
			continue;
		}
		const size = Array.isArray(node) ? node.length : Object.keys(node).length;
		if (size > VALUE_CAPS.maxItems) {
			errors.push({
				path: capPath(at),
				code: "too_many_items",
				params: { maximum: VALUE_CAPS.maxItems },
			});
			continue;
		}
		const inner = depth < 0 || documents.has(node) ? -1 : depth + 1;
		const children: CapNode[] = [];
		if (Array.isArray(node)) {
			const ids = itemSegments(node);
			node.forEach((item, index) => {
				children.push({
					node: item,
					parent: at,
					segment: ids[index],
					depth: inner,
				});
			});
		} else {
			for (const [key, child] of Object.entries(node)) {
				children.push({ node: child, parent: at, segment: key, depth: inner });
			}
		}
		// Pushed in reverse, so they come off the stack in document order.
		for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
	}
	return errors;
}

let encoder: TextEncoder | undefined;

/** Whether a string holds more than {@link VALUE_CAPS}.maxStringBytes UTF-8
 * bytes, as Go's `len` counts them. A lone surrogate is U+FFFD, three bytes,
 * on both sides. */
function exceedsStringCap(value: string): boolean {
	// Every UTF-16 code unit is at most three UTF-8 bytes, so a short string
	// needs no encoding to be known within the cap.
	if (value.length * 3 <= VALUE_CAPS.maxStringBytes) return false;
	encoder ??= new TextEncoder();
	return encoder.encode(value).length > VALUE_CAPS.maxStringBytes;
}
