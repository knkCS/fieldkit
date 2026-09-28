import { describe, expect, it } from "vitest";
import {
	type Catalogue,
	type CatalogueType,
	compareCatalogues,
} from "../lib/catalogue-compat";

function type(overrides: Partial<CatalogueType> = {}): CatalogueType {
	return {
		id: "text",
		since: "0.18.0",
		settings_schema: {
			type: "object",
			properties: {
				placeholder: { type: "string" },
				size: { type: "string", enum: ["s", "m", "l"] },
				max: { type: "integer", minimum: 0, maximum: 100 },
				tags: { type: "array", items: { type: "string", maxLength: 20 } },
			},
			additionalProperties: false,
		},
		positions: ["root", "row"],
		consumers: ["blueprint", "form"],
		pins: [{ key: "blueprint_id", kind: "blueprint" }],
		has_text: true,
		...overrides,
	};
}

function catalogue(
	types: CatalogueType[],
	version = "0.18.0",
): Catalogue {
	return { version, types };
}

/** The released baseline every case below is compared against. */
const released = catalogue([type()]);

/** A copy of the baseline type with its settings schema edited. */
function withSettings(
	edit: (schema: Record<string, any>) => void,
): CatalogueType {
	const next = structuredClone(type());
	edit(next.settings_schema as Record<string, any>);
	return next;
}

describe("compareCatalogues — what passes", () => {
	it("passes an identical Catalogue", () => {
		expect(compareCatalogues(released, released)).toEqual([]);
	});

	it("passes a new type", () => {
		const next = catalogue(
			[type(), type({ id: "url", since: "0.19.0" })],
			"0.19.0",
		);
		expect(compareCatalogues(released, next)).toEqual([]);
	});

	it("passes a new optional setting", () => {
		const next = catalogue(
			[
				withSettings((s) => {
					s.properties.prepend = { type: "string" };
				}),
			],
			"0.19.0",
		);
		expect(compareCatalogues(released, next)).toEqual([]);
	});

	it("passes a widened enum, a loosened bound and a new Position", () => {
		const widened = withSettings((s) => {
			s.properties.size.enum = ["xs", "s", "m", "l"];
			s.properties.max.maximum = 1000;
			delete s.properties.max.minimum;
			s.properties.tags.items.maxLength = 40;
		});
		widened.positions = ["root", "row", "reference_spec"];
		widened.pins = [
			{ key: "blueprint_id", kind: "blueprint" },
			{ key: "list_id", kind: "list" },
		];
		expect(
			compareCatalogues(released, catalogue([widened], "0.19.0")),
		).toEqual([]);
	});

	it("passes a Consumer dropped: Consumers only filter pickers (ADR-0022)", () => {
		const next = catalogue([type({ consumers: ["form"] })], "0.19.0");
		expect(compareCatalogues(released, next)).toEqual([]);
	});
});

describe("compareCatalogues — what fails", () => {
	function breaks(next: CatalogueType, version = "0.19.0"): string[] {
		return compareCatalogues(released, catalogue([next], version));
	}

	it("fails a removed type", () => {
		expect(compareCatalogues(released, catalogue([], "0.19.0"))).toEqual([
			"text: the type was removed",
		]);
	});

	it("fails a renamed type — a removal and an addition", () => {
		const renamed = catalogue([type({ id: "plain_text", since: "0.19.0" })], "0.19.0");
		expect(compareCatalogues(released, renamed)).toEqual([
			"text: the type was removed",
		]);
	});

	it("fails a removed setting", () => {
		expect(
			breaks(
				withSettings((s) => {
					delete s.properties.placeholder;
				}),
			),
		).toEqual(["text: settings /placeholder was removed"]);
	});

	it("fails a renamed setting", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.hint = s.properties.placeholder;
					delete s.properties.placeholder;
				}),
			),
		).toEqual(["text: settings /placeholder was removed"]);
	});

	it("fails a narrowed enum", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.size.enum = ["s", "m"];
				}),
			),
		).toEqual(['text: settings /size no longer allows "l"']);
	});

	it("fails an enum where there was none", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.placeholder.enum = ["a"];
				}),
			),
		).toEqual(["text: settings /placeholder gained an enum"]);
	});

	it("fails a newly required key, old or new", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.prepend = { type: "string" };
					s.required = ["placeholder", "prepend"];
				}),
			),
		).toEqual([
			"text: settings /placeholder is newly required",
			"text: settings /prepend is newly required",
		]);
	});

	it("fails a changed type, at any depth", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.placeholder.type = "number";
					s.properties.tags.items.type = "integer";
				}),
			),
		).toEqual([
			'text: settings /placeholder changed type from "string" to "number"',
			'text: settings /tags/items changed type from "string" to "integer"',
		]);
	});

	it("fails a tightened bound", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.max.minimum = 1;
					s.properties.max.exclusiveMaximum = 50;
					s.properties.tags.items.maxLength = 10;
				}),
			),
		).toEqual([
			"text: settings /max tightened minimum from 0 to 1",
			"text: settings /max gained exclusiveMaximum 50",
			"text: settings /tags/items tightened maxLength from 20 to 10",
		]);
	});

	it("fails closing an open object", () => {
		const open = catalogue([
			withSettings((s) => {
				s.additionalProperties = true;
			}),
		]);
		expect(
			compareCatalogues(open, catalogue([type()], "0.19.0")),
		).toEqual(["text: settings / no longer allows additional properties"]);
	});

	it("fails a removed Position, Pin or text, and a changed since", () => {
		expect(
			breaks(
				type({
					since: "0.19.0",
					positions: ["root"],
					pins: [],
					has_text: false,
				}),
			),
		).toEqual([
			'text: since changed from "0.18.0" to "0.19.0"',
			'text: Position "row" was removed',
			'text: Pin "blueprint_id" (blueprint) was removed',
			"text: has_text changed from true to false",
		]);
	});

	it("fails a keyword the check does not understand, rather than passing it", () => {
		expect(
			breaks(
				withSettings((s) => {
					s.properties.placeholder.pattern = "^a";
				}),
			),
		).toEqual([
			'text: settings /placeholder changed "pattern", which this check cannot judge',
		]);
	});
});

describe("compareCatalogues — the Catalogue version", () => {
	it("fails a changed Catalogue that still carries the released version", () => {
		const next = catalogue([type(), type({ id: "url", since: "0.18.0" })]);
		expect(compareCatalogues(released, next)).toEqual([
			"the Catalogue changed since 0.18.0 but its version is still 0.18.0: set CATALOGUE_VERSION in scripts/catalogue.ts to the release that will ship it",
		]);
	});

	it("fails a version that moves back", () => {
		expect(
			compareCatalogues(released, catalogue([type()], "0.17.0")),
		).toEqual([
			"the Catalogue version moved back from 0.18.0 to 0.17.0",
		]);
	});

	it("fails an unchanged Catalogue under a new version", () => {
		expect(
			compareCatalogues(released, catalogue([type()], "0.19.0")),
		).toEqual([
			"the Catalogue is unchanged since 0.18.0 but its version is 0.19.0: a version names one Catalogue, so keep 0.18.0",
		]);
	});

	it("fails a new type whose since is not the new version", () => {
		const next = catalogue(
			[type(), type({ id: "url", since: "0.18.0" })],
			"0.19.0",
		);
		expect(compareCatalogues(released, next)).toEqual([
			'url: a new type\'s since must be the Catalogue version 0.19.0, not "0.18.0"',
		]);
	});
});
