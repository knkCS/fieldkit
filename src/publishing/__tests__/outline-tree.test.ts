import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { resolveSpec, specPins } from "../../schema/resolve-spec";
import { mintMissingIds } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { validateValue } from "../../schema/validate-value";
import { outlineTreePlugin, publishingFieldTypes } from "..";

function field(
	field_type: string,
	accessor: string,
	extra: Partial<Field> = {},
	required = false,
): Field {
	return {
		field_type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		system: false,
		...extra,
	} as Field;
}

const plugins: Map<string, FieldTypePlugin> = new Map(
	[...builtInFieldTypes, ...publishingFieldTypes].map((p) => [p.id, p]),
);

function codes(errors: { path: string; code: string }[]) {
	return errors
		.map(({ path, code }) => ({ path, code }))
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** An outline_tree whose Blueprint Release is resolved: a kind select and a
 * required title. */
const outline = field("outline_tree", "outline", {
	settings: { blueprint: "outline-bp@1", text_type: "tt@1" },
	children: [
		field("select", "kind", {
			settings: {
				options: { part: "Part", chapter: "Chapter" },
			},
		}),
		field("text", "title", {}, true),
	],
});

describe("outline_tree settings", () => {
	it("pins a Blueprint Release and a Text Type Release", () => {
		expect(specPins([outline], plugins)).toEqual([
			{
				path: "/outline/settings/blueprint",
				kind: "blueprint",
				release: "outline-bp@1",
			},
			{
				path: "/outline/settings/text_type",
				kind: "text_type",
				release: "tt@1",
			},
		]);
	});

	it("refuses core's legacy keys", () => {
		const legacy = field("outline_tree", "outline", {
			settings: { text_type_id: "tt", levels: [{ key: "part" }] },
		});
		expect(codes(validateSpec([legacy], plugins).fieldErrors)).toEqual([
			{ path: "/outline/settings/levels", code: "unknown_setting" },
			{ path: "/outline/settings/text_type_id", code: "unknown_setting" },
		]);
	});

	it("sits at the root only, and its node Fields sit as a Reference Spec's", () => {
		const spec = [
			field("virtual_table", "vt", {
				children: [field("outline_tree", "nested", { settings: {} })],
			}),
			field("outline_tree", "outline", {
				settings: {},
				children: [field("text", "title"), field("group", "box")],
			}),
		];
		expect(codes(validateSpec(spec, plugins).fieldErrors)).toEqual([
			{ path: "/outline/children/box", code: "position" },
			{ path: "/vt/children/nested", code: "position" },
		]);
	});
});

describe("outline_tree Resolve", () => {
	it("inlines the pinned Blueprint Release as its children and stores the Text Type once", async () => {
		const authored = field("outline_tree", "outline", {
			settings: { blueprint: "outline-bp@1", text_type: "tt@1" },
		});
		const resolved = await resolveSpec(
			[authored],
			{
				blueprint: {
					getSchema: async (id) => {
						expect(id).toBe("outline-bp@1");
						return [field("text", "title")];
					},
				},
				parts: { text_type: async () => ({ minimumVocabularyVersion: null }) },
			},
			{ plugins },
		);
		expect(resolved.fields[0].children).toEqual([field("text", "title")]);
		expect(resolved.parts).toEqual({
			text_type: { "tt@1": { minimumVocabularyVersion: null } },
		});
	});
});

describe("outline_tree values", () => {
	const check = (data: unknown) =>
		codes(validateValue([outline], data, plugins));

	it("accepts a tree of nodes, each with its values", () => {
		expect(
			check({
				outline: [
					{
						_id: "n1",
						values: { kind: "part", title: "One" },
						children: [
							{ _id: "n2", values: { kind: "chapter", title: "One.One" } },
						],
					},
					{ _id: "n3", values: { title: "Two" } },
				],
			}),
		).toEqual([]);
	});

	it("checks each node's values against the Blueprint's Fields", () => {
		expect(
			check({
				outline: [
					{
						_id: "n1",
						values: { kind: 5, title: "One" },
						children: [{ _id: "n2" }, { _id: "n3", values: { title: 3 } }],
					},
				],
			}),
		).toEqual([
			{ path: "/outline/n1/children/n2/values/title", code: "required" },
			{ path: "/outline/n1/children/n3/values/title", code: "invalid_type" },
			{ path: "/outline/n1/values/kind", code: "invalid_type" },
		]);
	});

	it("holds every node to an _id unique across the whole tree", () => {
		expect(
			check({
				outline: [
					{
						_id: "n1",
						values: { title: "a" },
						children: [{ _id: "n1", values: { title: "b" } }],
					},
					{ values: { title: "c" } },
					{ _id: 7, values: { title: "d" } },
				],
			}),
		).toEqual([
			{ path: "/outline/1", code: "missing_id" },
			{ path: "/outline/2/_id", code: "invalid_type" },
			{ path: "/outline/n1/children/n1", code: "duplicate_id" },
		]);
	});

	it("refuses a value of the wrong shape", () => {
		expect(
			check({
				outline: ["n1", { _id: "n2", values: ["x"], children: { _id: "n3" } }],
			}),
		).toEqual([
			{ path: "/outline/0", code: "invalid_type" },
			{ path: "/outline/n2/children", code: "invalid_type" },
			{ path: "/outline/n2/values", code: "invalid_type" },
		]);
		expect(check({ outline: { _id: "n1" } })).toEqual([
			{ path: "/outline", code: "invalid_type" },
		]);
	});

	it("reads an unresolved outline's values as an opaque record", () => {
		const unresolved = field("outline_tree", "outline", {
			settings: { blueprint: "outline-bp@1" },
		});
		expect(
			validateValue(
				[unresolved],
				{ outline: [{ _id: "n1", values: { anything: 1 } }] },
				plugins,
			),
		).toEqual([]);
	});
});

describe("outline_tree ids", () => {
	it("mints an _id for every node that needs one, at every level", () => {
		const minted = mintMissingIds(
			[outline],
			{
				outline: [
					{ _id: "n1", values: { title: "a" }, children: [{ values: {} }] },
					{ _id: "n1" },
				],
			},
			plugins,
		) as { outline: { _id: string; children?: { _id: string }[] }[] };
		const [first, second] = minted.outline;
		expect(first._id).toBe("n1");
		expect(first.children?.[0]._id).toEqual(expect.any(String));
		expect(second._id).not.toBe("n1");
		expect(outlineTreePlugin.defaultValue?.(outline)).toEqual([]);
	});
});
