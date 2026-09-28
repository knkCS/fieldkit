// The TS runner for the shared conformance fixtures. It replays the same files
// as the Go runner (go/conformance_test.go) and expects the same results. The
// format is in conformance/README.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE_VERSION } from "../catalogue-version";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import {
	type ResolvedSpec,
	resolveSpec,
	type SpecPin,
	specPins,
} from "../resolve-spec";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";
import { validateValue } from "../validate-value";

const CONFORMANCE = path.resolve(__dirname, "../../../conformance");

/** The operations this runner implements. A fixture expecting another fails,
 * so no fixture is ever skipped by one runner alone. */
const OPERATIONS = [
	"validateSpec",
	"validateValue",
	"resolve",
	"pins",
	"validateResolvedSpec",
];

/** The operations only Go implements: versionkit's Compare and Merge (#213),
 * which no TS code performs. This runner recognises them, so a fixture holding
 * them is not unknown, and runs nothing for them — the one deliberate
 * exception to "no fixture is skipped by one runner alone". */
const GO_ONLY_OPERATIONS = ["compare", "merge"];

interface ExpectedError {
	path: string;
	code: string;
}

interface Fixture {
	description: string;
	spec: Field[];
	/** The stored data `validateValue` checks against `spec`. */
	data?: unknown;
	/** What resolving `spec` fetches: kind → Release id → Release. */
	releases?: Record<string, Record<string, unknown>>;
	/** Resolution's caps, overriding `RESOLVE_CAPS`. */
	resolveOptions?: { maxFetches?: number; maxDepth?: number };
	expect: Record<string, unknown>;
}

/** The Catalogue's types, and only those: Go validates against the Catalogue,
 * so a built-in type not yet in it must be unknown here too. */
const cataloguePlugins = new Map<string, FieldTypePlugin>(
	builtInFieldTypes
		.filter((plugin) => plugin.settingsSchema)
		.map((plugin) => [plugin.id, plugin]),
);

/** Resolves a fixture's Spec against its releases, with its caps. Every kind
 * but `blueprint` is an opaque part. */
function resolveFixture(fixture: Fixture): Promise<ResolvedSpec> {
	const releases = fixture.releases ?? {};
	const fetch = async (kind: string, id: string) => {
		const release = releases[kind]?.[id];
		if (release === undefined) {
			throw new Error(`the fixture has no ${kind} Release "${id}"`);
		}
		return release;
	};
	return resolveSpec(
		fixture.spec,
		{
			blueprint: {
				getSchema: async (id) => (await fetch("blueprint", id)) as Field[],
			},
			parts: Object.fromEntries(
				Object.keys(releases)
					.filter((kind) => kind !== "blueprint")
					.map((kind) => [kind, (id: string) => fetch(kind, id)]),
			),
		},
		{ plugins: cataloguePlugins, ...fixture.resolveOptions },
	);
}

function dirs(at: string): string[] {
	return readdirSync(at).filter((name) =>
		statSync(path.join(at, name)).isDirectory(),
	);
}

function fixtureFiles(): string[] {
	const files: string[] = [];
	for (const version of dirs(CONFORMANCE)) {
		for (const area of dirs(path.join(CONFORMANCE, version))) {
			const at = path.join(CONFORMANCE, version, area);
			for (const name of readdirSync(at)) {
				if (name.endsWith(".json")) files.push(path.join(at, name));
			}
		}
	}
	return files.sort();
}

/** The folder of fieldkit as it is now; every other folder is a release. */
const UNRELEASED = "unreleased";

/**
 * Whether a fixture's expectation for one operation binds the current code.
 * Everything in `unreleased/` does. In a released version's folder only the
 * VALID cases do (ADR-0019): what a release accepted stays accepted, but what
 * it rejected may since have become valid — a validation bug is fixed by
 * loosening. An operation this runner does not know binds, so it still fails
 * as unknown rather than being skipped.
 */
function binds(version: string, operation: string, expected: unknown): boolean {
	if (version === UNRELEASED) return true;
	switch (operation) {
		// Both operations answer with a list of errors, and a valid case is an
		// empty one.
		case "validateSpec":
		case "validateValue":
		case "validateResolvedSpec":
			return Array.isArray(expected) && expected.length === 0;
		// A refusal may loosen, as an invalid case may; an envelope binds.
		case "resolve":
			return !(
				typeof expected === "object" &&
				expected !== null &&
				"error" in expected
			);
		default:
			return true;
	}
}

