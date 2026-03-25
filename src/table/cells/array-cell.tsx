import { CountCell } from "@knkcs/anker/components";
import type { ArraySettings } from "../../schema/field-types/array";
import type { CellProps } from "../../schema/plugin";

export function ArrayCell({ field, value }: CellProps<ArraySettings>) {
	const mode = field.settings?.mode ?? "dynamic";

	if (mode === "keyed") {
		return <CountCell value={value as Record<string, unknown> | null} singular="entry" plural="entries" />;
	}

	return <CountCell value={value as unknown[] | null} singular="item" plural="items" />;
}
ArrayCell.displayName = "ArrayCell";
