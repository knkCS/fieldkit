/**
 * Released versions, as the repository records them: a final release freezes
 * its conformance fixtures and its Catalogue under `conformance/<version>/`
 * (ADR-0018), so the folders there ARE the list of releases whose data
 * contract binds. No tag lookup is needed — a fresh clone, a shallow CI
 * checkout and a worktree all see the same answer.
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import path from "node:path";
import { type Catalogue, compareCatalogues } from "./catalogue-compat";
import { compareVersions, finalOf, isFinalVersion } from "./versions";

/** Where the fixtures of fieldkit as it is now live. Never frozen itself. */
export const UNRELEASED = "unreleased";

/** The frozen copy of the Catalogue inside a version folder. It sits beside
 * the area folders, not in one, so neither runner reads it as a fixture. */
export const FROZEN_CATALOGUE = "catalogue.json";

/** Every final release frozen under `conformanceDir`, oldest first. */
export function releasedVersions(conformanceDir: string): string[] {
	return readdirSync(conformanceDir)
		.filter(
			(name) =>
				isFinalVersion(name) &&
				statSync(path.join(conformanceDir, name)).isDirectory(),
		)
		.sort(compareVersions);
}

/** The newest frozen release — older than `before`, when given — or
 * undefined before the first one. */
export function lastReleasedVersion(
	conformanceDir: string,
	before?: string,
): string | undefined {
	return releasedVersions(conformanceDir)
		.filter((v) => before === undefined || compareVersions(v, before) < 0)
		.at(-1);
}

export function readCatalogue(file: string): Catalogue {
	return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

/** The Catalogue the newest release froze, with its version. */
export function lastReleasedCatalogue(
	conformanceDir: string,
	before?: string,
): { version: string; catalogue: Catalogue } | undefined {
	const version = lastReleasedVersion(conformanceDir, before);
	if (!version) return undefined;
	const file = path.join(conformanceDir, version, FROZEN_CATALOGUE);
	if (!existsSync(file)) {
		throw new Error(
			`conformance/${version}/ has no ${FROZEN_CATALOGUE}: every released version freezes its Catalogue`,
		);
	}
	return { version, catalogue: readCatalogue(file) };
}

/**
 * Whether `current` may ship in `release` (a final version, or a candidate
 * for one). The Catalogue carries a hand-set version (CATALOGUE_VERSION in
 * scripts/catalogue.ts) that moves only when the Catalogue changes, so the
 * check is not "equal to package.json" but: whatever changed since the last
 * release ships under this release's number, and nothing is ever newer than
 * the release that ships it. Returns every problem; empty means it may ship.
 */
export function catalogueReleaseProblems(
	current: Catalogue,
	release: string,
	baseline: Catalogue | undefined,
): string[] {
	const target = finalOf(release);
	const problems: string[] = [];
	if (compareVersions(current.version, target) > 0) {
		problems.push(
			`the Catalogue says ${current.version}, newer than the release ${target} that would ship it`,
		);
	}
	for (const type of current.types) {
		if (compareVersions(type.since, current.version) > 0) {
			problems.push(
				`${type.id}: since ${type.since} is newer than the Catalogue version ${current.version}`,
			);
		}
	}
	if (!baseline) {
		// The first Catalogue ever released ships under this release's number.
		if (current.version !== target) {
			problems.push(
				`the first released Catalogue must carry the release's version ${target}, not ${current.version}: set CATALOGUE_VERSION in scripts/catalogue.ts`,
			);
		}
		return problems;
	}
	problems.push(...compareCatalogues(baseline, current));
	if (
		current.version !== baseline.version &&
		current.version !== target
	) {
		problems.push(
			`the Catalogue changed since ${baseline.version}, so it ships as ${target}, not ${current.version}: set CATALOGUE_VERSION in scripts/catalogue.ts`,
		);
	}
	return problems;
}

/**
 * Freezes a final release: copies `unreleased/`'s fixtures and the current
 * Catalogue into `conformance/<version>/`. A version folder is never edited
 * (ADR-0018), so an existing one is an error, never overwritten.
 */
export function freezeRelease(
	conformanceDir: string,
	catalogueFile: string,
	version: string,
): string {
	if (!isFinalVersion(version)) {
		throw new Error(
			`only a final release is frozen, not ${version}: a candidate's fixtures may still change before the release`,
		);
	}
	const target = path.join(conformanceDir, version);
	if (existsSync(target)) {
		throw new Error(
			`conformance/${version}/ already exists: a released version's folder is never edited (ADR-0018)`,
		);
	}
	const last = lastReleasedVersion(conformanceDir);
	if (last && compareVersions(version, last) <= 0) {
		throw new Error(
			`${version} is not newer than the last release ${last}`,
		);
	}
	mkdirSync(target);
	cpSync(path.join(conformanceDir, UNRELEASED), target, { recursive: true });
	cpSync(catalogueFile, path.join(target, FROZEN_CATALOGUE));
	return target;
}

/**
 * The commands that publish a release: both tags on the one release commit
 * (ADR-0018 — npm and the Go module share a version, so they share a commit
 * too), then one push. They are printed for a person to run, never run:
 * agents are blocked from pushing release tags, and a pushed tag is not taken
 * back.
 *
 * The `v` tag runs publish-fieldkit.yml (npm); the `go/v` tag is how the Go
 * proxy finds a version of a module that lives in the `go/` subdirectory.
 */
export function tagCommands(version: string, sha: string): string[] {
	return [
		`git tag -a v${version} ${sha} -m "@knkcs/fieldkit ${version}"`,
		`git tag -a go/v${version} ${sha} -m "github.com/knkcs/fieldkit/go ${version}"`,
		`git push origin v${version} go/v${version}`,
	];
}

/** Every file path under `dir`, relative to it, sorted. */
function filesUnder(dir: string, at = ""): string[] {
	return readdirSync(path.join(dir, at))
		.flatMap((name) => {
			const rel = path.join(at, name);
			return statSync(path.join(dir, rel)).isDirectory()
				? filesUnder(dir, rel)
				: [rel];
		})
		.sort();
}

/**
 * How a release's frozen folder differs from what it must hold at the release
 * commit: exactly `unreleased/`'s fixtures and the Catalogue, byte for byte.
 * Empty when they match.
 */
export function frozenDrift(
	conformanceDir: string,
	catalogueFile: string,
	version: string,
): string[] {
	const frozen = path.join(conformanceDir, version);
	if (!existsSync(frozen)) return [`conformance/${version}/ does not exist`];
	const unreleased = path.join(conformanceDir, UNRELEASED);
	const want = new Map<string, string>(
		filesUnder(unreleased).map((f) => [f, path.join(unreleased, f)]),
	);
	want.set(FROZEN_CATALOGUE, catalogueFile);
	const have = new Set(filesUnder(frozen));
	const drift: string[] = [];
	for (const [rel, source] of want) {
		if (!have.has(rel)) {
			drift.push(`conformance/${version}/${rel} is missing`);
		} else if (
			!readFileSync(path.join(frozen, rel)).equals(readFileSync(source))
		) {
			drift.push(`conformance/${version}/${rel} differs from its source`);
		}
	}
	for (const rel of have) {
		if (!want.has(rel)) {
			drift.push(`conformance/${version}/${rel} has no source`);
		}
	}
	return drift;
}
