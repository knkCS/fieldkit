import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

/** Attempt to extract plain text from a ProseMirror-like JSON document. */
function extractText(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return String(value);

	const doc = value as Record<string, unknown>;
	if (Array.isArray(doc.content)) {
		return doc.content.map(extractText).join(" ").trim();
	}
	if (typeof doc.text === "string") return doc.text;

	return "[Rich text content]";
}

export function RichTextCell({ value }: CellProps) {
	const text = extractText(value);
	return <TruncatedTextCell value={text || null} maxLength={100} />;
}
RichTextCell.displayName = "RichTextCell";
