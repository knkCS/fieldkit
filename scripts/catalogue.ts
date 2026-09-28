/**
 * catalogue — generates the Catalogue (ADR-0018): every Field Type that
 * declares a `settingsSchema`, described as data, one file per section
 * (scripts/lib/catalogue-sections.ts):
 *
 *   - `go/catalogue.json` — the core section, every built-in type. The Go
 *     module's root package embeds it (Go's `embed` cannot reach outside the
 *     module, so the file lives inside `go/`), and the npm package ships the
 *     same file as `@knkcs/fieldkit/catalogue.json`.
 *   - `go/publishing/catalogue.json` — the opt-in publishing package's types
 *     (ADR-0002, amended), embedded by `…/go/publishing` and shipped as
 *     `@knkcs/fieldkit/publishing/catalogue.json`.
 *
 * There is no second copy of either to drift.
 *
 * Run: tsx scripts/catalogue.ts           # regenerate every section's file
 *      tsx scripts/catalogue.ts --check   # fail if a committed file is stale
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { publishingFieldTypes } from "../src/publishing";
// The Catalogue's version lives beside the code that stamps it on a Resolved
// Spec, so the two cannot disagree (ADR-0020).
import { CATALOGUE_VERSION } from "../src/schema/catalogue-version";
import { builtInFieldTypes } from "../src/schema/field-types";
import type { FieldTypePlugin } from "../src/schema/plugin";
import { POSITIONS } from "../src/schema/positions";
import {
	CATALOGUE_SECTIONS,
	sectionProblems,
} from "./lib/catalogue-sections";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
 * Where a Field of the type may sit (ADR-0022), as the plugin declares it, in
 * the order `POSITIONS` lists them. No default: Catalogue data is frozen once
 * released (ADR-0019), so a type in it says where it may sit rather than
 * inheriting a guess.
 */
function positions(plugin: FieldTypePlugin): string[] {
	if (!plugin.positions) {
		throw new Error(`${plugin.id}: declares a settingsSchema but no positions`);
	}
	const declared = plugin.positions;
	return POSITIONS.filter((position) => declared.includes(position));
}

/** Which Consumers' pickers offer the type — advice only (ADR-0022). No
 * default, for the reason `positions` has none. */
function consumers(plugin: FieldTypePlugin): string[] {
	if (!plugin.consumers) {
		throw new Error(`${plugin.id}: declares a settingsSchema but no consumers`);
	}
	return [...plugin.consumers];
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

/** The plugins each Catalogue section lists (scripts/lib/catalogue-sections.ts). */
const SECTION_PLUGINS: Record<string, FieldTypePlugin[]> = {
	core: builtInFieldTypes,
	publishing: publishingFieldTypes,
};

function main() {
	const sections: Record<string, Catalogue> = {};
	for (const { name } of CATALOGUE_SECTIONS) {
		const plugins = SECTION_PLUGINS[name];
		if (!plugins) throw new Error(`no plugins for the ${name} section`);
		sections[name] = buildCatalogue(plugins);
	}
	// A type is in one section: in two, a Consumer holding both would have
	// it twice (Go's Catalogue.With refuses that).
	const problems = sectionProblems(sections);
	if (problems.length > 0) {
		throw new Error(`the Catalogue's sections disagree:\n  - ${problems.join("\n  - ")}`);
	}

	const check = process.argv.includes("--check");
	let stale = false;
	for (const { name, file } of CATALOGUE_SECTIONS) {
		const json = `${JSON.stringify(sections[name], null, "\t")}\n`;
		const at = resolve(ROOT, file);
		if (!check) {
			mkdirSync(dirname(at), { recursive: true });
			writeFileSync(at, json);
			console.log(`wrote ${file}`);
			continue;
		}
		let committed = "";
		try {
			committed = readFileSync(at, "utf8");
		} catch {
			// missing reads as stale
		}
		if (committed !== json) {
			console.error(`${file} is stale: run \`npm run catalogue\` and commit the result`);
			stale = true;
		} else {
			console.log(`${file} is up to date`);
		}
	}
	if (stale) process.exit(1);
}

main();
