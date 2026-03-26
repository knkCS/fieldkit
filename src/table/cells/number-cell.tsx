import { NumberCell as AnkerNumberCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function NumberCell({ value }: CellProps) {
	return (
		<AnkerNumberCell value={value as number | string | null | undefined} />
	);
}
NumberCell.displayName = "NumberCell";
