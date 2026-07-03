import type { SpecTab } from "../../schema/partition";

export interface FieldSearchResult {
	accessor: string;
	label: string;
	tabIndex: number;
	tabLabel: string;
}

export function buildSearchIndex(
	tabs: SpecTab[],
	defaultTabLabel: string,
): FieldSearchResult[] {
	return tabs.flatMap((tab, tabIndex) =>
		tab.fields
			.filter((field) => !field.config.hidden)
			.map((field) => ({
				accessor: field.config.api_accessor,
				label: field.config.name,
				tabIndex,
				tabLabel: tab.section?.config.name ?? defaultTabLabel,
			})),
	);
}

export function searchFields(
	index: FieldSearchResult[],
	query: string,
): FieldSearchResult[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return index.filter(
		(r) =>
			r.label.toLowerCase().includes(q) || r.accessor.toLowerCase().includes(q),
	);
}
