// src/renderer/spec-form/read-tab.tsx
import { Box, Text } from "@chakra-ui/react";
import { DescriptionList } from "@knkcs/anker/components";
import type { SpecTab } from "../../schema/partition";
import type { Field } from "../../schema/types";
import { useFieldKit } from "../provider";

const EMPTY = "—";

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

function ReadValue({ field, value }: { field: Field; value: unknown }) {
	const { getPlugin } = useFieldKit();
	if (isEmpty(value)) return <Text color="fg.muted">{EMPTY}</Text>;

	const Cell = getPlugin(field.field_type)?.cellComponent;
	if (Cell) return <Cell field={field} value={value} />;

	if (field.field_type === "group" && Array.isArray(value)) {
		const children = field.children ?? [];
		return (
			<Box display="flex" flexDirection="column" gap="3">
				{value.map((item, index) => (
					<Box
						key={`${field.config.api_accessor}-${index as number}`}
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
									<ReadValue
										field={child}
										value={
											(item as Record<string, unknown>)[
												child.config.api_accessor
											]
										}
									/>
								</DescriptionList.Row>
							))}
						</DescriptionList>
					</Box>
				))}
			</Box>
		);
	}

	return <Text>{String(value)}</Text>;
}
ReadValue.displayName = "ReadValue";

export function ReadTab({
	tab,
	values,
}: {
	tab: SpecTab;
	values: Record<string, unknown>;
}) {
	return (
		<DescriptionList orientation="horizontal">
			{tab.fields
				.filter((field) => !field.config.hidden)
				.map((field) => (
					<DescriptionList.Row
						key={field.config.api_accessor}
						label={field.config.name}
					>
						<Box data-field-row={field.config.api_accessor}>
							<ReadValue
								field={field}
								value={values[field.config.api_accessor]}
							/>
						</Box>
					</DescriptionList.Row>
				))}
		</DescriptionList>
	);
}
ReadTab.displayName = "ReadTab";
