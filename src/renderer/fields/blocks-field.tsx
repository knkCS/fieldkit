import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { BlocksSettings } from "../../schema/field-types/blocks";
import type { FieldProps } from "../../schema/plugin";
import { FieldRenderer } from "../field-renderer";

export function BlocksField({ field, readOnly }: FieldProps<BlocksSettings>) {
	const { control } = useFormContext();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? { allowed_blocks: [] };
	const allowedBlocks = settings.allowed_blocks ?? [];

	const {
		fields: items,
		append,
		remove,
		move,
	} = useFieldArray({
		control,
		name: accessor,
	});

	const [showTypePicker, setShowTypePicker] = useState(false);

	const addBlock = (blockType: string) => {
		append({ _type: blockType });
		setShowTypePicker(false);
	};

	const getBlockDef = (type: string) =>
		allowedBlocks.find((b) => b.type === type);

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
				{!readOnly && (
					<button
						type="button"
						onClick={() => setShowTypePicker(!showTypePicker)}
						style={{
							padding: "0.25rem 0.75rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
							background: "white",
							cursor: "pointer",
						}}
					>
						Add block
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
			{showTypePicker && (
				<div
					style={{
						border: "1px solid #e0e0e0",
						borderRadius: "4px",
						padding: "0.5rem",
						marginBottom: "0.5rem",
						display: "flex",
						gap: "0.5rem",
						flexWrap: "wrap",
					}}
				>
					{allowedBlocks.map((block) => (
						<button
							key={block.type}
							type="button"
							onClick={() => addBlock(block.type)}
							style={{
								padding: "0.25rem 0.75rem",
								border: "1px solid #ccc",
								borderRadius: "4px",
								background: "white",
								cursor: "pointer",
							}}
						>
							{block.name}
						</button>
					))}
					{allowedBlocks.length === 0 && (
						<span style={{ fontSize: "0.875rem", color: "#999" }}>
							No block types configured
						</span>
					)}
				</div>
			)}
			{items.map((item, index) => {
				const blockType = (item as Record<string, unknown>)._type as
					| string
					| undefined;
				const blockDef = blockType ? getBlockDef(blockType) : undefined;
				const blockFields = blockDef?.fields ?? [];

				return (
					<div
						key={item.id}
						style={{
							border: "1px solid #e0e0e0",
							borderRadius: "4px",
							padding: "1rem",
							marginBottom: "0.5rem",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "0.5rem",
							}}
						>
							<span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
								{blockDef?.name ?? blockType ?? "Unknown block"}
							</span>
							{!readOnly && (
								<div style={{ display: "flex", gap: "0.25rem" }}>
									{index > 0 && (
										<button
											type="button"
											onClick={() => move(index, index - 1)}
											style={{
												padding: "0.125rem 0.5rem",
												border: "1px solid #ccc",
												borderRadius: "4px",
												background: "white",
												cursor: "pointer",
												fontSize: "0.75rem",
											}}
										>
											Up
										</button>
									)}
									{index < items.length - 1 && (
										<button
											type="button"
											onClick={() => move(index, index + 1)}
											style={{
												padding: "0.125rem 0.5rem",
												border: "1px solid #ccc",
												borderRadius: "4px",
												background: "white",
												cursor: "pointer",
												fontSize: "0.75rem",
											}}
										>
											Down
										</button>
									)}
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
								</div>
							)}
						</div>
						{blockFields.length > 0 && (
							<FieldRenderer
								schema={blockFields.map((child) => ({
									...child,
									config: {
										...child.config,
										api_accessor: `${accessor}.${index}.${child.config.api_accessor}`,
									},
								}))}
								readOnly={readOnly}
							/>
						)}
					</div>
				);
			})}
			{items.length === 0 && (
				<p style={{ fontSize: "0.875rem", color: "#999", fontStyle: "italic" }}>
					No blocks added yet.
				</p>
			)}
		</div>
	);
}
BlocksField.displayName = "BlocksField";
