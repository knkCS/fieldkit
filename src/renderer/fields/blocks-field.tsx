import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { BlocksSettings } from "../../schema/field-types/blocks";
import type { FieldProps } from "../../schema/plugin";
import { FieldRenderer } from "../field-renderer";

export function BlocksField({ field, readOnly }: FieldProps<BlocksSettings>) {
	const { control } = useFormContext();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const allowedBlocks = settings?.allowed_blocks ?? [];

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
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() => (
				<Box>
					{!readOnly && (
						<Flex justify="flex-end" mb={2}>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setShowTypePicker(!showTypePicker)}
							>
								<Plus size={16} />
								Add block
							</Button>
						</Flex>
					)}

					{showTypePicker && (
						<Flex
							borderWidth="1px"
							borderColor="border"
							borderRadius="md"
							p={2}
							mb={2}
							gap={2}
							flexWrap="wrap"
						>
							{allowedBlocks.map((block) => (
								<Button
									key={block.type}
									size="sm"
									variant="outline"
									onClick={() => addBlock(block.type)}
								>
									{block.name}
								</Button>
							))}
							{allowedBlocks.length === 0 && (
								<Text fontSize="sm" color="fg.muted">
									No block types configured
								</Text>
							)}
						</Flex>
					)}

					{items.map((item, index) => {
						const blockType = (item as Record<string, unknown>)._type as
							| string
							| undefined;
						const blockDef = blockType ? getBlockDef(blockType) : undefined;
						const blockFields = blockDef?.fields ?? [];

						return (
							<Box
								key={item.id}
								borderWidth="1px"
								borderColor="border"
								borderRadius="md"
								p={4}
								mb={2}
							>
								<Flex justify="space-between" align="center" mb={2}>
									<Text fontSize="sm" fontWeight="medium">
										{blockDef?.name ?? blockType ?? "Unknown block"}
									</Text>
									{!readOnly && (
										<Flex gap={1}>
											{index > 0 && (
												<IconButton
													aria-label="Move up"
													size="xs"
													variant="ghost"
													onClick={() => move(index, index - 1)}
												>
													<ArrowUp size={14} />
												</IconButton>
											)}
											{index < items.length - 1 && (
												<IconButton
													aria-label="Move down"
													size="xs"
													variant="ghost"
													onClick={() => move(index, index + 1)}
												>
													<ArrowDown size={14} />
												</IconButton>
											)}
											<IconButton
												aria-label={`Remove block ${index + 1}`}
												size="xs"
												variant="ghost"
												onClick={() => remove(index)}
											>
												<Trash2 size={14} />
											</IconButton>
										</Flex>
									)}
								</Flex>
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
							</Box>
						);
					})}

					{items.length === 0 && (
						<Text fontSize="sm" color="fg.muted" fontStyle="italic">
							No blocks added yet.
						</Text>
					)}
				</Box>
			)}
		</FormField>
	);
}
BlocksField.displayName = "BlocksField";
