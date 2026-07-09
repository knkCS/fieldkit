/**
 * Key-order-insensitive deep equality for JSON-shaped values (#37).
 * Postgres jsonb re-orders object keys on read-back, so the draft
 * baseline/echo comparison must not depend on key order. Arrays stay
 * order-sensitive (field order is meaning). `undefined`-valued keys are
 * treated as absent — parity with JSON.stringify/jsonb round-trips, which
 * drop them. Editor-internal; not a public export.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		return a.every((item, i) => deepEqual(item, b[i]));
	}
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	const ra = a as Record<string, unknown>;
	const rb = b as Record<string, unknown>;
	const keysA = Object.keys(ra).filter((k) => ra[k] !== undefined);
	const keysB = Object.keys(rb).filter((k) => rb[k] !== undefined);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((k) => rb[k] !== undefined && deepEqual(ra[k], rb[k]));
}
