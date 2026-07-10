// src/renderer/spec-form/carded-fields.tsx
import { Stack } from "@chakra-ui/react";
import { useMemo } from "react";
import { partitionTabByCards } from "../../schema/partition-cards";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { CardSurface } from "./card-surface";

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
						group.card?.config.name.trim() ? group.card.config.name : undefined
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
