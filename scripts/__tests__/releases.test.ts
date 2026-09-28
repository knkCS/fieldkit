import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Catalogue } from "../lib/catalogue-compat";
import {
	catalogueReleaseProblems,
	freezeRelease,
	frozenDrift,
	lastReleasedCatalogue,
	releasedVersions,
	tagCommands,
} from "../lib/releases";
import { compareVersions, finalOf, parseVersion } from "../lib/versions";

function catalogue(version: string, ids: string[] = ["text"]): Catalogue {
	return {
		version,
		types: ids.map((id) => ({
			id,
			since: id === "text" ? "0.18.0" : version,
			settings_schema: { type: "object", additionalProperties: false },
			positions: ["root"],
			consumers: ["form"],
			pins: [],
			has_text: true,
		})),
	};
}

let root: string;
let conformance: string;
let catalogueFile: string;

function write(file: string, content: unknown) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(content, null, "\t")}\n`);
}

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "fieldkit-release-"));
	conformance = path.join(root, "conformance");
	catalogueFile = path.join(root, "go", "catalogue.json");
	write(path.join(conformance, "unreleased", "validate-spec", "valid.json"), {
		description: "a valid Spec",
	});
	write(path.join(conformance, "unreleased", "validate-spec", "bad.json"), {
		description: "an invalid Spec",
	});
	writeFileSync(path.join(conformance, "README.md"), "# fixtures\n");
	write(catalogueFile, catalogue("0.18.0"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("versions", () => {
	it("reads a final release and a candidate, and nothing else", () => {
		expect(parseVersion("0.18.0")).toEqual({ major: 0, minor: 18, patch: 0 });
		expect(parseVersion("0.18.0-rc.2")).toEqual({
			major: 0,
			minor: 18,
			patch: 0,
			rc: 2,
		});
		for (const bad of ["v0.18.0", "0.18", "0.18.0-beta.1", "0.18.0-rc.0", "unreleased"]) {
			expect(parseVersion(bad), bad).toBeUndefined();
		}
	});

	it("orders a candidate before its release", () => {
		const sorted = ["0.18.0", "0.18.0-rc.2", "0.9.1", "0.18.0-rc.10", "0.17.3"]
			.sort(compareVersions);
		expect(sorted).toEqual([
			"0.9.1",
			"0.17.3",
			"0.18.0-rc.2",
			"0.18.0-rc.10",
			"0.18.0",
		]);
		expect(finalOf("0.18.0-rc.2")).toBe("0.18.0");
	});
});

describe("freezeRelease", () => {
	it("copies the current fixtures and the Catalogue into a version folder", () => {
		freezeRelease(conformance, catalogueFile, "0.18.0");
		const frozen = path.join(conformance, "0.18.0");
		expect(readdirSync(frozen).sort()).toEqual([
			"catalogue.json",
			"validate-spec",
		]);
		expect(readdirSync(path.join(frozen, "validate-spec")).sort()).toEqual([
			"bad.json",
			"valid.json",
		]);
		expect(readFileSync(path.join(frozen, "catalogue.json"), "utf8")).toBe(
			readFileSync(catalogueFile, "utf8"),
		);
		// unreleased/ stays: it is fieldkit as it is now, never itself frozen.
		expect(readdirSync(path.join(conformance, "unreleased"))).toEqual([
			"validate-spec",
		]);
		expect(frozenDrift(conformance, catalogueFile, "0.18.0")).toEqual([]);
	});

	it("never edits a released folder", () => {
		freezeRelease(conformance, catalogueFile, "0.18.0");
		expect(() => freezeRelease(conformance, catalogueFile, "0.18.0")).toThrow(
			/never edited/,
		);
	});

	it("freezes only a final release, and only a newer one", () => {
		expect(() =>
			freezeRelease(conformance, catalogueFile, "0.18.0-rc.1"),
		).toThrow(/only a final release/);
		freezeRelease(conformance, catalogueFile, "0.18.0");
		expect(() => freezeRelease(conformance, catalogueFile, "0.17.5")).toThrow(
			/not newer than the last release 0.18.0/,
		);
	});
});

describe("released versions", () => {
	it("are the version folders, newest last, and none before the first release", () => {
		expect(releasedVersions(conformance)).toEqual([]);
		expect(lastReleasedCatalogue(conformance)).toBeUndefined();

		freezeRelease(conformance, catalogueFile, "0.18.0");
		write(catalogueFile, catalogue("0.19.0", ["text", "url"]));
		freezeRelease(conformance, catalogueFile, "0.19.0");
		// A stray candidate-named folder is not a release.
		mkdirSync(path.join(conformance, "0.20.0-rc.1"));

		expect(releasedVersions(conformance)).toEqual(["0.18.0", "0.19.0"]);
		expect(lastReleasedCatalogue(conformance)?.version).toBe("0.19.0");
		expect(lastReleasedCatalogue(conformance, "0.19.0")?.version).toBe(
			"0.18.0",
		);
	});

	it("must each have frozen a Catalogue", () => {
		mkdirSync(path.join(conformance, "0.18.0"));
		expect(() => lastReleasedCatalogue(conformance)).toThrow(
			/has no catalogue.json/,
		);
	});
});

describe("frozenDrift", () => {
	it("reports a frozen folder that no longer matches its sources", () => {
		freezeRelease(conformance, catalogueFile, "0.18.0");
		write(path.join(conformance, "unreleased", "validate-spec", "new.json"), {
			description: "added after the freeze",
		});
		write(catalogueFile, catalogue("0.19.0", ["text", "url"]));
		expect(frozenDrift(conformance, catalogueFile, "0.18.0")).toEqual([
			"conformance/0.18.0/validate-spec/new.json is missing",
			"conformance/0.18.0/catalogue.json differs from its source",
		]);
		expect(frozenDrift(conformance, catalogueFile, "0.19.0")).toEqual([
			"conformance/0.19.0/ does not exist",
		]);
	});
});

describe("catalogueReleaseProblems — the Catalogue version at release", () => {
	it("lets the first Catalogue ship under the release's version, or its candidate's", () => {
		expect(catalogueReleaseProblems(catalogue("0.18.0"), "0.18.0", undefined)).toEqual([]);
		expect(
			catalogueReleaseProblems(catalogue("0.18.0"), "0.18.0-rc.1", undefined),
		).toEqual([]);
	});

	it("fails a first Catalogue under another version", () => {
		expect(
			catalogueReleaseProblems(catalogue("0.18.0"), "0.19.0", undefined),
		).toEqual([
			"the first released Catalogue must carry the release's version 0.19.0, not 0.18.0: set CATALOGUE_VERSION in src/schema/catalogue-version.ts",
		]);
		expect(
			catalogueReleaseProblems(catalogue("0.18.0"), "0.17.1", undefined),
		).toEqual([
			"the Catalogue says 0.18.0, newer than the release 0.17.1 that would ship it",
			"the first released Catalogue must carry the release's version 0.17.1, not 0.18.0: set CATALOGUE_VERSION in src/schema/catalogue-version.ts",
		]);
	});

	it("fails a type newer than its Catalogue", () => {
		const ahead = catalogue("0.18.0");
		ahead.types[0].since = "0.19.0";
		expect(catalogueReleaseProblems(ahead, "0.18.0", undefined)).toEqual([
			"text: since 0.19.0 is newer than the Catalogue version 0.18.0",
		]);
	});

	it("keeps an unchanged Catalogue's version across a release", () => {
		expect(
			catalogueReleaseProblems(catalogue("0.18.0"), "0.19.0", catalogue("0.18.0")),
		).toEqual([]);
	});

	it("ships a changed Catalogue under the release's version", () => {
		const grown = catalogue("0.19.0", ["text", "url"]);
		expect(catalogueReleaseProblems(grown, "0.19.0", catalogue("0.18.0"))).toEqual(
			[],
		);
		const skipped = catalogue("0.19.0", ["text", "url"]);
		expect(
			catalogueReleaseProblems(skipped, "0.20.0", catalogue("0.18.0")),
		).toEqual([
			"the Catalogue changed since 0.18.0, so it ships as 0.20.0, not 0.19.0: set CATALOGUE_VERSION in src/schema/catalogue-version.ts",
		]);
	});

	it("refuses a release whose Catalogue breaks the last one", () => {
		expect(
			catalogueReleaseProblems(catalogue("0.19.0", []), "0.19.0", catalogue("0.18.0")),
		).toEqual(["text: the type was removed"]);
	});
});

describe("tagCommands", () => {
	it("tags one commit twice and pushes both tags in one push", () => {
		expect(tagCommands("0.18.0-rc.1", "abc123")).toEqual([
			'git tag -a v0.18.0-rc.1 abc123 -m "@knkcs/fieldkit 0.18.0-rc.1"',
			'git tag -a go/v0.18.0-rc.1 abc123 -m "github.com/knkcs/fieldkit/go 0.18.0-rc.1"',
			"git push origin v0.18.0-rc.1 go/v0.18.0-rc.1",
		]);
	});
});
