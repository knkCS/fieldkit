import { describe, expect, it } from "vitest";
import {
	choiceOptions,
	inOptionOrder,
	OPTION_KEY_PATTERN,
	optionKeyFromLabel,
} from "../choice-options";

describe("optionKeyFromLabel", () => {
	it.each([
		["Low", "low"],
		["Sehr groß", "sehr-gross"],
		["Über uns", "ueber-uns"],
		["Café crème", "cafe-creme"],
		["12 Monate", "12-monate"],
		["  -- Leading and trailing --  ", "leading-and-trailing"],
		["a / b & c", "a-b-c"],
		["snake_case stays", "snake_case-stays"],
		["_hidden", "hidden"],
		["€", ""],
		["", ""],
	])("%j suggests %j", (label, key) => {
		expect(optionKeyFromLabel(label)).toBe(key);
	});

	it("is cut to the pattern's 64 characters, never ending in a dash", () => {
		const key = optionKeyFromLabel(`${"a".repeat(63)} b`);
		expect(key).toBe("a".repeat(63));
		expect(optionKeyFromLabel("x".repeat(100))).toHaveLength(64);
	});

	it("always suggests a Key the pattern accepts, or none", () => {
		for (const label of ["Hello World", "ÄÖÜ", "---", "9 Leben", "ẞ", "x_-y"]) {
			const key = optionKeyFromLabel(label);
			if (key !== "") expect(key).toMatch(OPTION_KEY_PATTERN);
		}
	});
});

describe("choiceOptions", () => {
	it("reads the list leniently: entries without a string key are skipped", () => {
		expect(
			choiceOptions({
				options: [
					{ key: "a", label: "A" },
					"b",
					null,
					{ key: 3, label: "Three" },
					{ key: "c" },
				],
			}),
		).toEqual([
			{ key: "a", label: "A" },
			{ key: "c", label: "" },
		]);
	});

	it("holds none for the old key-to-label map, or no settings", () => {
		expect(choiceOptions({ options: { a: "A" } })).toEqual([]);
		expect(choiceOptions(null)).toEqual([]);
		expect(choiceOptions(undefined)).toEqual([]);
	});
});

describe("inOptionOrder", () => {
	it("orders keys by the options, unknown keys last in the value's order", () => {
		const options = [
			{ key: "12", label: "Dec" },
			{ key: "1", label: "Jan" },
		];
		expect(inOptionOrder(options, ["x", "1", 5, "y", "12"])).toEqual([
			"12",
			"1",
			"x",
			"y",
		]);
	});
});
