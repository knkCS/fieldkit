import { DateCell as AnkerDateCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function DateCell({ value }: CellProps) {
	return <AnkerDateCell value={value != null ? String(value) : null} />;
}
DateCell.displayName = "DateCell";
