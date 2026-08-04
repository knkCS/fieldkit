// src/schema/locked-settings.ts
import type { LockedSetting } from "./types";

/**
 * Reading and honouring `FieldConfig.locked_settings` (ADR-0011).
 *
 * Both functions take the list rather than the Field, so the editor — which
 * holds the list in a context and no longer has the Field to hand — and the
 * panel, which does, can share them. Zero React, like the rest of `/schema`.
 */

/** Whether a value is shaped like a `LockedSetting`.
 *
 * The list arrives as JSON from a Consumer and nothing validates it —
 * `validateSpec()` has no way to know what a Consumer meant to freeze — so a
 * stray entry must cost that entry and nothing else. */
function isLockedSetting(value: unknown): value is LockedSetting {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as LockedSetting).key === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The entry freezing `key`, or `undefined` when nothing does.
 *
 * A missing `reason` still freezes: the reason is what the Author reads, the
 * entry is what the Consumer meant, and a typo in the prose must not quietly
 * hand back an editable control over a setting that strands data.
 */
export function findLockedSetting(
	lockedSettings: LockedSetting[] | undefined,
	key: string,
): LockedSetting | undefined {
	if (!Array.isArray(lockedSettings)) return undefined;
	return lockedSettings.find(
		(entry) => isLockedSetting(entry) && entry.key === key,
	);
}

/**
 * `next` with every frozen key put back to the value it already had — the
 * write half of the lock.
 *
 * The config panel applies this to every settings write, so honouring the list
 * is what a settings editor gets for free and ignoring it takes deliberate
 * effort. A settings editor that never checks the list renders an editable
 * control over a frozen setting (the failure ADR-0011 predicts, and one only a
 * Consumer's own component can still reach) — but the edit it produces cannot
 * land.
 *
 * A frozen key the Field never set is **deleted** rather than written back as
 * `undefined`: unset and set-to-something are different settings throughout
 * this package, and `undefined` does not survive serialisation. A `next` that
 * is not a record at all cannot carry the frozen key through, so `current` is
 * kept whole instead.
 */
export function restoreLockedSettings<S>(
	lockedSettings: LockedSetting[] | undefined,
	current: S,
	next: S,
): S {
	if (!Array.isArray(lockedSettings) || lockedSettings.length === 0)
		return next;
	const frozen = lockedSettings.filter(isLockedSetting);
	if (frozen.length === 0) return next;
	if (!isRecord(next)) return current;

	const before: Record<string, unknown> = isRecord(current) ? current : {};
	const restored: Record<string, unknown> = { ...next };
	for (const { key } of frozen) {
		if (key in before) restored[key] = before[key];
		else delete restored[key];
	}
	return restored as S;
}
