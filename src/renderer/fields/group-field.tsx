import { useFieldArray, useFormContext } from "react-hook-form";
import type { GroupSettings } from "../../schema/field-types/group";
import type { FieldProps } from "../../schema/plugin";
import { FieldRenderer } from "../field-renderer";

export function GroupField({ field, readOnly }: FieldProps<GroupSettings>) {
	const { control } = useFormContext();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? {};
	const children = field.children ?? [];

	const {
		fields: items,
		append,
		remove,
	} = useFieldArray({
		control,
		name: accessor,
	});

	const canAdd =
		settings.max_items === undefined || items.length < settings.max_items;
	const canRemove =
		settings.min_items === undefined || items.length > settings.min_items;

	return (
		<div style={{ marginBottom: "1rem" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: "0.5rem",
				}}
			>
				<label style={{ fontWeight: 500 }}>
					{field.config.name}
					{field.config.required && <span style={{ color: "red" }}> *</span>}
				</label>
				{!readOnly && canAdd && (
					<button
						type="button"
						onClick={() => append({})}
						style={{
							padding: "0.25rem 0.75rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
							background: "white",
							cursor: "pointer",
						}}
					>
						Add item
					</button>
				)}
			</div>
			{field.config.instructions && (
				<p
					style={{
						fontSize: "0.875rem",
						color: "#666",
						marginBottom: "0.5rem",
					}}
				>
					{field.config.instructions}
				</p>
			)}
			{items.map((item, index) => (
				<div
					key={item.id}
					style={{
						border: "1px solid #e0e0e0",
						borderRadius: "4px",
						padding: "1rem",
						marginBottom: "0.5rem",
						position: "relative",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							marginBottom: "0.5rem",
						}}
					>
						<span style={{ fontSize: "0.875rem", color: "#666" }}>
							Item {index + 1}
						</span>
						{!readOnly && canRemove && (
							<button
								type="button"
								onClick={() => remove(index)}
								style={{
									padding: "0.125rem 0.5rem",
									border: "1px solid #ccc",
									borderRadius: "4px",
									background: "white",
									cursor: "pointer",
									fontSize: "0.75rem",
								}}
							>
								Remove
							</button>
						)}
					</div>
					<FieldRenderer
						schema={children.map((child) => ({
							...child,
							config: {
								...child.config,
								api_accessor: `${accessor}.${index}.${child.config.api_accessor}`,
							},
						}))}
						readOnly={readOnly}
					/>
				</div>
			))}
			{items.length === 0 && (
				<p style={{ fontSize: "0.875rem", color: "#999", fontStyle: "italic" }}>
					No items added yet.
				</p>
			)}
		</div>
	);
}
GroupField.displayName = "GroupField";
