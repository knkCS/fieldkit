import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function EmailCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
EmailCell.displayName = "EmailCell";
