import type { Field } from "./types";

export interface CardGroup {
	/** The card marker; null ONLY for the implicit leading group (loose
	 * fields before the first marker — the renderer's degrade rule). */
	card: Field | null;
	fields: Field[];
}

export interface CardPartition {
	cards: CardGroup[];
	hasCards: boolean;
}

/**
 * Splits ONE tab's fields into card groups at each `card` marker — the
 * card-layout sibling of `partitionSchemaBySections`, one level down.
 * Input is a SpecTab's `fields` (section markers never reach it because
 * partitionSchemaBySections runs first). Pure and React-free — shared by
 * SpecForm (edit + read), the editor canvas, and validateSpec.
 */
export function partitionTabByCards(fields: Field[]): CardPartition {
	const cards: CardGroup[] = [];
	let current: CardGroup | null = null;
	let hasCards = false;

	for (const field of fields) {
		if (field.field_type === "card") {
			hasCards = true;
			current = { card: field, fields: [] };
			cards.push(current);
		} else {
			if (!current) {
				current = { card: null, fields: [] };
				cards.push(current);
			}
			current.fields.push(field);
		}
	}

	return { cards, hasCards };
}
