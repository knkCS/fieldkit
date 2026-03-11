import type { CellProps } from "../../schema/plugin";

export function MediaCell({ value }: CellProps) {
	if (value == null) return <span>—</span>;

	if (Array.isArray(value)) {
		if (value.length === 0) return <span>—</span>;
		return (
			<span>
				{value.length} file{value.length !== 1 ? "s" : ""}
			</span>
		);
	}

	return <span>1 file</span>;
}
MediaCell.displayName = "MediaCell";
