// src/renderer/spec-form/use-tab-indicators.ts
import { useFormState } from "react-hook-form";
import type { SpecTab } from "../../schema/partition";

export interface TabIndicator {
	dirty: boolean;
	errorCount: number;
}

/**
 * Maps RHF dirtyFields/errors onto tab partitions by top-level accessor.
 *
 * Deliberately NOT wrapped in `useMemo`: RHF mutates `dirtyFields`/`errors`
 * in place rather than replacing them, so a memo keyed on those references
 * would never see a dependency change and would return stale indicators.
 * The map below is cheap (bounded by field count), so recomputing on every
 * render this hook is invoked (i.e. every formState change) is fine.
 */
export function useTabIndicators(tabs: SpecTab[]): TabIndicator[] {
	const { dirtyFields, errors } = useFormState();

	return tabs.map((tab) => {
		let dirty = false;
		let errorCount = 0;
		for (const field of tab.fields) {
			const accessor = field.config.api_accessor;
			if (dirtyFields[accessor]) dirty = true;
			if (errors[accessor]) errorCount += 1;
		}
		return { dirty, errorCount };
	});
}
