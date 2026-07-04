import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus, Trash2 } from "lucide-react";
import { memo, useMemo } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { GroupSettings } from "../../schema/field-types/group";
import type { FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";

interface GroupItemFieldsProps {
	childFields: Field[];
	parentAccessor: string;
	index: number;
	readOnly?: boolean;
}

/**
 * Renders one group item's nested fields, computing the remapped schema
 * (child api_accessor rewritten to `${parentAccessor}.${index}.${...}`) in a
 * useMemo keyed on the stable inputs. This keeps the schema array reference
 * stable across re-renders of the parent GroupField that don't affect this
 * particular item, which is required for FieldComponent's identity-based
 * memo (see field-component.tsx) to actually skip re-rendering.
 */
function GroupItemFieldsInner({
	childFields,
	parentAccessor,
	index,
	readOnly,
}: GroupItemFieldsProps) {
	const schema = useMemo(
		() =>
			childFields.map((child) => ({
				...child,
				config: {
					...child.config,
					api_accessor: `${parentAccessor}.${index}.${child.config.api_accessor}`,
				},
			})),
		[childFields, parentAccessor, index],
	);

	return <FieldRenderer schema={schema} readOnly={readOnly} />;
}

const GroupItemFields = memo(GroupItemFieldsInner);
GroupItemFields.displayName = "GroupItemFields";

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
							<GroupItemFields
								childFields={children}
								parentAccessor={accessor}
								index={index}
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
