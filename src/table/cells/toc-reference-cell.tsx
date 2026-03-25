import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TocReferenceCell({ value }: CellProps) {
	if (value == null || value === "") return <TruncatedTextCell value={null} />;

	const text =
		typeof value === "object" && value !== null && "display_name" in value
			? String((value as Record<string, unknown>).display_name)
			: String(value);

	return <TruncatedTextCell value={text} />;
}
TocReferenceCell.displayName = "TocReferenceCell";
