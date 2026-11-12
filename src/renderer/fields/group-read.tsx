// src/renderer/fields/group-read.tsx
import { Box, Stack } from "@chakra-ui/react";
import type { GroupSettings } from "../../schema/field-types/group";
import type { ReadProps } from "../../schema/plugin";
import { FieldStack } from "../field-stack";
import { ReadField } from "../spec-form/read-fields";
import { EmptyReadValue } from "./empty-value";

/**
 * A Group in read mode: every row, each framed as the form frames a Group
 * row, its child Fields laid out as read mode lays out a top-level Field —
 * label above value, the form's rhythm — through the same `ReadField`
 * (#637). The label-left description list this replaced is the layout
 * ADR-0030 removed at the top level.
 *
 * It bypasses `GroupCell` deliberately. A cell has one row of height, so "3
 * items" is the honest answer at table density; read mode has the whole page
 * and can show what those three items actually are.
 *
 * Nothing here knows what a child Field *is* — `renderChild` renders each
 * value the same way read mode renders any value, so a boolean child reads as
 * "Yes", an empty one as the em dash, and a nested Group reads as its own rows
 * without this component carrying a case for any of them.
 */
export function GroupReadValue({
	field,
	value,
	renderChild,
}: ReadProps<GroupSettings>) {
	if (!Array.isArray(value)) return <EmptyReadValue />;

	// The children someone filling in the form was actually shown: a hidden
	// child has no row here for the same reason it has no control there.
	const children = (field.children ?? []).filter(
		(child) => !child.config.hidden,
	);

	return (
		<Stack gap="2">
			{value.map((item, index) => (
				// GroupField's row frame, so a row ends where it ends in both modes.
				<Box
					// biome-ignore lint/suspicious/noArrayIndexKey: group items are positional; repeating-group values carry no stable id
					key={`${field.config.api_accessor}-${index}`}
					borderWidth="1px"
					borderColor="border"
					borderRadius="md"
					p={4}
					data-testid="group-read-row"
				>
					<FieldStack>
						{children.map((child) => (
							<ReadField key={child.config.api_accessor} field={child}>
								{renderChild(
									child,
									(item as Record<string, unknown> | null)?.[
										child.config.api_accessor
									],
								)}
							</ReadField>
						))}
					</FieldStack>
				</Box>
			))}
		</Stack>
	);
}
GroupReadValue.displayName = "GroupReadValue";
