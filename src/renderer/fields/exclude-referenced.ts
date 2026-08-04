// src/renderer/fields/exclude-referenced.ts
/**
 * Keeping a Content the Field already references out of the picker.
 *
 * Someone adding a Reference should not be offered a Content the Field already
 * holds — adding it again would put the same Content in the tree twice. The
 * rule has two halves, and both live here so the tree Field's drawer and the
 * Single Reference's select cannot drift apart on either:
 *
 * - **{@link referencedContentIds}** reads the ids out of the stored value.
 *   The tree Field holds an array and the Single Reference holds one Reference,
 *   so this reads both — the Single Reference case is a one-item version of the
 *   same rule, not a second rule.
 * - **{@link withoutExcluded}** drops them from a page an Adapter returned.
 *   `excludeIds` travels with the search so an honouring Adapter can exclude
 *   them at the source and keep its total honest; this is the backstop that
 *   makes the field genuinely optional, so an Adapter that ignores it still
 *   yields a picker with nothing already-referenced in it.
 *
 * This is a **policy about the picker, not about the value**. A Reference Tree
 * keys its rows by path precisely so the same Content *can* appear twice, and
 * nothing here refuses such a value, rewrites one, or stops a drag producing
 * one. It only stops the picker proposing it.
 */
import { asReference } from "../../schema/reference";
import { readReferenceTree } from "../../schema/reference-tree";
import type { ReferenceItem } from "../adapters";

/**
 * The Contents a stored Reference value already points at, in the order they
 * are held and without repeats.
 *
 * **The whole tree, not its roots.** A Content nested three levels down is
 * already referenced too, so this reads the flattened tree — the same reading
 * `max_items` counts and the rows render, so what the picker withholds and what
 * the Field shows can never disagree.
 *
 * Form data is only as well-formed as whatever produced it, so it goes through
 * the same readers every other surface does: an entry that is not a Reference
 * contributes no id rather than throwing. A value that is neither an array nor
 * a Reference — a Field that holds nothing yet — yields none.
 *
 * Deduplicated, because a tree may legitimately hold the same Content twice and
 * "which Contents are in here" is a set. Sending the id twice would ask an
 * Adapter to exclude it twice.
 */
export function referencedContentIds(value: unknown): string[] {
	const ids = Array.isArray(value)
		? readReferenceTree(value).map((row) => row.reference.id)
		: [asReference(value)?.id].filter((id) => id !== undefined);
	return [...new Set(ids)];
}

/**
 * A page of Contents with the already-referenced ones dropped — the backstop
 * behind the optional `excludeIds` query field.
 *
 * An Adapter that honours the field has already done this, and dropping nothing
 * is what that looks like from here. One that ignores it has not, and this is
 * what keeps the picker correct anyway; the cost is only that the Adapter's
 * `total` still counts what was dropped, so the page's count reads high. That
 * is the trade the optional field buys: no Consumer is forced to implement
 * anything, and one that does gets exact counts for it.
 *
 * Always a list of its own, never the one it was handed: both callers put the
 * answer straight into React state, and an Adapter is free to keep hold of the
 * array it returned.
 */
export function withoutExcluded(
	items: readonly ReferenceItem[],
	excludeIds: readonly string[],
): ReferenceItem[] {
	if (excludeIds.length === 0) return [...items];
	const excluded = new Set(excludeIds);
	return items.filter((item) => !excluded.has(item.id));
}
