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
  const truncated = text.length > 100 ? `${text.slice(0, 100)}...` : text;
  return <span title={text}>{truncated}</span>;
}
RichTextCell.displayName = "RichTextCell";
