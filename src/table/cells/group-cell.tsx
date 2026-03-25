import { CountCell } from "@knkcs/anker/components";
import type { GroupSettings } from "../../schema/field-types/group";
import type { CellProps } from "../../schema/plugin";

export function GroupCell({ value }: CellProps<GroupSettings>) {
	if (!Array.isArray(value)) return <CountCell value={null} singular="item" plural="items" />;
	return <CountCell value={value} singular="item" plural="items" />;
}
GroupCell.displayName = "GroupCell";
