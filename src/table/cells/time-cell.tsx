import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TimeCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
TimeCell.displayName = "TimeCell";
