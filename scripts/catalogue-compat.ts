/**
 * catalogue-compat — fails when the Catalogue breaks what the last release
 * promised (ADR-0019). Run by `npm run verify`.
 *
 * The baseline is the Catalogue the newest release froze under
 * `conformance/<version>/` — its core section as `catalogue.json`, each
 * opt-in section beside it (scripts/lib/catalogue-sections.ts). Every section
 * is judged together, as one Catalogue. Before the first release there is no
 * baseline, and the check passes saying so: there is nothing yet to stay
 * compatible with — but the sections must still agree with each other.
 *
 * Run: tsx scripts/catalogue-compat.ts
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	compareCatalogueSections,
	sectionFiles,
	sectionProblems,
} from "./lib/catalogue-sections";
import { lastReleasedCatalogue, readCatalogueSections } from "./lib/releases";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const current = readCatalogueSections(sectionFiles(ROOT));
const baseline = lastReleasedCatalogue(resolve(ROOT, "conformance"));
if (!baseline) {
	const problems = sectionProblems(current);
	if (problems.length > 0) {
		console.error("catalogue-compat: the Catalogue's sections disagree:");
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log(
		"catalogue-compat: no released Catalogue yet (no conformance/<version>/) — nothing to stay compatible with",
	);
	process.exit(0);
}

const breaks = compareCatalogueSections(baseline.catalogue, current);
if (breaks.length > 0) {
	console.error(
		`catalogue-compat: the Catalogue breaks the one released in ${baseline.version} — it may only grow (ADR-0019):`,
	);
	for (const b of breaks) console.error(`  - ${b}`);
	process.exit(1);
}
console.log(
	`catalogue-compat: compatible with the Catalogue released in ${baseline.version}`,
);
