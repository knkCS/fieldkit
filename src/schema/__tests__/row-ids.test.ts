// Row `_id`s (ADR-0023): minting, normalising, copying, and the `_id` paths.
// What both languages answer alike about a stored value is in the shared
// fixtures (conformance/unreleased/validate-value/); these are the TS-only
// surface and the cases a fixture cannot hold.
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import {
	copyRows,
	isRowId,
	mintId,
	mintMissingIds,
	ROW_ID_MAX_LENGTH,
	toIdPath,
} from "../row-ids";
import type { Field } from "../types";
import { VALUE_CAPS, validateValue } from "../validate-value";
import { getDefaultValues, specToZodSchema } from "../zod-builder";

function field(
	field_type: string,
	api_accessor: string,
	extra: Partial<Field> = {},
): Field {
	return {
		field_type,
		config: {
			name: api_accessor,
			api_accessor,
			required: false,
			instructions: "",
		},
		system: false,
		...extra,
	};
}

const text = (accessor: string, required = false): Field => ({
	...field("text", accessor),
	config: { ...field("text", accessor).config, required },
});

const authors = field("group", "authors", { children: [text("name", true)] });

const blocks = field("blocks", "content", {
	settings: {
		allowed_blocks: [
			{ type: "heading", name: "Heading", fields: [text("title", true)] },
			{
				type: "gallery",
				name: "Gallery",
				fields: [field("group", "images", { children: [text("src")] })],
			},
		],
	},
});

describe("mintId", () => {
	it("mints distinct, well-formed ids", () => {
		const ids = new Set(Array.from({ length: 100 }, mintId));
		expect(ids.size).toBe(100);
		for (const id of ids) expect(isRowId(id)).toBe(true);
	});

	it("falls back to getRandomValues where randomUUID is missing", () => {
		const original = globalThis.crypto.randomUUID;
		Object.defineProperty(globalThis.crypto, "randomUUID", {
			value: undefined,
			configurable: true,
		});
		try {
			expect(mintId()).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		} finally {
			Object.defineProperty(globalThis.crypto, "randomUUID", {
				value: original,
				configurable: true,
			});
		}
	});
});

describe("isRowId", () => {
	it("takes a non-empty string of at most 64 characters", () => {
		expect(isRowId("a")).toBe(true);
		expect(isRowId("x".repeat(ROW_ID_MAX_LENGTH))).toBe(true);
		expect(isRowId("x".repeat(ROW_ID_MAX_LENGTH + 1))).toBe(false);
		expect(isRowId("")).toBe(false);
		expect(isRowId(7)).toBe(false);
	});
});

describe("mintMissingIds", () => {
	it("mints an id into each row missing one, malformed or repeated", () => {
		const data = {
			authors: [
				{ name: "Ada" },
				{ _id: "keep", name: "Grace" },
				{ _id: "keep", name: "Edsger" },
				{ _id: 7, name: "Barbara" },
			],
		};
		const minted = mintMissingIds([authors], data, builtInFieldTypes);
		const rows = minted.authors as Record<string, unknown>[];
		expect(rows[1]).toEqual({ _id: "keep", name: "Grace" });
		const ids = rows.map((row) => row._id);
		expect(new Set(ids).size).toBe(4);
		for (const id of ids) expect(isRowId(id)).toBe(true);
		expect(rows.map((row) => row.name)).toEqual([
			"Ada",
			"Grace",
			"Edsger",
			"Barbara",
		]);
		// The input is not mutated.
		expect(data.authors[0]).toEqual({ name: "Ada" });
	});

	it("returns the same object when every row already has an id", () => {
		const data = { authors: [{ _id: "a", name: "Ada" }], other: 1 };
		expect(mintMissingIds([authors], data, builtInFieldTypes)).toBe(data);
	});

	it("mints into Blocks, keeping _type, and into a Block Type's own rows", () => {
		const data = {
			content: [
				{ _type: "heading", title: "One" },
				{ _type: "gallery", images: [{ src: "a.png" }] },
			],
		};
		const minted = mintMissingIds([blocks], data, builtInFieldTypes);
		const [heading, gallery] = minted.content as Record<string, unknown>[];
		expect(heading._type).toBe("heading");
		expect(isRowId(heading._id)).toBe(true);
		expect(isRowId(gallery._id)).toBe(true);
		const [image] = gallery.images as Record<string, unknown>[];
		expect(isRowId(image._id)).toBe(true);
	});

	it("mints into rows a resolved Fieldset embeds", () => {
		const fieldset = field("fieldset", "address", { children: [authors] });
		const minted = mintMissingIds(
			[fieldset],
			{ address: { authors: [{ name: "Ada" }] } },
			builtInFieldTypes,
		);
		const address = minted.address as { authors: Record<string, unknown>[] };
		expect(isRowId(address.authors[0]._id)).toBe(true);
	});

	it("mints into a Virtual Table's rows", () => {
		const table = field("virtual_table", "lines", {
			children: [text("sku")],
		});
		const minted = mintMissingIds(
			[table],
			{ lines: [{ sku: "A" }] },
			builtInFieldTypes,
		);
		expect(isRowId((minted.lines as Record<string, unknown>[])[0]._id)).toBe(
			true,
		);
	});

	it("leaves values it cannot read for validation to report", () => {
		const data = { authors: "not rows" };
		expect(mintMissingIds([authors], data, builtInFieldTypes)).toBe(data);
	});
});

