// src/renderer/fields/group-read.tsx
import { Box } from "@chakra-ui/react";
import { DescriptionList } from "@knkcs/anker/components";
import type { GroupSettings } from "../../schema/field-types/group";
import type { ReadProps } from "../../schema/plugin";
import { EmptyReadValue } from "./empty-value";

/**
 * A Group in read mode: every row, with every child Field's value against its
 * name.
 *
 * It bypasses `GroupCell` deliberately. A cell has one row of height, so "3
 * items" is the honest answer at table density; read mode has the whole page
 * and can show what those three items actually are.
 *
 * Nothing here knows what a child Field *is* — `renderChild` renders each
 * value the same way read mode renders any value, so a boolean child reads as
 * "Yes" and a nested Group reads as its own rows without this component
 * carrying a case for either.
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
		<Box display="flex" flexDirection="column" gap="3">
			{value.map((item, index) => (
				<Box
					// biome-ignore lint/suspicious/noArrayIndexKey: group items are positional; repeating-group values carry no stable id
					key={`${field.config.api_accessor}-${index}`}
					borderLeftWidth="2px"
					borderColor="border"
					pl="3"
				>
					<DescriptionList orientation="horizontal">
						{children.map((child) => (
							<DescriptionList.Row
								key={child.config.api_accessor}
								label={child.config.name}
							>
								{renderChild(
									child,
									(item as Record<string, unknown>)[child.config.api_accessor],
								)}
							</DescriptionList.Row>
						))}
					</DescriptionList>
				</Box>
			))}
		</Box>
	);
}
GroupReadValue.displayName = "GroupReadValue";
