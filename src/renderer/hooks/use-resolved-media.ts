import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem, ResolvedMediaItem } from "../adapters";

type Resolve = (ids: string[]) => Promise<ResolvedMediaItem[]>;

export interface ResolvedMedia {
	/** The named asset behind an id, or undefined while it is unnamed — not
	 * yet answered, left out of the answer, or never asked (no `resolve`). */
	item: (id: string) => ResolvedMediaItem | undefined;
	/** Whether any of the ids is still waiting for `resolve`'s answer. */
	pending: boolean;
	/** Names an asset the control already holds in full — one it just
	 * uploaded or picked — so it is never asked for. */
	remember: (item: MediaItem) => void;
}

/**
 * Names stored media ids through the adapter's optional `resolve`
 * (ADR-0029), shared by the media field and its table cell.
 *
 * Each id is asked for once per mount, in one batch per change of the ids:
 * an id the answer leaves out — and every id of a call that failed — is
 * settled as unnamed and shows as itself, the degrade ADR-0009 gives every
 * stored id. Without `resolve` nothing is asked and nothing is pending.
 *
 * The resolver is read through a ref, so a Consumer that builds its adapters
 * inline (a fresh `resolve` every render) asks no second time.
 */
export function useResolvedMedia(
	resolve: Resolve | undefined,
	ids: readonly string[],
	onError?: (error: unknown) => void,
): ResolvedMedia {
	const [known, setKnown] = useState<ReadonlyMap<string, ResolvedMediaItem>>(
		() => new Map(),
	);
	const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
	const asked = useRef(new Set<string>());
	const latest = useRef({ resolve, onError });
	useEffect(() => {
		latest.current = { resolve, onError };
	});

	const hasResolve = typeof resolve === "function";
	const key = ids.join("\u0000");

	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `ids`' identity by content; the resolver is read through the ref
	useEffect(() => {
		const current = latest.current.resolve;
		if (!current) return;
		const missing = [...new Set(ids)].filter(
			(id) => id !== "" && !asked.current.has(id),
		);
		if (missing.length === 0) return;
		for (const id of missing) asked.current.add(id);

		const settle = () =>
			setSettled((prev) => {
				const next = new Set(prev);
				for (const id of missing) next.add(id);
				return next;
			});
		Promise.resolve()
			.then(() => current(missing))
			.then(
				(items) => {
					// An answer that is not a list names nothing; its ids show as
					// themselves rather than staying pending for good.
					if (!Array.isArray(items)) return;
					setKnown((prev) => {
						const next = new Map(prev);
						for (const item of items) if (item?.id) next.set(item.id, item);
						return next;
					});
				},
				(error: unknown) => latest.current.onError?.(error),
			)
			.finally(settle);
	}, [key, hasResolve]);

	const remember = useCallback((item: MediaItem) => {
		asked.current.add(item.id);
		setKnown((prev) => new Map(prev).set(item.id, item));
	}, []);

	const item = useCallback((id: string) => known.get(id), [known]);

	const pending =
		hasResolve &&
		ids.some((id) => id !== "" && !known.has(id) && !settled.has(id));

	return { item, pending, remember };
}

/** The asset ids a media value holds — anything that is not a non-empty
 * string is not one. */
export function storedMediaIds(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((id): id is string => typeof id === "string" && id !== "")
		: [];
}

/** "application/pdf · 1.2 MB" — the type and size a file is told apart by. */
export function describeMedia(item: MediaItem): string {
	return [item.mime_type, formatFileSize(item.size)]
		.filter((part) => part)
		.join(" · ");
}

/** A file size as people read it: bytes, then KB, MB, GB at 1024. */
export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
