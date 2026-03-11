import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { GroupSettings } from "../../schema/field-types/group";
import type { FieldProps } from "../../schema/plugin";
import { FieldRenderer } from "../field-renderer";

export function GroupField({ field, readOnly }: FieldProps<GroupSettings>) {
	const { control } = useFormContext();
	const { config, settings } = field;
	const accessor = config.api_accessor;
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
		settings?.max_items === undefined || items.length < settings.max_items;
	const canRemove =
		settings?.min_items === undefined || items.length > settings.min_items;

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
					{!readOnly && canAdd && (
						<Flex justify="flex-end" mb={2}>
							<Button size="sm" variant="outline" onClick={() => append({})}>
								<Plus size={16} />
								Add item
							</Button>
						</Flex>
					)}

					{items.map((item, index) => (
						<Box
							key={item.id}
							borderWidth="1px"
							borderColor="border"
							borderRadius="md"
							p={4}
							mb={2}
							position="relative"
						>
							<Flex justify="space-between" align="center" mb={2}>
								<Text fontSize="sm" color="fg.muted">
									Item {index + 1}
								</Text>
								{!readOnly && canRemove && (
									<IconButton
										aria-label={`Remove item ${index + 1}`}
										size="xs"
										variant="ghost"
										onClick={() => remove(index)}
									>
										<Trash2 size={14} />
									</IconButton>
								)}
							</Flex>
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
						</Box>
					))}

					{items.length === 0 && (
						<Text fontSize="sm" color="fg.muted" fontStyle="italic">
							No items added yet.
						</Text>
					)}
				</Box>
			)}
		</FormField>
	);
}
GroupField.displayName = "GroupField";
