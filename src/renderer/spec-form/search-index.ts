import type { SpecTab } from "../../schema/partition";

export interface FieldSearchResult {
	accessor: string;
	label: string;
	tabIndex: number;
	tabLabel: string;
}

export interface BuildSearchIndexOptions {
	/** Include fields marked `hidden` — the editor canvas renders them as
	 * selectable rows and must be able to jump to them; SpecForm never
	 * renders hidden fields, so its search must not surface them either. */
	includeHidden?: boolean;
}

export function buildSearchIndex(
	tabs: SpecTab[],
	defaultTabLabel: string,
	opts?: BuildSearchIndexOptions,
): FieldSearchResult[] {
	const includeHidden = opts?.includeHidden ?? false;
	return tabs.flatMap((tab, tabIndex) =>
		tab.fields
			// Card markers are layout, not fields — they have no focusable
			// control or read-mode row to jump to, so (like section markers,
			// which never appear in tab.fields at all) they are not results.
			.filter((field) => field.field_type !== "card")
			.filter((field) => includeHidden || !field.config.hidden)
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
