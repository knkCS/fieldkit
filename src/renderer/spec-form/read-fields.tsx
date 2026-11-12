// src/renderer/spec-form/read-fields.tsx
import { Box, useSlotRecipe } from "@chakra-ui/react";
import { useId } from "react";
import type { SpecTab } from "../../schema/partition";
import type { Field } from "../../schema/types";
import {
	FieldLabelRowProvider,
	labelWithSuffix,
	useFieldLabelRowHost,
} from "../field-label-row";
import { FieldStack } from "../field-stack";
import { ReadValue, type ReadValueLabels } from "../read-value";

/**
 * One Field in read mode, laid out as the form lays out its control: the
 * label above, in the form's label style (the theme's `field` recipe), the
 * value below. Only the leaf differs — `ReadValue`, which hands over to the
 * Plugin's `readComponent`, where the form has its `fieldComponent`
 * (ADR-0030).
 *
 * Raw Chakra, because anker has nothing that fits: its `*Field`s and
 * `ControlledFormField` wrap a control (a `<label htmlFor>`, required and
 * dirty markers, helper text), and its `DescriptionList`, even vertical, has
 * its own label style and puts the value in a `<p>`. The `field` recipe is
 * the one anker's form label is drawn from (`Field.Label`), so the two labels
 * read the same.
 *
 * Only the name: the required marker and the instructions guide filling the
 * form in, and there is nothing to fill in here.
 *
 * The label is no `<label>`: there is no control to label. The pair is a
 * group named by it instead, which is what a reader's assistive technology
 * announces. `data-field-row` is the target the field search jumps to and
 * highlights — the whole Field, label and value.
 *
 * The label sits in a label row whose right end holds the Field's own actions
 * (`FieldLabelActions`, from the value below), and whose text a value can add
 * to (`useFieldLabelSuffix` — a Reference Field's count). A Field with neither
 * draws the label where it always was.
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
	const labelRow = useFieldLabelRowHost();
	return (
		<Box
			css={styles.root}
			flexDirection="column"
			role="group"
			aria-labelledby={labelId}
			data-field-row={field.config.api_accessor}
		>
			<Box display="flex" alignItems="center" gap="2">
				<Box css={styles.label} id={labelId} flex="1">
					{labelWithSuffix(field.config.name, labelRow.suffix)}
				</Box>
				{labelRow.slot}
			</Box>
			<Box>
				<FieldLabelRowProvider row={labelRow.row}>
					<ReadValue field={field} value={value} labels={labels} />
				</FieldLabelRowProvider>
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
export function ReadFields({
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
ReadFields.displayName = "ReadFields";
