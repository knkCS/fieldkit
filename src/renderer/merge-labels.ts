// src/renderer/merge-labels.ts

/**
 * Merge label overrides over their defaults, IGNORING keys whose value
 * is explicitly `undefined` — a plain `{ ...defaults, ...overrides }`
 * lets such keys clobber the default (the recurring TryItView bug,
 * fieldkit#32). Returns a fresh object; never mutates `defaults`.
 */
export function mergeLabels<T extends object>(
	defaults: Required<T>,
	overrides?: T,
): Required<T> {
	const merged = { ...defaults };
	if (!overrides) return merged;
	for (const key of Object.keys(overrides) as (keyof T)[]) {
		const value = overrides[key];
		if (value !== undefined) {
			(merged as T)[key] = value;
		}
	}
	return merged;
}

/**
 * Count-aware label pick: the singular form at exactly 1, otherwise the
 * plural template with `{count}` interpolated.
 */
export function formatCount(one: string, many: string, count: number): string {
	return count === 1 ? one : many.replace("{count}", String(count));
}
