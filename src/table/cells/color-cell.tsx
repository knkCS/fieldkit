import type { CellProps } from "../../schema/plugin";

export function ColorCell({ value }: CellProps) {
	const color = value != null ? String(value) : "";
	if (!color) return <span>—</span>;

	return (
		<span
			style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
		>
			<span
				style={{
					display: "inline-block",
					width: "1rem",
					height: "1rem",
					borderRadius: "50%",
					backgroundColor: color,
					border: "1px solid #ccc",
				}}
			/>
			{color}
		</span>
	);
}
ColorCell.displayName = "ColorCell";
