import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TextareaCell({ value }: CellProps) {
	return (
		<TruncatedTextCell
			value={value != null ? String(value) : null}
			maxLength={100}
		/>
	);
}
TextareaCell.displayName = "TextareaCell";
