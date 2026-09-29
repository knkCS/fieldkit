// src/renderer/fields/rich-text-preview.ts

/**
 * A rich-text document's text, as far as fieldkit can read it without
 * knkeditor: every `text` node, blocks joined by a space. A preview only — the
 * real reading text is knkeditor's (`Texts` in Go) — for the table cell and
 * the core renderer's read-only fallback, neither of which may import
 * knkeditor (ADR-0026).
 */
export function richTextPreview(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return String(value);

	const doc = value as Record<string, unknown>;
	if (Array.isArray(doc.content)) {
		return doc.content.map(richTextPreview).join(" ").trim();
	}
	if (typeof doc.text === "string") return doc.text;

	return "[Rich text content]";
}
