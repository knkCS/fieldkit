/**
 * catalogue — generates the Catalogue (ADR-0018): every Field Type that
 * declares a `settingsSchema`, described as data, in `go/catalogue.json`.
 *
 * That one committed file is the Catalogue. The Go module embeds it (Go's
 * `embed` cannot reach outside the module, so the file lives inside `go/`),
 * and the npm package ships the same file as `@knkcs/fieldkit/catalogue.json`.
 * There is no second copy to drift.
 *
 * Run: tsx scripts/catalogue.ts           # regenerate go/catalogue.json
 *      tsx scripts/catalogue.ts --check   # fail if the committed file is stale
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { builtInFieldTypes } from "../src/schema/field-types";
import type { FieldTypePlugin } from "../src/schema/plugin";
import { isVirtualTableRowFieldType } from "../src/schema/virtual-table-row-spec";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE_FILE = resolve(ROOT, "go/catalogue.json");

/**
 * The fieldkit version this Catalogue ships in. It moves with the release
 * that first ships a change to the Catalogue, never back (ADR-0019).
 */
const CATALOGUE_VERSION = "0.18.0";

/**
 * The JSON Schema keywords a settings schema may use: exactly those the Go
 * module's settings validator implements (`go/settings.go`). A schema that
 * needs another fails generation here, rather than being silently ignored by
 * Go — widen both together.
 */
const SUPPORTED_KEYWORDS = new Set([
	"type",
	"properties",
	"additionalProperties",
	"required",
	"items",
	"enum",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minLength",
	"maxLength",
]);

type JsonSchema = { [keyword: string]: unknown };

interface CatalogueType {
	id: string;
	since: string;
	settings_schema: JsonSchema;
	positions: string[];
	consumers: string[];
	pins: { key: string; kind: string }[];
	has_text: boolean;
}

interface Catalogue {
	version: string;
	types: CatalogueType[];
}

function toJsonSchema(plugin: FieldTypePlugin): JsonSchema {
	// biome-ignore lint/style/noNonNullAssertion: only called for plugins that declare one
	const schema = zodToJsonSchema(plugin.settingsSchema!, {
		$refStrategy: "none",
		target: "jsonSchema7",
	}) as JsonSchema;
	delete schema.$schema;
	assertSupported(schema, plugin.id, "");
	return schema;
}

function assertSupported(schema: JsonSchema, typeId: string, at: string) {
	// Strict at every level: an unknown key is an error, never dropped. A
	// record (`z.record()`) is strict too — it declares no keys, and every
	// value it holds is checked against its `additionalProperties` schema.
	const additional = schema.additionalProperties;
	const isRecord = typeof additional === "object" && additional !== null;
	if (schema.type === "object" && additional !== false && !isRecord) {
		throw new Error(
			`${typeId}: settings schema object at "${at || "/"}" is not strict — declare it with .strict()`,
		);
	}
	for (const [keyword, value] of Object.entries(schema)) {
		if (!SUPPORTED_KEYWORDS.has(keyword)) {
			throw new Error(
				`${typeId}: settings schema uses "${keyword}" at "${at || "/"}", which the Go settings validator does not implement`,
			);
		}
		if (keyword === "properties") {
			for (const [key, child] of Object.entries(
				value as Record<string, JsonSchema>,
			)) {
				assertSupported(child, typeId, `${at}/properties/${key}`);
			}
		}
		if (keyword === "items" || keyword === "additionalProperties") {
			if (typeof value === "object" && value !== null) {
				assertSupported(value as JsonSchema, typeId, `${at}/${keyword}`);
			}
		}
	}
}

/**
 * Positions as today's mechanisms decide them — the Row Spec allow-list
 * (ADR-0017) and the `attribute` context — until ADR-0022's Position check
 * makes them the rule.
 */
function positions(plugin: FieldTypePlugin): string[] {
	const out = ["root"];
	if (isVirtualTableRowFieldType(plugin.id)) out.push("row");
	if (plugin.availableIn?.includes("attribute")) out.push("reference_spec");
	return out;
}

/** Consumers are `availableIn` without `attribute`, which is a Position. */
function consumers(plugin: FieldTypePlugin): string[] {
	// No default: Catalogue data is frozen once released (ADR-0019), so a
	// type in it says which Consumers offer it rather than inheriting a guess.
	if (!plugin.availableIn) {
		throw new Error(`${plugin.id}: declares a settingsSchema but no availableIn`);
	}
	return plugin.availableIn.filter(
		(c) => c !== "attribute",
	);
}

function buildCatalogue(plugins: FieldTypePlugin[]): Catalogue {
	const types = plugins
		.filter((plugin) => plugin.settingsSchema)
		.map((plugin): CatalogueType => {
			if (!plugin.catalogue) {
				throw new Error(
					`${plugin.id}: declares a settingsSchema but no catalogue facts (since, hasText, pins)`,
				);
			}
			return {
				id: plugin.id,
				since: plugin.catalogue.since,
				settings_schema: toJsonSchema(plugin),
				positions: positions(plugin),
				consumers: consumers(plugin),
				pins: plugin.catalogue.pins.map(({ key, kind }) => ({ key, kind })),
				has_text: plugin.catalogue.hasText,
			};
		})
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { version: CATALOGUE_VERSION, types };
}

function main() {
	const json = `${JSON.stringify(buildCatalogue(builtInFieldTypes), null, "\t")}\n`;
	if (process.argv.includes("--check")) {
		let committed = "";
		try {
			committed = readFileSync(CATALOGUE_FILE, "utf8");
		} catch {
			// missing reads as stale
		}
		if (committed !== json) {
			console.error(
				"go/catalogue.json is stale: run `npm run catalogue` and commit the result",
			);
			process.exit(1);
		}
		console.log("go/catalogue.json is up to date");
		return;
	}
	writeFileSync(CATALOGUE_FILE, json);
	console.log("wrote go/catalogue.json");
}

main();
