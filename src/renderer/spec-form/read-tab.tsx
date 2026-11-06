// src/renderer/spec-form/read-tab.tsx
import { Box, useSlotRecipe } from "@chakra-ui/react";
import { useId } from "react";
import type { SpecTab } from "../../schema/partition";
import type { Field } from "../../schema/types";
import { FieldStack } from "../field-stack";
import { ReadValue, type ReadValueLabels } from "../read-value";

/**
 * One Field in read mode, laid out as the form lays out its control: the
 * label above, in the form's label style (the theme's `field` recipe), the
 * value below. Only the leaf differs — `ReadValue`, which hands over to the
 * Plugin's `readComponent`, where the form has its `fieldComponent`
 * (ADR-0030).
 *
 * The label is no `<label>`: there is no control to label. The pair is a
 * group named by it instead, which is what a reader's assistive technology
 * announces. `data-field-row` is the target the field search jumps to and
 * highlights.
 */
function ReadField({
	field,
	value,
	labels,
}: {
	field: Field;
	value: unknown;
	labels: ReadValueLabels;
}) {
	const labelId = useId();
	const styles = useSlotRecipe({ key: "field" })({ orientation: "vertical" });
	return (
		<Box
			css={styles.root}
			flexDirection="column"
			role="group"
			aria-labelledby={labelId}
			data-field-row={field.config.api_accessor}
		>
			<Box css={styles.label} id={labelId}>
				{field.config.name}
			</Box>
			<Box>
				<ReadValue field={field} value={value} labels={labels} />
			</Box>
		</Box>
	);
}
ReadField.displayName = "ReadField";

/**
 * Read mode's body for a run of a Tab's Fields — the whole Tab, or one Card's
 * share of it: the form's rhythm, a `ReadField` per Field the form would
 * show. Form-free: nothing here touches react-hook-form.
 */
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
		<FieldStack data-testid="read-fields">
			{tab.fields
				.filter((field) => !field.config.hidden)
				.map((field) => (
					<ReadField
						key={field.config.api_accessor}
						field={field}
						value={values[field.config.api_accessor]}
						labels={labels}
					/>
				))}
		</FieldStack>
	);
}
ReadTab.displayName = "ReadTab";
