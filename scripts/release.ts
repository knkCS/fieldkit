/**
 * release — the release train for npm and Go (ADR-0018, ADR-0019).
 *
 * One release is one version number on one commit, tagged twice: `vX.Y.Z`
 * publishes the npm package (publish-fieldkit.yml) and `go/vX.Y.Z` is the Go
 * module's version. A release candidate `X.Y.Z-rc.N` goes through the same
 * train first. The full procedure is in docs/releasing.md.
 *
 *   tsx scripts/release.ts prepare <X.Y.Z | X.Y.Z-rc.N>
 *     On a clean tree: checks the Catalogue is current and may ship under this
 *     version, sets package.json (and the lockfile) to it, and — for a final
 *     release — freezes conformance/unreleased/ and the Catalogue into
 *     conformance/<X.Y.Z>/. Commits nothing: the result is reviewed and
 *     committed as `chore(release): <version> — …`.
 *
 *   tsx scripts/release.ts tags
 *     On the release commit, once it is on main: checks it is one, and PRINTS
 *     the commands that tag it and push both tags.
 *
 * This script never creates or pushes a tag. Agents are blocked from pushing
 * release tags, and a pushed tag cannot be taken back, so a person runs the
 * printed commands.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	catalogueReleaseProblems,
	freezeRelease,
	frozenDrift,
	lastReleasedCatalogue,
	readCatalogue,
	tagCommands,
} from "./lib/releases";
import { compareVersions, isFinalVersion, parseVersion } from "./lib/versions";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFORMANCE = resolve(ROOT, "conformance");
const CATALOGUE_FILE = resolve(ROOT, "go/catalogue.json");

function fail(message: string, details: string[] = []): never {
	console.error(`release: ${message}`);
	for (const d of details) console.error(`  - ${d}`);
	process.exit(1);
}

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function packageVersion(): string {
	return JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"))
		.version as string;
}

function requireCleanTree() {
	const status = git("status", "--porcelain");
	if (status) {
		fail("the working tree is not clean — commit or discard first:", [
			...status.split("\n"),
		]);
	}
}

/** The Catalogue must be current (the generator's own --check) before it
 * can be judged or frozen. */
function requireFreshCatalogue() {
	try {
		execFileSync("npx", ["tsx", "scripts/catalogue.ts", "--check"], {
			cwd: ROOT,
			stdio: "inherit",
		});
	} catch {
		fail("go/catalogue.json is stale: run `npm run catalogue` and commit it");
	}
}

function prepare(version: string | undefined) {
	if (!version || !parseVersion(version)) {
		fail("usage: npm run release -- prepare <X.Y.Z | X.Y.Z-rc.N>");
	}
	requireCleanTree();
	const current = packageVersion();
	if (compareVersions(version, current) <= 0) {
		fail(`${version} is not newer than package.json's ${current}`);
	}
	requireFreshCatalogue();

	const catalogue = readCatalogue(CATALOGUE_FILE);
	const baseline = lastReleasedCatalogue(CONFORMANCE, version);
	const problems = catalogueReleaseProblems(
		catalogue,
		version,
		baseline?.catalogue,
	);
	if (problems.length > 0) {
		fail(`the Catalogue cannot ship in ${version}:`, problems);
	}

	// Sets package.json and package-lock.json together, without npm's own
	// commit and tag: the commit is reviewed, and the tags are a person's.
	execFileSync("npm", ["version", version, "--no-git-tag-version"], {
		cwd: ROOT,
		stdio: "ignore",
	});

	const final = isFinalVersion(version);
	if (final) freezeRelease(CONFORMANCE, CATALOGUE_FILE, version);

	console.log(`release: prepared ${version}
  - package.json and package-lock.json: ${current} → ${version}
  - ${
		final
			? `conformance/${version}/: froze conformance/unreleased/ and the Catalogue (${catalogue.version})`
			: "a release candidate freezes nothing: its final release does"
	}

Next:
  1. npm run verify
  2. commit it all as: chore(release): ${version} — <what it ships>
  3. land that commit on main, check it out, and run: npm run release -- tags`);
}

function tags() {
	requireCleanTree();
	const version = packageVersion();
	if (!parseVersion(version)) {
		fail(`package.json's version ${version} is not a release version`);
	}
	const sha = git("rev-parse", "HEAD");
	const subject = git("log", "-1", "--format=%s");
	if (!subject.startsWith(`chore(release): ${version}`)) {
		fail(
			`HEAD is not the release commit of ${version}: its subject is "${subject}", not "chore(release): ${version} — …"`,
		);
	}
	for (const tag of [`v${version}`, `go/v${version}`]) {
		if (git("tag", "--list", tag)) fail(`the tag ${tag} already exists`);
	}

	const problems: string[] = [];
	if (isFinalVersion(version)) {
		problems.push(...frozenDrift(CONFORMANCE, CATALOGUE_FILE, version));
	}
	const baseline = lastReleasedCatalogue(CONFORMANCE, version);
	problems.push(
		...catalogueReleaseProblems(
			readCatalogue(CATALOGUE_FILE),
			version,
			baseline?.catalogue,
		),
	);
	if (problems.length > 0) {
		fail(`HEAD cannot be released as ${version}:`, problems);
	}

	// A tag on a commit main does not hold would publish something main never
	// had — the usual cause is a squash-merge that gave the release commit a
	// new hash. The check reads the local origin/main, hence the fetch hint.
	try {
		git("merge-base", "--is-ancestor", sha, "origin/main");
	} catch {
		fail(
			`HEAD (${sha.slice(0, 12)}) is not on origin/main: run \`git fetch origin\`, check out the release commit as main has it, and run this again`,
		);
	}

	console.log(`release: ${sha.slice(0, 12)} is the release commit of ${version}.

This script never creates or pushes tags. Run these yourself, in order:

${tagCommands(version, sha)
	.map((c) => `  ${c}`)
	.join("\n")}

The v${version} tag publishes the npm package (publish-fieldkit.yml${
		isFinalVersion(version) ? "" : `, under the "next" dist-tag`
	}); go/v${version} makes the Go module fetchable at that version.`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
	case "prepare":
		prepare(args[0]);
		break;
	case "tags":
		tags();
		break;
	default:
		fail(
			"usage: npm run release -- prepare <X.Y.Z | X.Y.Z-rc.N>  |  npm run release -- tags",
		);
}
