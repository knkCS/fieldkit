import type { CellProps } from "../../schema/plugin";

export function SlugCell({ value }: CellProps) {
	const text = value != null ? String(value) : "";
	return <span style={{ fontFamily: "monospace" }}>{text}</span>;
}
SlugCell.displayName = "SlugCell";
