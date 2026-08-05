import { useResolvedContentNames } from "./use-resolved-content-names";

/**
 * The current display name of one referenced Content, resolved through the
 * reference Adapter.
 *
 * A Reference stores only an id (see `Reference` in `/schema`), so the name is
 * looked up on every load rather than read out of saved data — a Content
 * renamed elsewhere therefore reads correctly here. `null` means "no name to
 * show": no id, no adapter, a Content that no longer resolves, or a failed
 * lookup. Every caller falls back to the id in that case, so an unresolvable
 * Content is visible rather than gone.
 *
 * The one-id case of {@link useResolvedContentNames}, so both spellings share
 * a single error policy: an Adapter failure reaches the Consumer's `onError`,
 * never the console and never form state.
 *
 * `fieldId` is only ever used to attribute an Adapter failure to the Field it
 * degrades, through the provider's `onError`.
 */
export function useResolvedContentName(
	id: string | null,
	fieldId: string,
): string | null {
	// The names alone: one Reference is drawn as a row is, falling back to its
	// id whichever of the three reasons left it without a name. What the lookup
	// is *doing* only matters to a control that reports an absence across a
	// whole tree, which is Find (#152) and not this.
	const { names } = useResolvedContentNames(id ? [id] : [], fieldId);
	return id ? (names[id] ?? null) : null;
}
