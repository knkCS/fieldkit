// src/schema/search.ts

/**
 * How a Field's text weighs in Delivery Search: `off`, or a weight from `A`
 * (heaviest) to `D`. Unset means `D` on a type that has text (#203), which is
 * the Consumer's reading to apply; fieldkit only checks the value.
 */
export type SearchWeight = "off" | "A" | "B" | "C" | "D";

/** Every value `config.search` accepts. */
export const SEARCH_WEIGHTS: readonly SearchWeight[] = [
	"off",
	"A",
	"B",
	"C",
	"D",
];

/** Whether a value is one `config.search` accepts. */
export function isSearchWeight(value: unknown): value is SearchWeight {
	return (SEARCH_WEIGHTS as readonly unknown[]).includes(value);
}
