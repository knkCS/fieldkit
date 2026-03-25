import { ColorSwatchCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function ColorCell({ value }: CellProps) {
	const color = value != null ? String(value) : null;
	return <ColorSwatchCell value={color || null} />;
}
ColorCell.displayName = "ColorCell";
