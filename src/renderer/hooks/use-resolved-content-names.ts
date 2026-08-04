import { useEffect, useState } from "react";
import { useFieldKit } from "../provider";
import { useAdapterErrorReporter } from "./use-adapter-error-reporter";
import { useStableValue } from "./use-stable-value";

/**
 * The current display names of several referenced Contents, keyed by id.
 *
 * A Reference stores only an id (see `Reference` in `/schema`), so names are
 * looked up on every load rather than read out of saved data — a Content
 * renamed elsewhere therefore reads correctly here. An id missing from the
 * result has no name to show: no adapter, a Content that no longer resolves,
 * or a failed lookup. Every caller falls back to the id in that case, so an
 * unresolvable Content is visible rather than gone.
 *
 * One `fetch` for the whole list rather than one per row: a Reference Field
 * holding twenty References must not make twenty round trips.
 *
 * `fieldId` is only ever used to attribute an Adapter failure to the Field it
 * degrades, through the provider's `onError`.
 */
export function useResolvedContentNames(
	ids: string[],
	fieldId: string,
): Record<string, string> {
	const { adapters } = useFieldKit();
	const adapter = adapters.reference;
	const [names, setNames] = useState<Record<string, string>>({});
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	// Callers derive this list from form state and hand down a fresh array on
	// every render; an effect keyed on its identity would fetch forever.
	const wanted = useStableValue(ids);

	useEffect(() => {
		if (!adapter || wanted.length === 0) {
			setNames({});
			return;
		}
		let cancelled = false;
		adapter
			.fetch(wanted)
			.then((items) => {
				if (cancelled) return;
				setNames(
					Object.fromEntries(
						items.map((item) => [item.id, item.display_name] as const),
					),
				);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setNames({});
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, wanted, report]);

	return names;
}
