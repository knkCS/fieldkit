import { useRef } from "react";

/**
 * The same value, held at one identity until its *contents* change.
 *
 * Effect dependencies compare by identity, and most of what the Reference
 * components depend on is a fresh literal on every render: a Consumer's
 * `settings.blueprints`, a list of ids derived from form state, a filter
 * record `useWatch` rebuilds each time. Depending on those directly re-runs
 * the effect forever; this is the one place that fix is written down.
 *
 * Compared by JSON, but what comes back is the caller's own value rather than
 * a re-parse of it. That distinction matters where the value is handed
 * onwards: a round-trip would quietly turn a `Date` into a string, drop
 * `undefined` entries and flatten a `Map`, inside a record fieldkit promised
 * to pass through untouched.
 *
 * A ref rather than `useMemo`, because the dependency here is the value's
 * *contents* and not the value — the one thing an exhaustive-deps list cannot
 * say. The write is a cache keyed by its own input, so it is idempotent for a
 * given render and safe to repeat.
 */
export function useStableValue<T>(value: T): T {
	const key = JSON.stringify(value ?? null);
	const held = useRef({ key, value });
	if (held.current.key !== key) held.current = { key, value };
	return held.current.value;
}
