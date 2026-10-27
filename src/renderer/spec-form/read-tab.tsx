// src/renderer/spec-form/read-tab.tsx
import { Box } from "@chakra-ui/react";
import { DescriptionList } from "@knkcs/anker/components";
import type { SpecTab } from "../../schema/partition";
import { ReadValue, type ReadValueLabels } from "../read-value";

export function ReadTab({
	tab,
	values,
	labels,
}: {
	tab: SpecTab;
	values: Record<string, unknown>;
	labels: ReadValueLabels;
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
						{/* span+block: DescriptionList.Row renders its value inside a
						    <p>, and a div child triggers React's DOM-nesting warning. */}
						<Box
							as="span"
							display="block"
							data-field-row={field.config.api_accessor}
						>
							<ReadValue
								field={field}
								value={values[field.config.api_accessor]}
								labels={labels}
							/>
						</Box>
					</DescriptionList.Row>
				))}
		</DescriptionList>
	);
}
ReadTab.displayName = "ReadTab";
