// The TS runner for the shared conformance fixtures. It replays the same files
// as the Go runner (go/conformance_test.go) and expects the same results. The
// format is in conformance/README.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../field-types";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { validateSpec } from "../validate-spec";

const CONFORMANCE = path.resolve(__dirname, "../../../conformance");

/** The operations this runner implements. A fixture expecting another fails,
 * so no fixture is ever skipped by one runner alone. */
const OPERATIONS = ["validateSpec"];

interface ExpectedError {
	path: string;
	code: string;
}

interface Fixture {
	description: string;
	spec: Field[];
	expect: Record<string, unknown>;
}

/** The Catalogue's types, and only those: Go validates against the Catalogue,
 * so a built-in type not yet in it must be unknown here too. */
const cataloguePlugins = new Map<string, FieldTypePlugin>(
	builtInFieldTypes
		.filter((plugin) => plugin.settingsSchema)
		.map((plugin) => [plugin.id, plugin]),
);

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
		it(name, () => {
			const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;
			expect(fixture.description, "description").toBeTruthy();
			const operations = Object.keys(fixture.expect ?? {});
			expect(operations.length, "expects nothing").toBeGreaterThan(0);
			for (const operation of operations) {
				expect(OPERATIONS, `unknown operation ${operation}`).toContain(
					operation,
				);
			}

			if ("validateSpec" in fixture.expect) {
				const want = fixture.expect.validateSpec as ExpectedError[];
				const got = validateSpec(fixture.spec, cataloguePlugins).fieldErrors;
				expect(sorted(got)).toEqual(sorted(want));
			}
		});
	}
});
