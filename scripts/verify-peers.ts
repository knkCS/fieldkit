/**
 * verify-peers — Asserts that knkeditor's peers stay inside the subpath that
 * declares them (ADR-0026).
 *
 * `@knkcs/fieldkit/rich-text` is opt-in because knkeditor brings about 45
 * extension packages, TipTap, i18next, react-icons and emotion as peers. A
 * Consumer that never imports it must never load them — so no other entry may
 * reach them, however indirectly. tsup's code splitting makes that easy to
 * break without noticing: one shared chunk that happens to hold a knkeditor
 * import puts it in every entry importing that chunk.
 *
 * So this walks the **built** graph, not the source: for each `dist/<entry>
 * /index.js` except the ones allowed below, it follows every relative
 * `import`/`export … from` through the chunks it reaches and fails on a bare
 * specifier from knkeditor's world.
 *
 * Run after `npm run build`: tsx scripts/verify-peers.ts
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/** The entries that may import knkeditor's world: the subpath that declares
 * it as its peers. */
const ALLOWED = new Set(["rich-text"]);

/** knkeditor, and the peers it brings that nothing else in fieldkit uses. */
const FORBIDDEN = [
	/^@knkcms\//,
	/^@tiptap\//,
	/^i18next(\/|$)/,
	/^i18next-browser-languagedetector(\/|$)/,
	/^react-i18next(\/|$)/,
	/^react-icons(\/|$)/,
];

// Static imports and re-exports only: the build emits no dynamic import of a
// bare specifier, and one would be the same leak.
const SPECIFIER =
	/(?:^|[\s;])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+)["']/g;

function specifiersOf(file: string): string[] {
	const source = readFileSync(file, "utf8");
	return [...source.matchAll(SPECIFIER)].map((match) => match[1]);
}

/** Every bare specifier `entry` reaches, with the chunk that imports it. */
function reach(entry: string): Map<string, string> {
	const bare = new Map<string, string>();
	const seen = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		for (const specifier of specifiersOf(file)) {
			if (specifier.startsWith(".")) {
				queue.push(resolve(dirname(file), specifier));
			} else if (!bare.has(specifier)) {
				bare.set(specifier, file);
			}
		}
	}
	return bare;
}

function main() {
	if (!existsSync(DIST)) {
		console.error("verify-peers: no dist/ — run `npm run build` first");
		process.exit(1);
	}
	const entries = readdirSync(DIST, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.filter((name) => existsSync(join(DIST, name, "index.js")));
	if (!entries.some((name) => ALLOWED.has(name))) {
		console.error(
			"verify-peers: dist/rich-text/index.js is missing — has the entry moved?",
		);
		process.exit(1);
	}

	const leaks: string[] = [];
	for (const name of entries) {
		if (ALLOWED.has(name)) continue;
		for (const [specifier, file] of reach(join(DIST, name, "index.js"))) {
			if (FORBIDDEN.some((pattern) => pattern.test(specifier))) {
				leaks.push(
					`  ${name}: "${specifier}", imported by ${relative(ROOT, file)}`,
				);
			}
		}
	}

	if (leaks.length > 0) {
		console.error(
			"verify-peers: these entries reach knkeditor's peers, which only @knkcs/fieldkit/rich-text may import (ADR-0026):",
		);
		console.error(leaks.join("\n"));
		process.exit(1);
	}
	console.log(
		`verify-peers: ${entries.length - ALLOWED.size} entries checked, none reaches knkeditor's peers`,
	);
}

main();
