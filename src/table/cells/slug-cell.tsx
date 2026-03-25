import { SlugCell as AnkerSlugCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function SlugCell({ value }: CellProps) {
	return <AnkerSlugCell value={value != null ? String(value) : null} />;
}
SlugCell.displayName = "SlugCell";
