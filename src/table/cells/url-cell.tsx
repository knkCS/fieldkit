import { UrlCell as AnkerUrlCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function UrlCell({ value }: CellProps) {
	const url = value != null ? String(value) : null;
	return <AnkerUrlCell value={url || null} />;
}
UrlCell.displayName = "UrlCell";
