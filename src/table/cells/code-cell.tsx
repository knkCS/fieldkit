import type { CellProps } from "../../schema/plugin";

export function CodeCell({ value }: CellProps) {
	const text = value != null ? String(value) : "";
	const truncated = text.length > 80 ? `${text.slice(0, 80)}...` : text;
	return (
		<code
			title={text}
			style={{
				fontFamily: "monospace",
				fontSize: "0.8125rem",
				backgroundColor: "#f5f5f5",
				padding: "0.125rem 0.25rem",
				borderRadius: "2px",
			}}
		>
			{truncated}
		</code>
	);
}
CodeCell.displayName = "CodeCell";
