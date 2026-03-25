import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function MediaCell({ value }: CellProps) {
	if (value == null)
		return <CountCell value={null} singular="file" plural="files" />;

	if (Array.isArray(value)) {
		if (value.length === 0)
			return <CountCell value={null} singular="file" plural="files" />;
		return <CountCell value={value} singular="file" plural="files" />;
	}

	return <CountCell value={1} singular="file" plural="files" />;
}
MediaCell.displayName = "MediaCell";
