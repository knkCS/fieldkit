import { describe, expect, it } from "vitest";
import type { SpecTab } from "../../../schema/partition";
import type { Field } from "../../../schema/types";
import { buildSearchIndex, searchFields } from "../search-index";

function makeField(accessor: string, name = accessor, hidden = false): Field {
	return {
		field_type: "text",
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
			hidden,
		},
		settings: null,
		system: false,
	};
}

const tabs: SpecTab[] = [
	{ section: null, fields: [makeField("title", "Title")] },
	{
		section: {
			field_type: "section",
			config: {
				name: "SEO",
				api_accessor: "seo",
				required: false,
				instructions: "",
			},
			settings: {},
			system: false,
		},
		fields: [
			makeField("meta_description", "Meta description"),
			makeField("secret", "Secret", true),
		],
	},
];

describe("buildSearchIndex", () => {
	it("indexes fields with their tab label and index", () => {
		const index = buildSearchIndex(tabs, "General");
		expect(index).toEqual([
			{ accessor: "title", label: "Title", tabIndex: 0, tabLabel: "General" },
			{
				accessor: "meta_description",
				label: "Meta description",
				tabIndex: 1,
				tabLabel: "SEO",
			},
		]);
	});

	it("excludes hidden fields", () => {
		const index = buildSearchIndex(tabs, "General");
		expect(index.find((r) => r.accessor === "secret")).toBeUndefined();
	});

	it("includes hidden fields when includeHidden is true", () => {
		const index = buildSearchIndex(tabs, "General", { includeHidden: true });
		expect(index.find((r) => r.accessor === "secret")).toEqual({
			accessor: "secret",
			label: "Secret",
			tabIndex: 1,
			tabLabel: "SEO",
		});
	});
});

describe("searchFields", () => {
	const index = buildSearchIndex(tabs, "General");

	it("matches label case-insensitively by substring", () => {
		expect(searchFields(index, "meta").map((r) => r.accessor)).toEqual([
			"meta_description",
		]);
	});

	it("matches api_accessor", () => {
		expect(searchFields(index, "_desc").map((r) => r.accessor)).toEqual([
			"meta_description",
		]);
	});

	it("returns nothing for an empty or whitespace query", () => {
		expect(searchFields(index, "")).toEqual([]);
		expect(searchFields(index, "  ")).toEqual([]);
	});

	it("returns empty for no matches", () => {
		expect(searchFields(index, "zzz")).toEqual([]);
	});
});
