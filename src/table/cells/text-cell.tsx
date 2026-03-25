import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TextCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
TextCell.displayName = "TextCell";
