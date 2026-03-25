import { CodeCell as AnkerCodeCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function CodeCell({ value }: CellProps) {
	return <AnkerCodeCell value={value != null ? String(value) : null} />;
}
CodeCell.displayName = "CodeCell";
