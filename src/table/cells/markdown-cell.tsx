import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

/** Strip basic markdown formatting for plain text display. */
function stripMarkdown(text: string): string {
	return text
		.replace(/#{1,6}\s+/g, "")
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/__(.+?)__/g, "$1")
		.replace(/\*(.+?)\*/g, "$1")
		.replace(/_(.+?)_/g, "$1")
		.replace(/`(.+?)`/g, "$1")
		.replace(/\[(.+?)\]\(.+?\)/g, "$1")
		.replace(/!\[.*?\]\(.+?\)/g, "[image]")
		.replace(/\n/g, " ")
		.trim();
}

export function MarkdownCell({ value }: CellProps) {
	const raw = value != null ? String(value) : "";
	const text = stripMarkdown(raw);
	return <TruncatedTextCell value={text || null} maxLength={100} />;
}
MarkdownCell.displayName = "MarkdownCell";
