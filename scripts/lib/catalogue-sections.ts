/**
 * The Catalogue's sections (ADR-0002, amended; ADR-0018): the core section —
 * every built-in type, which every Consumer has — and each opt-in package's,
 * which a Consumer has only once it adds that package. Each section is its
 * own committed file, because each is embedded by its own Go package (Go's
 * `embed` reaches no further than the package's folder) and shipped by npm
 * beside it.
 *
 * The sections are one data contract: they carry one version and are judged
 * together, so the Catalogue a Consumer builds from any of them names exactly
 * one release. What each section lists is judged as well — a type moving
 * between sections leaves the Consumers of the one it left.
 */

import path from "node:path";
import { type Catalogue, compareCatalogues } from "./catalogue-compat";

export interface CatalogueSection {
	/** The section's name, as a fixture's `packages` names an opt-in one. */
	name: string;
	/** The committed file, relative to the repository root. */
	file: string;
	/** The file's name inside a released version's conformance folder. */
	frozen: string;
}

/** Every section, the core one first. */
export const CATALOGUE_SECTIONS: readonly CatalogueSection[] = [
	{ name: "core", file: "go/catalogue.json", frozen: "catalogue.json" },
	{
		name: "publishing",
		file: "go/publishing/catalogue.json",
		frozen: "catalogue.publishing.json",
	},
];

/** A Catalogue, section by section. */
export type CatalogueSections = Record<string, Catalogue>;

/** Every section's committed file, by section name, as absolute paths. */
export function sectionFiles(root: string): Record<string, string> {
	return Object.fromEntries(
		CATALOGUE_SECTIONS.map((s) => [s.name, path.join(root, s.file)]),
	);
}

/** The whole Catalogue: every section's types under the core's version. */
export function joinSections(sections: CatalogueSections): Catalogue {
	const core = sections.core;
	if (!core) throw new Error("the Catalogue has no core section");
	const types = CATALOGUE_SECTIONS.flatMap((s) => sections[s.name]?.types ?? [])
		.slice()
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { version: core.version, types };
}

/** Where each type id is listed, and every id listed in two sections. */
function sectionOf(sections: CatalogueSections): {
	of: Map<string, string>;
	twice: string[];
} {
	const of = new Map<string, string>();
	const twice: string[] = [];
	for (const { name } of CATALOGUE_SECTIONS) {
		for (const type of sections[name]?.types ?? []) {
			const other = of.get(type.id);
			if (other !== undefined) {
				twice.push(`${type.id}: listed in both the ${other} and the ${name} section`);
				continue;
			}
			of.set(type.id, name);
		}
	}
	return { of, twice };
}

/**
 * What is wrong with a Catalogue's sections on their own: a section whose
 * version is not the core's, and a type listed in two sections.
 */
export function sectionProblems(sections: CatalogueSections): string[] {
	const problems: string[] = [];
	const version = sections.core?.version;
	for (const { name } of CATALOGUE_SECTIONS) {
		const section = sections[name];
		if (section && section.version !== version) {
			problems.push(
				`the ${name} section says ${section.version}, but the Catalogue is ${version}: every section carries CATALOGUE_VERSION`,
			);
		}
	}
	return [...problems, ...sectionOf(sections).twice];
}

/**
 * Every way `next` breaks what `released` promised (ADR-0019), over the whole
 * Catalogue: compareCatalogues on the sections joined, plus a type that left
 * the section it was released in. A section the release did not have is
 * empty in it.
 */
export function compareCatalogueSections(
	released: CatalogueSections,
	next: CatalogueSections,
): string[] {
	const breaks = [
		...sectionProblems(next),
		...compareCatalogues(joinSections(released), joinSections(next)),
	];
	const was = sectionOf(released).of;
	const now = sectionOf(next).of;
	for (const [id, section] of was) {
		const moved = now.get(id);
		if (moved !== undefined && moved !== section) {
			breaks.push(`${id}: moved from the ${section} section to the ${moved} section`);
		}
	}
	return breaks;
}
