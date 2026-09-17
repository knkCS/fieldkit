// src/schema/row-array.ts
import { type ZodTypeAny, z } from "zod";
import type { ComposeChildrenSchema } from "./plugin";
import type { Field } from "./types";

/** The two caps every row-array type offers. Named once so a Group and a
 * Virtual Table cannot drift into spelling them differently. */
export interface RowArrayCaps {
	/** Fewest rows the Field accepts. */
	min_items?: number;
	/** Most rows the Field accepts. */
	max_items?: number;
}

/**
 * The Zod type shared by every Field that holds **an array of rows all shaped
 * alike** — `group` and `virtual_table`. The two differ in how a row is
 * *edited* (stacked forms against a table) and in where the row's Fields may
 * come from (a Virtual Table's may be a linked Blueprint, ADR-0017), but the
 * value they produce is the same shape, so the rule that validates it lives in
 * one place.
 *
 * A row is the object `children` describes, composed through
 * `composeChildren` (ADR-0007), so a required Field in row 2 blocks submit and
 * reports at `authors.1.name` — the very path the renderer registers it under.
 *
 * `passthrough`, because a stored row carries more than the Spec edits — a
 * backend id most obviously — and validating rows must not start pruning them
 * on submit.
 *
 * `children != null` is "resolved" here, the same rule `resolveSpec()` and the
 * renderer read — not `children.length`, so an empty Blueprint resolved into
 * an empty array counts as resolved rather than falling back. The two agree
 * anyway on what they accept: an object schema with no keys, passed through,
 * takes exactly the rows an opaque record does.
 *
 * Unresolved, or called without `composeChildren` (both public API: a Consumer
 * may call `toZodType` with a Field alone, and a linked Row Spec a Consumer
 * never resolved has no children), the row stays the opaque record it always
 * was. Rejecting values on that path would fail a form over Fields fieldkit
 * was never told about.
 */
export function rowArrayZodType(
	field: Field<RowArrayCaps>,
	composeChildren?: ComposeChildrenSchema,
): ZodTypeAny {
	const { min_items, max_items } = field.settings ?? {};
	const children = field.children;

	const row =
		composeChildren && children != null
			? composeChildren(children).passthrough()
			: z.record(z.unknown());

	let schema = z.array(row);
	if (min_items !== undefined) schema = schema.min(min_items);
	if (max_items !== undefined) schema = schema.max(max_items);
	return schema;
}
