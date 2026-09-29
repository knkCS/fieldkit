import { TruncatedTextCell } from "@knkcs/anker/components";
import { richTextPreview } from "../../renderer/fields/rich-text-preview";
import type { CellProps } from "../../schema/plugin";

export function RichTextCell({ value }: CellProps) {
	const text = richTextPreview(value);
	return <TruncatedTextCell value={text || null} maxLength={100} />;
}
RichTextCell.displayName = "RichTextCell";
