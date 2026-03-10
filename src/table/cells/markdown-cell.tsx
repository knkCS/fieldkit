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
  const truncated = text.length > 100 ? `${text.slice(0, 100)}...` : text;
  return <span title={text}>{truncated}</span>;
}
MarkdownCell.displayName = "MarkdownCell";
