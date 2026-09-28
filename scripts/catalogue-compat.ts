/**
 * catalogue-compat — fails when the Catalogue breaks what the last release
 * promised (ADR-0019). Run by `npm run verify`.
 *
 * The baseline is the Catalogue the newest release froze under
 * `conformance/<version>/catalogue.json`. Before the first release there is
 * none, and the check passes saying so: there is nothing yet to stay
 * compatible with.
 *
 * Run: tsx scripts/catalogue-compat.ts
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareCatalogues } from "./lib/catalogue-compat";
import { lastReleasedCatalogue, readCatalogue } from "./lib/releases";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const baseline = lastReleasedCatalogue(resolve(ROOT, "conformance"));
if (!baseline) {
	console.log(
		"catalogue-compat: no released Catalogue yet (no conformance/<version>/) — nothing to stay compatible with",
	);
	process.exit(0);
}

const current = readCatalogue(resolve(ROOT, "go/catalogue.json"));
const breaks = compareCatalogues(baseline.catalogue, current);
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
