import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { resolveSpec, specPins } from "../../schema/resolve-spec";
import { mintMissingIds } from "../../schema/row-ids";
import type { Field } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { validateValue } from "../../schema/validate-value";
import { publishingFieldTypes, TI_SET_KIND, tiOverlayPlugin } from "..";

function overlay(
	settings: Record<string, unknown> = { ti_set: "tis-1" },
): Field {
	return {
		field_type: "ti_overlay",
		config: {
			name: "TI",
			api_accessor: "ti",
			required: false,
			instructions: "",
		},
		settings,
		system: false,
	} as Field;
}

const plugins = new Map<string, FieldTypePlugin>(
	[...builtInFieldTypes, ...publishingFieldTypes].map((p) => [p.id, p]),
);

const entry = {
	_id: "e1",
	anchor: { node: "12", offset: 3, before: "abc", after: "def" },
	command: "np",
	params: { lines: "2" },
	source: "editor",
	notes: "keep",
};

function errorsOf(value: unknown) {
	return validateValue([overlay()], { ti: value }, plugins).map(
		({ path, code }) => ({ path, code }),
	);
}

describe("ti_overlay", () => {
	it("is a publishing type at the root only", () => {
		expect(publishingFieldTypes).toContain(tiOverlayPlugin);
		expect(tiOverlayPlugin.positions).toEqual(["root"]);
		const inGroup = {
			field_type: "group",
			config: {
				name: "G",
				api_accessor: "g",
				required: false,
				instructions: "",
			},
			children: [overlay()],
			system: false,
		} as Field;
		expect(
			validateSpec([overlay(), inGroup], plugins).fieldErrors.map(
				(e) => e.code,
			),
		).toEqual([]);
		expect(
			validateSpec(
				[overlay({ ti_set: "x", label: "y" })],
				plugins,
			).fieldErrors.map(({ path, code }) => ({ path, code })),
		).toEqual([{ path: "/ti/settings/label", code: "unknown_setting" }]);
	});

	it("accepts the flattened entries", () => {
		expect(errorsOf({ entries: [entry] })).toEqual([]);
		// An anchor at a block's start has nothing before it: Unset, absent.
		const { before: _, ...atStart } = entry.anchor;
		expect(
			errorsOf({ entries: [{ ...entry, anchor: { ...atStart, offset: 0 } }] }),
		).toEqual([]);
	});

	it("rejects core's removed keys", () => {
		expect(
			errorsOf({ entries: [entry], published: { label: "x" }, drafts: [1] }),
		).toEqual([{ path: "/ti", code: "invalid_value" }]);
		expect(errorsOf({ entries: [{ ...entry, status: "active" }] })).toEqual([
			{ path: "/ti/entries/e1", code: "invalid_value" },
		]);
		expect(errorsOf({ published: { label: "x", entries: [entry] } })).toEqual(
			expect.arrayContaining([
				{ path: "/ti/entries", code: "required" },
				{ path: "/ti", code: "invalid_value" },
			]),
		);
	});

	it("validates the anchor in knkeditor's shape", () => {
		const long = "𝄞".repeat(20);
		expect(
			errorsOf({
				entries: [{ ...entry, anchor: { ...entry.anchor, before: long } }],
			}),
		).toEqual([]);
		expect(
			errorsOf({
				entries: [{ ...entry, anchor: { ...entry.anchor, after: `${long}x` } }],
			}),
		).toEqual([{ path: "/ti/entries/e1/anchor/after", code: "too_big" }]);
		expect(
			errorsOf({
				entries: [
					{
						...entry,
						anchor: { blockId: "b", charOffsetInBlock: 1, fingerprint: {} },
					},
				],
			}),
		).toEqual(
			expect.arrayContaining([
				{ path: "/ti/entries/e1/anchor", code: "invalid_value" },
				{ path: "/ti/entries/e1/anchor/node", code: "required" },
				{ path: "/ti/entries/e1/anchor/offset", code: "required" },
			]),
		);
		expect(
			errorsOf({
				entries: [{ ...entry, anchor: { ...entry.anchor, offset: 1.5 } }],
			}),
		).toEqual([{ path: "/ti/entries/e1/anchor/offset", code: "invalid_type" }]);
		expect(
			errorsOf({
				entries: [{ ...entry, anchor: { ...entry.anchor, offset: -1 } }],
			}),
		).toEqual([{ path: "/ti/entries/e1/anchor/offset", code: "too_small" }]);
	});

	it("checks each entry's rows, source and params", () => {
		const { _id: _, ...noId } = entry;
		expect(errorsOf({ entries: [noId, entry, entry] })).toEqual([
			{ path: "/ti/entries/0", code: "missing_id" },
			{ path: "/ti/entries/2", code: "duplicate_id" },
		]);
		expect(errorsOf({ entries: [{ ...entry, source: "import" }] })).toEqual([
			{ path: "/ti/entries/e1/source", code: "invalid_value" },
		]);
		expect(errorsOf({ entries: [{ ...entry, params: { lines: 2 } }] })).toEqual(
			[{ path: "/ti/entries/e1/params/lines", code: "invalid_type" }],
		);
	});

	it("mints an _id into each entry", () => {
		const { _id: _, ...noId } = entry;
		const data = mintMissingIds(
			[overlay()],
			{ ti: { entries: [noId, entry] } },
			plugins,
		);
		const entries = (data.ti as { entries: { _id: string }[] }).entries;
		expect(typeof entries[0]._id).toBe("string");
		expect(entries[1]._id).toBe("e1");
	});

	it("pins a TI Set, resolved into parts", async () => {
		expect(specPins([overlay()], plugins)).toEqual([
			{ path: "/ti/settings/ti_set", kind: TI_SET_KIND, release: "tis-1" },
		]);
		const set = { instructions: [{ code: "np" }] };
		const resolved = await resolveSpec(
			[
				overlay(),
				{ ...overlay(), config: { ...overlay().config, api_accessor: "ti2" } },
			],
			{ parts: { [TI_SET_KIND]: async () => set } },
			{ plugins },
		);
		expect(resolved.parts).toEqual({ ti_set: { "tis-1": set } });
	});
});
