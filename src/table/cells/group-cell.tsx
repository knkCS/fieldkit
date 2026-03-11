import type { GroupSettings } from "../../schema/field-types/group";
import type { CellProps } from "../../schema/plugin";

export function GroupCell({ value }: CellProps<GroupSettings>) {
	if (!Array.isArray(value)) return <span>—</span>;
	const count = value.length;
	return (
		<span>
			{count} {count === 1 ? "item" : "items"}
		</span>
	);
}
GroupCell.displayName = "GroupCell";
