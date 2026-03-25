import { BooleanCell as AnkerBooleanCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function BooleanCell({ value }: CellProps) {
	return <AnkerBooleanCell value={typeof value === "boolean" ? value : null} />;
}
BooleanCell.displayName = "BooleanCell";
