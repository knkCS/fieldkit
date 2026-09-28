// src/schema/vocabulary-version.ts
//
// The knkeditor vocabulary version a Resolved Spec needs (ADR-0020): the
// highest `minimumVocabularyVersion` among the Text Types it pins (#216).
// Versions compare as knkeditor's `CompareVersions` compares them — semantic
// versions by precedence (semver 2.0.0) — so TS and Go fill in the same
// `vocabulary`.

import { isPlainObject } from "./unset";

/** The kind of a Pin naming a Text Type Release: `rich_text`'s `text_type`. */
export const TEXT_TYPE_KIND = "text_type";

const VERSION =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface ParsedVersion {
	core: [number, number, number];
	pre: string[];
}

function parseVersion(text: string): ParsedVersion | null {
	const match = VERSION.exec(text);
	if (!match) return null;
	return {
		core: [Number(match[1]), Number(match[2]), Number(match[3])],
		pre: match[4] ? match[4].split(".") : [],
	};
}

/** Whether `text` is a semantic version, as knkeditor reads one. */
export function isSemanticVersion(text: string): boolean {
	return parseVersion(text) !== null;
}

/** Compares two semantic versions by precedence: negative when `a` is lower,
 * positive when higher, 0 when equal. Both must be semantic versions. */
export function compareVersions(a: string, b: string): number {
	const x = parseVersion(a);
	const y = parseVersion(b);
	if (!x || !y) throw new Error(`not a semantic version: ${!x ? a : b}`);
	for (let i = 0; i < 3; i++) {
		if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
	}
	// A pre-release is lower than its release.
	if (x.pre.length === 0 || y.pre.length === 0) {
		return y.pre.length - x.pre.length;
	}
	for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		const pn = /^\d+$/.test(p);
		const qn = /^\d+$/.test(q);
		if (pn && qn) {
			if (Number(p) !== Number(q)) return Number(p) < Number(q) ? -1 : 1;
		} else if (pn !== qn) {
			return pn ? -1 : 1;
		} else if (p !== q) {
			return p < q ? -1 : 1;
		}
	}
	return x.pre.length - y.pre.length;
}

/**
 * The `minimumVocabularyVersion` a Text Type part states: a string, or
 * `null` when it states none. `undefined` for a part TS cannot read as a Text
 * Type — not an object, or a minimum that is neither `null` nor a semantic
 * version — which resolution refuses as `resolve_invalid_release`.
 *
 * Go reads the part with knkeditor's `ParseTextType`, which also refuses a
 * Text Type without exactly its three keys; TS checks only what it needs
 * here, so a malformed Text Type Go refuses may resolve in TS.
 */
export function textTypeMinimum(part: unknown): string | null | undefined {
	if (!isPlainObject(part)) return undefined;
	const minimum = part.minimumVocabularyVersion;
	if (minimum === undefined || minimum === null) return null;
	if (typeof minimum !== "string" || !isSemanticVersion(minimum)) {
		return undefined;
	}
	return minimum;
}

/** The higher of two vocabulary versions, `""` being none. */
export function higherVocabulary(a: string, b: string): string {
	if (a === "") return b;
	if (b === "") return a;
	return compareVersions(b, a) > 0 ? b : a;
}
