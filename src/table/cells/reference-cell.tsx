import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function ReferenceCell({ value }: CellProps) {
	if (value == null) return <TruncatedTextCell value={null} />;

	if (Array.isArray(value)) {
		if (value.length === 0) return <TruncatedTextCell value={null} />;
		const display = value.map((v) => {
			if (typeof v === "object" && v !== null && "display_name" in v) {
				return String((v as Record<string, unknown>).display_name);
			}
			return String(v);
		});
		return <TruncatedTextCell value={display.join(", ")} maxLength={100} />;
	}

	return <TruncatedTextCell value={String(value)} />;
}
ReferenceCell.displayName = "ReferenceCell";
