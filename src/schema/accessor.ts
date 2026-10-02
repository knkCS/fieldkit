/**
 * The most characters `accessorFromName` derives. It matches blueprinthub's
 * accessor limit (its ADR 0006, D1), so one preset serves Fields and
 * Blueprints alike (knkCS/blueprinthub#153). It bounds the derivation only:
 * fieldkit's validators set no length limit on an Accessor, and adding one
 * would refuse Accessors that already exist (ADR-0019).
 */
export const ACCESSOR_MAX_LENGTH = 64;

// German letters spelled out before NFKD runs: NFKD alone turns `ä` into `a`,
// which reads as a different word ("Bär" is not "bar"), and drops `ß`.
const TRANSLITERATIONS: Record<string, string> = {
	ä: "ae",
	ö: "oe",
	ü: "ue",
	Ä: "Ae",
	Ö: "Oe",
	Ü: "Ue",
	ß: "ss",
	ẞ: "SS",
};

/**
 * The Accessor a name suggests: what the editor presets while a new Field's
 * Accessor still follows its name, and what blueprinthub presets for its
 * Blueprints, Text Types, Symbol Sets and TI Sets.
 *
 * German letters are transliterated (`ä→ae`, `ß→ss`), other accents stripped
 * through NFKD (`é→e`); then it lowercases, turns whitespace and `-` into
 * `_`, drops every other character outside `[a-z0-9_]`, collapses repeated
 * `_`, trims `_` and cuts to ACCESSOR_MAX_LENGTH.
 *
 * Returns `""` when nothing usable is left, or when the result would start
 * with a digit (an Accessor names a GraphQL type or field downstream, and a
 * GraphQL name cannot). The caller then leaves the Accessor empty for the
 * author to fill in rather than inventing one. A leading `_` is never
 * produced either: it is reserved (ADR-0022, `reserved_accessor`).
 *
 * A preset only: an Accessor already stored is never re-derived from it.
 */
export function accessorFromName(name: string): string {
	const accessor = name
		.replace(/[äöüÄÖÜßẞ]/g, (letter) => TRANSLITERATIONS[letter] ?? letter)
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^a-z0-9_]/g, "")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
		.slice(0, ACCESSOR_MAX_LENGTH)
		// The cut can land on a separator.
		.replace(/_$/, "");
	return /^[a-z]/.test(accessor) ? accessor : "";
}
