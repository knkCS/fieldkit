import { CountCell, TruncatedTextCell } from "@knkcs/anker/components";
import { useContext } from "react";
import { FieldKitContext } from "../../renderer/context";
import {
	storedMediaIds,
	useResolvedMedia,
} from "../../renderer/hooks/use-resolved-media";
import type { CellProps } from "../../schema/plugin";

/**
 * A media value at table density (ADR-0029).
 *
 * With the adapter's `resolve` the cell names its files — a deleted one
 * marked, an id the answer leaves out shown as itself — and counts them while
 * the names are on their way. Without it, or outside a `FieldKitProvider`, it
 * counts them, as it always has.
 */
export function MediaCell({ field, value }: CellProps) {
	const kit = useContext(FieldKitContext);
	const resolve = kit?.adapters.media?.resolve;
	const onError = kit?.onError;
	const accessor = field.config.api_accessor;
	const ids = storedMediaIds(value);
	// A failed resolve degrades to the bare ids; the Consumer hears about it on
	// its own channel, attributed to the column's Field.
	const names = useResolvedMedia(resolve, ids, (error) => {
		const wrapped = error instanceof Error ? error : new Error(String(error));
		if (onError) onError(wrapped, accessor);
		else console.error("Media adapter failed:", wrapped);
	});

	if (value == null || (Array.isArray(value) && value.length === 0))
		return <CountCell value={null} singular="file" plural="files" />;

	if (!Array.isArray(value))
		return <CountCell value={1} singular="file" plural="files" />;

	if (!resolve || ids.length === 0 || names.pending)
		return <CountCell value={value} singular="file" plural="files" />;

	const text = ids
		.map((id) => {
			const item = names.item(id);
			if (!item) return id;
			const name = item.filename || id;
			return item.deleted ? `${name} (deleted)` : name;
		})
		.join(", ");
	return <TruncatedTextCell value={text} />;
}
MediaCell.displayName = "MediaCell";
