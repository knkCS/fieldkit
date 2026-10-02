import { describe, expect, it } from "vitest";
import { publishingFieldTypes } from "../../publishing";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import {
	applicableValidations,
	inapplicableValidations,
	offeredValidations,
} from "../validations";

function plugin(id: string): FieldTypePlugin {
	const found = builtInFieldTypes.find((p) => p.id === id);
	if (!found) throw new Error(`no built-in ${id}`);
	return found;
}

function field(type: string, extra: Partial<Field> = {}): Field {
	return {
		field_type: type,
		config: {
			name: "F",
			api_accessor: "f",
			required: false,
			instructions: "",
		},
		system: false,
		...extra,
	};
}

describe("applicableValidations", () => {
	it("lists what each built-in type honours, and nothing elsewhere", () => {
		const honouring = Object.fromEntries(
			[...builtInFieldTypes, ...publishingFieldTypes]
				.map((p) => [p.id, applicableValidations(p)] as const)
				.filter(([, keys]) => keys.length > 0),
		);
		expect(honouring).toEqual({
			text: ["min_length", "max_length", "pattern", "unique"],
			textarea: ["min_length", "max_length"],
			code: ["min_length", "max_length"],
			markdown: ["min_length", "max_length"],
			email: ["unique"],
			url: ["unique"],
			slug: ["unique"],
			number: ["unique"],
		});
	});

	it("offers every validation on a plugin with no Catalogue facts", () => {
		const custom = { ...plugin("date"), catalogue: undefined };
		expect(applicableValidations(custom)).toHaveLength(4);
		expect(
			inapplicableValidations(
				field("x", { validation: { min_length: 1 } }),
				custom,
			),
		).toEqual([]);
	});
});

describe("inapplicableValidations", () => {
	it("reports each validation a type does not honour, at its key", () => {
		const date = field("date", {
			validation: {
				min_length: 0,
				max_length: 3,
				pattern: "x",
				pattern_message: "y",
			},
			config: { ...field("date").config, unique: true },
		});
		expect(
			inapplicableValidations(date, plugin("date")).map((v) =>
				v.segments.join("/"),
			),
		).toEqual([
			"validation/min_length",
			"validation/max_length",
			"validation/pattern",
			"validation/pattern_message",
			"config/unique",
		]);
	});

	it("reads Unset validation and unique: false as no declaration (ADR-0021)", () => {
		const date = field("date", {
			validation: {
				min_length: null as unknown as number,
				pattern: "",
				pattern_message: "",
			},
			config: { ...field("date").config, unique: false },
		});
		expect(inapplicableValidations(date, plugin("date"))).toEqual([]);
	});

	it("is what validateSpec reports as inapplicable_validation", () => {
		const spec = [field("number", { validation: { max_length: 4 } })];
		expect(
			validateSpec(
				spec,
				new Map(builtInFieldTypes.map((p) => [p.id, p])),
			).fieldErrors.map((e) => [e.path, e.code]),
		).toEqual([["/f/validation/max_length", "inapplicable_validation"]]);
	});
});

describe("offeredValidations", () => {
	it("offers pattern_message with pattern, and what a Field declares besides", () => {
		expect([...offeredValidations(field("text"), plugin("text"))]).toEqual([
			"min_length",
			"max_length",
			"pattern",
			"unique",
			"pattern_message",
		]);
		expect([
			...offeredValidations(
				field("date", { validation: { pattern_message: "m" } }),
				plugin("date"),
			),
		]).toEqual(["pattern_message"]);
		expect(offeredValidations(field("date"), plugin("date")).size).toBe(0);
	});
});