function sorted(errors: ExpectedError[]): ExpectedError[] {
	return errors
		.map(({ path, code }) => ({ path, code }))
		.sort((a, b) =>
			a.path === b.path
				? a.code.localeCompare(b.code)
				: a.path < b.path
					? -1
					: 1,
		);
}

describe("conformance fixtures", () => {
	const files = fixtureFiles();

	it("finds fixtures", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	for (const file of files) {
		const name = path.relative(CONFORMANCE, file);
		const version = name.split(path.sep)[0];
		it(name, async (ctx) => {
			const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;
			expect(fixture.description, "description").toBeTruthy();
			const operations = Object.keys(fixture.expect ?? {});
			expect(operations.length, "expects nothing").toBeGreaterThan(0);
			for (const operation of operations) {
				expect(
					[...OPERATIONS, ...GO_ONLY_OPERATIONS],
					`unknown operation ${operation}`,
				).toContain(operation);
			}
			const bound = operations.filter(
				(operation) =>
					!GO_ONLY_OPERATIONS.includes(operation) &&
					binds(version, operation, fixture.expect[operation]),
			);
			// A released invalid case, kept as history, or a fixture of Go-only
			// operations: nothing binds here.
			if (bound.length === 0) ctx.skip();

			if (bound.includes("validateSpec")) {
				const want = fixture.expect.validateSpec as ExpectedError[];
				const got = validateSpec(fixture.spec, cataloguePlugins).fieldErrors;
				expect(sorted(got)).toEqual(sorted(want));
			}

			if (bound.includes("validateValue")) {
				const want = fixture.expect.validateValue as ExpectedError[];
				const got = validateValue(fixture.spec, fixture.data, cataloguePlugins);
				expect(sorted(got)).toEqual(sorted(want));
			}

			if (bound.includes("pins")) {
				const want = fixture.expect.pins as SpecPin[];
				const byPath = (a: SpecPin, b: SpecPin) =>
					a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
				const got = specPins(fixture.spec, cataloguePlugins);
				expect([...got].sort(byPath)).toEqual([...want].sort(byPath));
			}

			if (bound.includes("resolve")) {
				const want = fixture.expect.resolve as Record<string, unknown>;
				if ("error" in want) {
					await expect(resolveFixture(fixture)).rejects.toMatchObject({
						code: want.error,
					});
				} else {
					// The fixture leaves the Catalogue version out: it is always the
					// running Catalogue's.
					const { catalogue, ...got } = await resolveFixture(fixture);
					expect(catalogue).toBe(CATALOGUE_VERSION);
					expect(got).toEqual(want);
				}
			}

			if (bound.includes("validateResolvedSpec")) {
				const want = fixture.expect.validateResolvedSpec as ExpectedError[];
				const resolved = await resolveFixture(fixture);
				const got = validateSpec(resolved.fields, cataloguePlugins, {
					resolved: true,
				}).fieldErrors;
				expect(sorted(got)).toEqual(sorted(want));
			}
		});
	}
});

describe("which fixtures bind (ADR-0019)", () => {
	it("binds every case of fieldkit as it is now", () => {
		expect(binds("unreleased", "validateSpec", [])).toBe(true);
		expect(
			binds("unreleased", "validateSpec", [{ path: "/a", code: "x" }]),
		).toBe(true);
	});

	it("binds only a released version's valid cases", () => {
		expect(binds("0.18.0", "validateSpec", [])).toBe(true);
		expect(binds("0.18.0", "validateSpec", [{ path: "/a", code: "x" }])).toBe(
			false,
		);
		expect(binds("0.18.0", "validateValue", [])).toBe(true);
		expect(
			binds("0.18.0", "validateValue", [{ path: "/a", code: "required" }]),
		).toBe(false);
	});

	it("binds an operation it does not know, so it fails as unknown", () => {
		expect(binds("0.18.0", "somethingNew", [{ anything: 1 }])).toBe(true);
	});
});
