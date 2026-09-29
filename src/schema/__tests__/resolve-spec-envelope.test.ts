// src/schema/__tests__/resolve-spec-envelope.test.ts
// ADR-0020: the Resolved Spec envelope, Pins read from the Catalogue, opaque
// parts, the Specs held in settings, and the caps.
import { describe, expect, it, vi } from "vitest";
import { CATALOGUE_VERSION } from "../catalogue-version";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import {
	RESOLVE_CAPS,
	ResolveSpecError,
	resolveSpec,
	specNeedsResolution,
	specPins,
} from "../resolve-spec";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import { specToZodSchema } from "../zod-builder";

function textField(name: string, accessor: string): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

function fieldset(accessor: string, release: string): Field {
	return {
		...textField(accessor, accessor),
		field_type: "fieldset",
		settings: { blueprint: release },
	};
}

function blueprintAdapter(releases: Record<string, Field[]>) {
	return {
		getSchema: vi.fn(async (id: string) => {
			const fields = releases[id];
			if (!fields) throw new Error(`No such release: ${id}`);
			return fields;
		}),
		getData: vi.fn(),
	};
}

const builtIns = new Map(builtInFieldTypes.map((p) => [p.id, p]));

describe("resolveSpec — the Resolved Spec envelope", () => {
	it("records the Catalogue version, an empty vocabulary and no parts", async () => {
		const blueprint = blueprintAdapter({
			"address@1": [textField("Street", "street")],
		});

		const resolved = await resolveSpec([fieldset("address", "address@1")], {
			blueprint,
		});

		expect(resolved.catalogue).toBe(CATALOGUE_VERSION);
		expect(resolved.vocabulary).toBe("");
		expect(resolved.parts).toEqual({});
		// The Field keeps its Pin.
		expect(resolved.fields[0].settings).toEqual({ blueprint: "address@1" });
		expect(resolved.fields[0].children).toEqual([
			textField("Street", "street"),
		]);
	});

	/** A type pinning an opaque part, as `rich_text.text_type` will (#216). */
	const prose = {
		...builtIns.get("text"),
		id: "prose",
		catalogue: {
			since: "0.18.0",
			hasText: true,
			pins: [{ key: "text_type", kind: "text_type" }],
		},
	} as FieldTypePlugin;
	const plugins = [...builtInFieldTypes, prose];
	const proseField = (accessor: string, textType: string): Field => ({
		...textField(accessor, accessor),
		field_type: "prose",
		settings: { text_type: textType },
	});

	it("stores an opaque part once in parts, however many Fields pin it", async () => {
		const fetchTextType = vi.fn(async (id: string) => ({ id, nodes: ["p"] }));
		const spec = [
			proseField("intro", "article@3"),
			proseField("body", "article@3"),
		];
		const adapters = { parts: { text_type: fetchTextType } };

		expect(specNeedsResolution(spec, adapters, plugins)).toBe(true);
		const resolved = await resolveSpec(spec, adapters, { plugins });

		expect(fetchTextType).toHaveBeenCalledTimes(1);
		expect(resolved.parts).toEqual({
			text_type: { "article@3": { id: "article@3", nodes: ["p"] } },
		});
		// Not inlined: the Fields are untouched.
		expect(resolved.fields).toBe(spec);
		expect(specPins(spec, plugins)).toEqual([
			{
				path: "/intro/settings/text_type",
				kind: "text_type",
				release: "article@3",
			},
			{
				path: "/body/settings/text_type",
				kind: "text_type",
				release: "article@3",
			},
		]);
	});

	it("leaves an opaque Pin unresolved when no fetcher serves its kind", async () => {
		const spec = [proseField("intro", "article@3")];

		expect(specNeedsResolution(spec, {}, plugins)).toBe(false);
		const resolved = await resolveSpec(spec, {}, { plugins });

		expect(resolved.parts).toEqual({});
	});

	it("reads which settings pin from the plugins' Catalogue entries", async () => {
		const blueprint = blueprintAdapter({ "x@1": [textField("A", "a")] });
		// The same Fieldset, in a plugin map where fieldset pins nothing.
		const unpinned = builtInFieldTypes.map((plugin) =>
			plugin.id === "fieldset" && plugin.catalogue
				? { ...plugin, catalogue: { ...plugin.catalogue, pins: [] } }
				: plugin,
		);

		const resolved = await resolveSpec(
			[fieldset("a", "x@1")],
			{ blueprint },
			{ plugins: unpinned },
		);

		expect(resolved.fields[0].children).toBeNull();
		expect(blueprint.getSchema).not.toHaveBeenCalled();
	});

	it("resolves a Fieldset among a Block Type's Fields, writing it back", async () => {
		const blueprint = blueprintAdapter({
			"address@1": [textField("Street", "street")],
		});
		const blocks: Field = {
			...textField("Content", "content"),
			field_type: "blocks",
			settings: {
				allowed_blocks: [
					{
						type: "contact",
						name: "Contact",
						fields: [fieldset("address", "address@1")],
					},
				],
			},
		};
		type BlockSettings = { allowed_blocks: { fields: Field[] }[] };

		expect(specPins([blocks])).toEqual([
			{
				path: "/content/settings/allowed_blocks/0/fields/address/settings/blueprint",
				kind: "blueprint",
				release: "address@1",
			},
		]);
		expect(specNeedsResolution([blocks], { blueprint })).toBe(true);
		const resolved = await resolveSpec([blocks], { blueprint });

		const settings = resolved.fields[0].settings as BlockSettings;
		expect(settings.allowed_blocks[0].fields[0].children).toEqual([
			textField("Street", "street"),
		]);
		// And the Blocks plugin composes it as any resolved Fieldset: its
		// Fields are validated.
		const zod = specToZodSchema(resolved.fields, builtInFieldTypes);
		const block = (street: unknown) => ({
			content: [{ _id: "b1", _type: "contact", address: { street } }],
		});
		expect(zod.safeParse(block("12 Bridge Lane")).success).toBe(true);
		expect(zod.safeParse(block(42)).success).toBe(false);
		// The authored Spec is not mutated.
		expect(
			(blocks.settings as BlockSettings).allowed_blocks[0].fields[0].children,
		).toBeNull();
	});

	it("refuses Pins nested deeper than the depth cap", async () => {
		const blueprint = blueprintAdapter({
			"a@1": [fieldset("b", "b@1")],
			"b@1": [fieldset("c", "c@1")],
			"c@1": [],
		});
		const spec = [fieldset("root", "a@1")];

		await expect(
			resolveSpec(spec, { blueprint }, { maxDepth: 3 }),
		).resolves.toBeDefined();
		await expect(
			resolveSpec(spec, { blueprint }, { maxDepth: 2 }),
		).rejects.toMatchObject({
			code: "resolve_too_deep",
			pin: { path: "/root/children/b/children/c/settings/blueprint" },
		});
	});

	it("refuses more distinct fetches than the cap, counting a repeat once", async () => {
		const releases = { "a@1": [], "b@1": [], "c@1": [] };
		const spec = [
			fieldset("a", "a@1"),
			fieldset("again", "a@1"),
			fieldset("b", "b@1"),
			fieldset("c", "c@1"),
		];

		await expect(
			resolveSpec(
				spec,
				{ blueprint: blueprintAdapter(releases) },
				{ maxFetches: 3 },
			),
		).resolves.toBeDefined();
		const error = await resolveSpec(
			spec,
			{ blueprint: blueprintAdapter(releases) },
			{ maxFetches: 2 },
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ResolveSpecError);
		expect((error as ResolveSpecError).code).toBe("resolve_too_many_fetches");
		expect(RESOLVE_CAPS).toEqual({ maxFetches: 256, maxDepth: 8 });
	});

	it("refuses a Blueprint Release that is not a list of Fields", async () => {
		const blueprint = {
			getSchema: vi.fn(async () => ({ not: "fields" }) as unknown as Field[]),
			getData: vi.fn(),
		};

		await expect(
			resolveSpec([fieldset("a", "x@1")], { blueprint }),
		).rejects.toMatchObject({ code: "resolve_invalid_release" });
	});
});

describe("validateSpec on a Resolved Spec", () => {
	it("checks a linked Row Spec's Positions, and reads the link as resolved", async () => {
		const blueprint = blueprintAdapter({
			"row@1": [
				textField("Sku", "sku"),
				{ ...textField("Nested", "nested"), field_type: "group" },
			],
		});
		const spec: Field[] = [
			{
				...textField("Lines", "lines"),
				field_type: "virtual_table",
				settings: { blueprint: "row@1" },
			},
		];

		expect(validateSpec(spec, builtIns).fieldErrors).toEqual([]);
		const resolved = await resolveSpec(spec, { blueprint });
		const errors = validateSpec(resolved.fields, builtIns, {
			resolved: true,
		}).fieldErrors;

		expect(errors.map(({ path, code }) => ({ path, code }))).toEqual([
			{ path: "/lines/children/nested", code: "invalid_position" },
		]);
	});
});
