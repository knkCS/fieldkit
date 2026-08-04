// src/renderer/spec-form/read-tab.tsx
import { Box, Text } from "@chakra-ui/react";
import { DescriptionList } from "@knkcs/anker/components";
import type { SpecTab } from "../../schema/partition";
import { asReference } from "../../schema/reference";
import type { Field } from "../../schema/types";
import { useResolvedContentName } from "../hooks/use-resolved-content-name";
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

interface ReadValueLabels {
	booleanYes: string;
	booleanNo: string;
}

/**
 * Type-aware fallback for plugins without a cellComponent: booleans and
 * primitive arrays render readably instead of raw String(value); objects
 * (and arrays containing objects) fall back to the em-dash convention —
 * a cellComponent is the API for full control over complex values.
 * Returns null for "render the em dash".
 */
function formatFallback(
	value: unknown,
	labels: ReadValueLabels,
): string | null {
	if (typeof value === "boolean") {
		return value ? labels.booleanYes : labels.booleanNo;
	}
	if (Array.isArray(value)) {
		const primitives = value.every(
			(v) =>
				typeof v === "string" ||
				typeof v === "number" ||
				typeof v === "boolean",
		);
		if (!primitives) return null;
		return value
			.map((v) =>
				typeof v === "boolean"
					? v
						? labels.booleanYes
						: labels.booleanNo
					: String(v),
			)
			.join(", ");
	}
	if (typeof value === "object") return null;
	return String(value);
}

/**
 * A Single Reference in read mode: the referenced Content's *current* name,
 * resolved through the Adapter, falling back to its id when it cannot be
 * resolved so the Reference is visible rather than gone.
 *
 * This is why the type's cell is bypassed below — a cell has neither Adapter
 * access nor async and can only show the id.
 */
function SingleReferenceReadValue({
	field,
	value,
}: {
	field: Field;
	value: unknown;
}) {
	const reference = asReference(value);
	const name = useResolvedContentName(
		reference?.id ?? null,
		field.config.api_accessor,
	);
	if (!reference) return <Text color="fg.muted">{EMPTY}</Text>;
	return <Text>{name ?? reference.id}</Text>;
}
SingleReferenceReadValue.displayName = "SingleReferenceReadValue";

function ReadValue({
	field,
	value,
	labels,
}: {
	field: Field;
	value: unknown;
	labels: ReadValueLabels;
}) {
	const { getPlugin } = useFieldKit();
	if (isEmpty(value)) return <Text color="fg.muted">{EMPTY}</Text>;

	// Groups bypass their cellComponent: the cell is table-density ("N items"),
	// read mode shows the actual per-item rows.
	if (field.field_type === "group" && Array.isArray(value)) {
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
									<ReadValue
										field={child}
										value={
											(item as Record<string, unknown>)[
												child.config.api_accessor
											]
										}
										labels={labels}
									/>
								</DescriptionList.Row>
							))}
						</DescriptionList>
					</Box>
				))}
			</Box>
		);
	}

	// Single References bypass their cellComponent for the same reason Groups
	// do: the cell is table-density (an id, because a cell cannot resolve a
	// name), read mode shows the Content's actual name.
	if (field.field_type === "single_reference") {
		return <SingleReferenceReadValue field={field} value={value} />;
	}

	const Cell = getPlugin(field.field_type)?.cellComponent;
	if (Cell) return <Cell field={field} value={value} />;

	const formatted = formatFallback(value, labels);
	if (formatted == null) return <Text color="fg.muted">{EMPTY}</Text>;
	return <Text>{formatted}</Text>;
}
ReadValue.displayName = "ReadValue";

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
