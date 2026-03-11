import type { CellProps } from "../../schema/plugin";

export function TextCell({ value }: CellProps) {
	const text = value != null ? String(value) : "";
	return <span title={text}>{text}</span>;
}
TextCell.displayName = "TextCell";
