import { useEffect, useState } from "react";
import { useFieldKit } from "../provider";
import { useAdapterErrorReporter } from "./use-adapter-error-reporter";

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
 * `fieldId` is only ever used to attribute an Adapter failure to the Field it
 * degrades, through the provider's `onError`.
 */
export function useResolvedContentName(
	id: string | null,
	fieldId: string,
): string | null {
	const { adapters } = useFieldKit();
	const adapter = adapters.reference;
	const [name, setName] = useState<string | null>(null);
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	useEffect(() => {
		if (!adapter || !id) {
			setName(null);
			return;
		}
		let cancelled = false;
		adapter
			.fetch([id])
			.then((items) => {
				if (cancelled) return;
				setName(items.find((item) => item.id === id)?.display_name ?? null);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setName(null);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, id, report]);

	return name;
}
