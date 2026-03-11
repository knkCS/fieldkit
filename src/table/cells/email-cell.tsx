import type { CellProps } from "../../schema/plugin";

export function EmailCell({ value }: CellProps) {
	const text = value != null ? String(value) : "";
	return <span title={text}>{text}</span>;
}
EmailCell.displayName = "EmailCell";