describe("copyRows", () => {
	it("gives a copied row, and every row nested in it, a new id", () => {
		const gallery = {
			_id: "g1",
			_type: "gallery",
			images: [{ _id: "i1", src: "a.png" }],
		};
		const [copy] = copyRows(blocks, [gallery], builtInFieldTypes) as Record<
			string,
			unknown
		>[];
		expect(copy._id).not.toBe("g1");
		expect(isRowId(copy._id)).toBe(true);
		const [image] = copy.images as Record<string, unknown>[];
		expect(image._id).not.toBe("i1");
		expect(image.src).toBe("a.png");
		// The original keeps its ids.
		expect(gallery.images[0]._id).toBe("i1");
	});

	it("gives each of several pasted copies of one row its own id", () => {
		const row = { _id: "a", name: "Ada" };
		const copies = copyRows(
			authors,
			[row, row, row],
			builtInFieldTypes,
		) as Record<string, unknown>[];
		const ids = new Set([row._id, ...copies.map((copy) => copy._id)]);
		expect(ids.size).toBe(4);
	});
});

describe("getDefaultValues", () => {
	it("mints ids into rows a default_value holds, afresh on every call", () => {
		const seeded = field("group", "authors", {
			children: [text("name")],
			config: {
				...authors.config,
				default_value: [{ name: "Ada" }],
			},
		});
		const first = getDefaultValues([seeded], builtInFieldTypes)
			.authors as Record<string, unknown>[];
		const second = getDefaultValues([seeded], builtInFieldTypes)
			.authors as Record<string, unknown>[];
		expect(isRowId(first[0]._id)).toBe(true);
		expect(first[0]._id).not.toBe(second[0]._id);
		// The Spec's default_value is not written to.
		expect(seeded.config.default_value).toEqual([{ name: "Ada" }]);
	});
});

describe("the form's Zod type requires _id", () => {
	const schema = specToZodSchema([authors], builtInFieldTypes);

	it("refuses a row without an _id", () => {
		const parsed = schema.safeParse({ authors: [{ name: "Ada" }] });
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0].path).toEqual(["authors", 0, "_id"]);
	});

	it("refuses a repeated _id, beside the rows' other errors", () => {
		const parsed = schema.safeParse({
			authors: [
				{ _id: "a", name: "Ada" },
				{ _id: "a", name: "" },
			],
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues.map((issue) => issue.path)).toEqual(
			expect.arrayContaining([
				["authors", 1],
				["authors", 1, "name"],
			]),
		);
	});

	it("refuses a repeat even when every row is otherwise valid", () => {
		expect(
			schema.safeParse({
				authors: [
					{ _id: "a", name: "Ada" },
					{ _id: "a", name: "Grace" },
				],
			}).success,
		).toBe(false);
	});

	it("keeps _id in what it parses", () => {
		expect(
			schema.safeParse({ authors: [{ _id: "a", name: "Ada" }] }).data,
		).toEqual({ authors: [{ _id: "a", name: "Ada" }] });
	});
});

describe("toIdPath", () => {
	it("addresses a row by its _id, and an item without one by its index", () => {
		const data = {
			authors: [{ _id: "a/b" }, { name: "x" }, { _id: "a/b" }],
			tags: ["x"],
		};
		expect(toIdPath(data, ["authors", 0, "name"])).toBe("/authors/a~1b/name");
		expect(toIdPath(data, ["authors", 1, "name"])).toBe("/authors/1/name");
		// A repeat has its place, not the id it repeats.
		expect(toIdPath(data, ["authors", 2])).toBe("/authors/2");
		expect(toIdPath(data, ["tags", 0])).toBe("/tags/0");
		expect(toIdPath(data, [])).toBe("");
	});
});

describe("validateValue — rows", () => {
	it("reports errors inside rows at _id paths, at any depth", () => {
		const data = {
			content: [
				{
					_id: "g",
					_type: "gallery",
					images: [{ _id: "i", src: 5 }],
				},
			],
		};
		expect(validateValue([blocks], data, builtInFieldTypes)).toEqual([
			{ path: "/content/g/images/i/src", code: "invalid_type" },
		]);
	});

	it("reports a missing _id at the row, and a repeat at the repeat", () => {
		expect(
			validateValue(
				[authors],
				{
					authors: [{ name: "Ada" }, { _id: "a", name: "Grace" }, { _id: "a" }],
				},
				builtInFieldTypes,
			),
		).toEqual(
			expect.arrayContaining([
				{ path: "/authors/0", code: "missing_id" },
				{ path: "/authors/2", code: "duplicate_id" },
				{ path: "/authors/2/name", code: "required" },
			]),
		);
	});

	it("reports an array nested beyond maxDepth as too_deep, and nothing inside", () => {
		let deep: unknown = ["x"];
		for (let i = 0; i < VALUE_CAPS.maxDepth; i++) deep = [deep];
		const errors = validateValue(
			[field("checkboxes", "tags")],
			{ tags: deep },
			builtInFieldTypes,
		);
		expect(errors).toEqual([
			{
				path: `/tags${"/0".repeat(VALUE_CAPS.maxDepth)}`,
				code: "too_deep",
				params: { maximum: VALUE_CAPS.maxDepth },
			},
		]);
	});
});
