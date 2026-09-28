// src/schema/__tests__/validate-spec-positions.test.ts
//
// ADR-0022 in validateSpec: Positions for every container, a caller's policy,
// and `config.search`. The shared conformance fixtures
// (`conformance/unreleased/validate-spec/{positions,reserved-accessors,
// card-layout,search}.json`) hold TS and Go to the same answers; these cover
// what a fixture cannot — the hooks and the types outside the Catalogue.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { type SpecPolicy, validateSpec } from "../validate-spec";

function field(
	fieldType: string,
	accessor: string,
	extra: Partial<Field> = {},
): Field {
	return {
		field_type: fieldType,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		system: false,
		...extra,
	};
}

function mockPlugin(
	id: string,
	extra: Partial<FieldTypePlugin> = {},
): FieldTypePlugin {
	return {
		id,
		name: id,
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => null as never,
		...extra,
	};
}

const builtIns = new Map<string, FieldTypePlugin>(
	builtInFieldTypes.map((plugin) => [plugin.id, plugin]),
);

function localizable(accessor: string): Field {
	const f = field("text", accessor);
	return { ...f, config: { ...f.config, localizable: true } };
}

/** The kind of policy a service brings; fieldkit ships none. */
const rejectLocalizable: SpecPolicy = (f) =>
	f.config.localizable
		? [
				{
					code: "localizable_not_allowed",
					message: "Content Blueprints are not localizable",
					path: "/config/localizable",
				},
			]
		: [];

describe("validateSpec — a caller's policy", () => {
	const spec: Field[] = [
		localizable("title"),
		field("text", "plain"),
		field("group", "meta", { children: [localizable("note")] }),
		field("blocks", "content", {
			settings: {
				allowed_blocks: [
					{ type: "hero", name: "Hero", fields: [localizable("headline")] },
				],
			},
		}),
	];

	it("adds nothing when there is none", () => {
		expect(validateSpec(spec, builtIns).fieldErrors).toEqual([]);
	});

	it("adds its errors at every depth, relative to the Field", () => {
		const result = validateSpec(spec, builtIns, { policy: rejectLocalizable });
		expect(result.valid).toBe(false);
		expect(result.fieldErrors.map((e) => [e.path, e.code])).toEqual([
			["/title/config/localizable", "localizable_not_allowed"],
			["/meta/children/note/config/localizable", "localizable_not_allowed"],
			[
				"/content/settings/allowed_blocks/0/fields/headline/config/localizable",
				"localizable_not_allowed",
			],
		]);
		expect(result.errors).toContain("Content Blueprints are not localizable");
	});

	it("is told where each Field sits", () => {
		const seen: [string, string][] = [];
		validateSpec(
			[
				field("virtual_table", "rows", { children: [field("text", "label")] }),
				field("reference", "credits", {
					settings: { spec: [field("number", "page")] },
				}),
				spec[3],
			],
			builtIns,
			{
				policy: (_f, at) => {
					seen.push([at.path, at.position]);
					return [];
				},
			},
		);
		expect(seen).toEqual([
			["/rows", "root"],
			["/rows/children/label", "row"],
			["/credits", "root"],
			["/credits/settings/spec/page", "reference_spec"],
			["/content", "root"],
			["/content/settings/allowed_blocks/0/fields/headline", "block_type"],
		]);
	});
});

describe("validateSpec — a plugin that declares no Positions", () => {
	it("is kept out of a Row Spec until it declares row", () => {
		const plugins = new Map(builtIns);
		plugins.set("rating", mockPlugin("rating"));
		const table = field("virtual_table", "rows", {
			children: [field("rating", "stars")],
		});
		expect(
			validateSpec([field("rating", "top"), table], plugins).fieldErrors.map(
				(e) => [e.path, e.code],
			),
		).toEqual([["/rows/children/stars", "position"]]);

		plugins.set("rating", mockPlugin("rating", { positions: ["root", "row"] }));
		expect(validateSpec([table], plugins).fieldErrors).toEqual([]);
	});
});

describe("validateSpec — config.search on a type outside the Catalogue", () => {
	it("is search_without_text until the type's Catalogue facts say it has text", () => {
		// A type with no Catalogue entry has no text as far as TS and Go agree,
		// so it may not carry `search` — as rich_text could not before its
		// entry (#216).
		const plugins = new Map(builtIns);
		plugins.set("prose", mockPlugin("prose"));
		const body = field("prose", "body");
		body.config.search = "A";
		expect(
			validateSpec([body], plugins).fieldErrors.map((e) => [e.path, e.code]),
		).toEqual([["/body/config/search", "search_without_text"]]);

		// rich_text's entry says it has text.
		const prose = field("rich_text", "prose");
		prose.config.search = "A";
		expect(validateSpec([prose], builtIns).fieldErrors).toEqual([]);
	});
});
