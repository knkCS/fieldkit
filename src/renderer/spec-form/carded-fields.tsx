// src/renderer/spec-form/carded-fields.tsx
import { Stack } from "@chakra-ui/react";
import { useMemo } from "react";
import type { SpecTab } from "../../schema/partition";
import { partitionTabByCards } from "../../schema/partition-cards";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { CardSurface } from "./card-surface";
import { ReadTab } from "./read-tab";

/**
 * Edit-mode body for ONE tab: stacked card frames when the tab contains
 * `card` markers, today's flat FieldRenderer otherwise (no wrapper element).
 * Leading loose fields in a carded tab render as an implicit untitled card —
 * the NORMATIVE graceful degrade: a schema is data, rendering must never
 * break on a `loose_field_in_carded_tab` validation violation.
 */
export function CardedFields({
	fields,
	readOnly,
}: {
	fields: Field[];
	readOnly?: boolean;
}) {
	const partition = useMemo(() => partitionTabByCards(fields), [fields]);

	if (!partition.hasCards) {
		return <FieldRenderer schema={fields} readOnly={readOnly} />;
	}

	return (
		<Stack gap="5">
			{partition.cards.map((group, i) => (
				<CardSurface
					key={group.card?.config.api_accessor ?? `implicit-${i}`}
					title={
						group.card?.config.name.trim()
							? group.card.config.name.trim()
							: undefined
					}
				>
					{/* FieldRenderer keeps the 20px field rhythm inside the card. */}
					<FieldRenderer schema={group.fields} readOnly={readOnly} />
				</CardSurface>
			))}
		</Stack>
	);
}
CardedFields.displayName = "CardedFields";

/**
 * Read-mode body for ONE tab: the same card boxes as edit mode with
 * DescriptionList rows inside (via ReadTab per card group — a synthetic
 * SpecTab scoped to the group's fields), today's flat ReadTab otherwise.
 * Same implicit-untitled-card degrade for leading loose fields. Form-free:
 * ReadTab never touches react-hook-form.
 */
export function CardedReadTab({
	tab,
	values,
	labels,
}: {
	tab: SpecTab;
	values: Record<string, unknown>;
	labels: { booleanYes: string; booleanNo: string };
}) {
	const partition = useMemo(
		() => partitionTabByCards(tab.fields),
		[tab.fields],
	);

	if (!partition.hasCards) {
		return <ReadTab tab={tab} values={values} labels={labels} />;
	}

	return (
		<Stack gap="5">
			{partition.cards.map((group, i) => (
				<CardSurface
					key={group.card?.config.api_accessor ?? `implicit-${i}`}
					title={
						group.card?.config.name.trim()
							? group.card.config.name.trim()
							: undefined
					}
				>
					<ReadTab
						tab={{ section: tab.section, fields: group.fields }}
						values={values}
						labels={labels}
					/>
				</CardSurface>
			))}
		</Stack>
	);
}
CardedReadTab.displayName = "CardedReadTab";
