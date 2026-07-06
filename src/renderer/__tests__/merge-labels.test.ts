import { describe, expect, it } from "vitest";
import { formatCount, mergeLabels } from "../merge-labels";

interface Labels {
	a?: string;
	b?: string;
}
const DEFAULTS: Required<Labels> = { a: "default-a", b: "default-b" };

describe("mergeLabels", () => {
	it("returns the defaults when overrides are absent", () => {
		expect(mergeLabels(DEFAULTS, undefined)).toEqual(DEFAULTS);
	});

	it("lets defined overrides win", () => {
		expect(mergeLabels(DEFAULTS, { a: "x" })).toEqual({
			a: "x",
			b: "default-b",
		});
	});

	it("ignores explicit-undefined keys instead of clobbering defaults", () => {
		expect(mergeLabels(DEFAULTS, { a: undefined, b: "y" })).toEqual({
			a: "default-a",
			b: "y",
		});
	});

	it("does not mutate the defaults object", () => {
		const before = { ...DEFAULTS };
		mergeLabels(DEFAULTS, { a: "x" });
		expect(DEFAULTS).toEqual(before);
	});
});

describe("formatCount", () => {
	it("uses the singular form at exactly 1", () => {
		expect(formatCount("1 invalid field", "{count} invalid fields", 1)).toBe(
			"1 invalid field",
		);
	});

	it("interpolates the plural form otherwise", () => {
		expect(formatCount("1 invalid field", "{count} invalid fields", 2)).toBe(
			"2 invalid fields",
		);
		expect(formatCount("1 invalid field", "{count} invalid fields", 0)).toBe(
			"0 invalid fields",
		);
	});
});
