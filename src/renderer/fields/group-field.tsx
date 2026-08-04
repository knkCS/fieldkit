import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { GroupSettings } from "../../schema/field-types/group";
import type { FieldProps } from "../../schema/plugin";
import { getDefaultValues } from "../../schema/zod-builder";
import { useFieldKit } from "../provider";
import { NestedItemFields } from "./item-fields";

export function GroupField({ field, readOnly }: FieldProps<GroupSettings>) {
	const { control } = useFormContext();
	const { getAllPlugins } = useFieldKit();
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

	// A new row starts as the record its children describe, not as `{}` — the
	// same seeding `getDefaultValues` does for the form itself (#38), one level
	// down. It matters more here than it reads: zod rejects `undefined` for a
	// required boolean but accepts `false`, and nothing a form user can do to
	// an untouched switch produces a value, so an unseeded row was a row they
	// could never submit once rows began validating (ADR-0007).
	//
	// Computed per click rather than memoised: a fresh object each time, so no
	// two rows share one, and there is nothing to keep in sync with `children`.
	const addItem = useCallback(
		() => append(getDefaultValues(children, getAllPlugins())),
		[append, children, getAllPlugins],
	);

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
							<Button size="sm" variant="outline" onClick={addItem}>
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
							<NestedItemFields
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
