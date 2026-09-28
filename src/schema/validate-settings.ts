// src/schema/validate-settings.ts
import type { ZodIssue, ZodTypeAny } from "zod";

/**
 * The codes settings validation reports. Part of the data contract, shared
 * with the Go module: a code is only ever added, never renamed or removed
 * (ADR-0019).
 */
export type SettingsErrorCode =
	/** A settings key the type's `settingsSchema` does not declare. */
	| "unknown_setting"
	/** A declared setting whose value the schema refuses — a wrong type, or a
	 * number out of range. */
	| "invalid_setting";

/** One settings error: where, and which rule. `path` is a `/`-separated
 * pointer into the settings object (`""` is the settings themselves). */
export interface SettingsError {
	path: string;
	code: SettingsErrorCode;
}

/**
 * Whether a value is **Unset** — absent, `null`, `""`, `[]` or `{}`
 * (ADR-0021). `0` and `false` are values.
 */
export function isUnset(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "object") return Object.keys(value).length === 0;
	return false;
}

/** Escapes one path segment the way RFC 6901 does, so an Accessor or a key
 * holding `/` or `~` still reads back as one segment. */
export function escapePathSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Joins segments into a `/`-separated path: `""` for none. */
export function toPath(segments: readonly (string | number)[]): string {
	return segments.map((s) => `/${escapePathSegment(String(s))}`).join("");
}

/**
 * Checks one Field's `settings` against its type's `settingsSchema`, with the
 * same answers the Go module's `ValidateSettings` gives (ADR-0018).
 *
 * A setting whose value is Unset is treated as absent before the schema sees
 * it, so `{ placeholder: null }` is `{}` and an unknown key holding `""` is
 * no key at all (ADR-0021). Unset `settings` as a whole are `{}`.
 *
 * Each `{path, code}` is reported once, however many Zod issues produced it —
 * `-1.5` for a non-negative integer is one `invalid_setting`, not two — so the
 * answer does not depend on how many checks a schema happens to stack.
 */
export function validateSettings(
	schema: ZodTypeAny,
	settings: unknown,
): SettingsError[] {
	const result = schema.safeParse(withoutUnset(settings));
	if (result.success) return [];

	const errors: SettingsError[] = [];
	const seen = new Set<string>();
	const push = (path: string, code: SettingsErrorCode) => {
		const key = `${code}\u0000${path}`;
		if (seen.has(key)) return;
		seen.add(key);
		errors.push({ path, code });
	};
	for (const issue of result.error.issues) {
		for (const error of fromIssue(issue)) push(error.path, error.code);
	}
	return errors;
}

function fromIssue(issue: ZodIssue): SettingsError[] {
	if (issue.code === "unrecognized_keys") {
		return issue.keys.map((key) => ({
			path: toPath([...issue.path, key]),
			code: "unknown_setting",
		}));
	}
	return [{ path: toPath(issue.path), code: "invalid_setting" }];
}

function withoutUnset(settings: unknown): unknown {
	const canonical = stripUnset(settings);
	return isUnset(canonical) ? {} : canonical;
}

/**
 * Drops every object key whose value is Unset, at every depth, deepest first —
 * so `{ a: { b: null } }` loses `a` too. Array elements are kept, Unset or
 * not: `[null]` holds one element, and is not `[]`.
 */
function stripUnset(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripUnset);
	if (typeof value !== "object" || value === null) return value;
	const kept: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		const canonical = stripUnset(child);
		if (!isUnset(canonical)) kept[key] = canonical;
	}
	return kept;
}
