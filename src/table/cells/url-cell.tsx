import type { CellProps } from "../../schema/plugin";

export function UrlCell({ value }: CellProps) {
	const url = value != null ? String(value) : "";
	if (!url) return <span>—</span>;

	return (
		<a href={url} target="_blank" rel="noopener noreferrer" title={url}>
			{url}
		</a>
	);
}
UrlCell.displayName = "UrlCell";
