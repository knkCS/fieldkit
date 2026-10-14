// src/test/fake-picker-adapters.ts
import { vi } from "vitest";
import type {
	FieldKitAdapters,
	PickerPage,
	PickerResolveQuery,
	PickerSearchQuery,
	ResolvedChoice,
} from "../renderer/adapters";

/** One choice in a fake source: what the setting stores, what it is called,
 * and whether the Consumer has archived it. */
export interface FakeChoice {
	id: string;
	name: string;
	archived?: boolean;
}

export interface FakePickerSourceOptions {
	/** Everything the source holds. Archived ones are never searchable, only
	 * resolvable — what ADR-0027 asks of a Consumer. */
	choices: FakeChoice[];
	/** How many choices one page holds. */
	pageSize?: number;
	/** Rejects every search with this error while set — flip `failing.current`
	 * to make a retry succeed. */
	failing?: { current: Error | null };
	/** Rejects every resolve with this error while set. */
	resolveFailing?: { current: Error | null };
}

/**
 * An in-memory source for a picker: `search` matches names case-insensitively,
 * pages by an opaque cursor (the offset, as a string), and leaves archived
 * choices out; `resolve` names any id it holds, archived included. Both are
 * `vi.fn`s, so a test reads the `purpose`, `query` and `cursor` it was asked
 * with.
 */
export function createFakePickerSource({
	choices,
	pageSize = 50,
	failing,
	resolveFailing,
}: FakePickerSourceOptions) {
	const search = vi.fn(
		async (
			query: PickerSearchQuery & { purpose?: string },
		): Promise<PickerPage<{ id: string; name: string }>> => {
			if (failing?.current) throw failing.current;
			const matching = choices.filter(
				(choice) =>
					!choice.archived &&
					choice.name.toLowerCase().includes(query.query.toLowerCase()),
			);
			const start = query.cursor ? Number(query.cursor) : 0;
			const end = start + pageSize;
			return {
				items: matching.slice(start, end).map(({ id, name }) => ({ id, name })),
				nextCursor: end < matching.length ? String(end) : null,
			};
		},
	);
	const resolve = vi.fn(
		async ({
			ids,
		}: PickerResolveQuery): Promise<
			ResolvedChoice<{ id: string; name: string }>[]
		> => {
			if (resolveFailing?.current) throw resolveFailing.current;
			return choices.filter((choice) => ids.includes(choice.id));
		},
	);
	return { search, resolve };
}

/** A `blueprint` Adapter over a fake source, `getSchema` answering nothing. */
export function fakeBlueprintAdapter(
	source: ReturnType<typeof createFakePickerSource>,
): NonNullable<FieldKitAdapters["blueprint"]> {
	return {
		getSchema: vi.fn().mockResolvedValue([]),
		getData: vi.fn(),
		search: source.search,
		resolve: source.resolve,
	};
}

/** A `textType` Adapter over a fake source. */
export function fakeTextTypeAdapter(
	source: ReturnType<typeof createFakePickerSource>,
): NonNullable<FieldKitAdapters["textType"]> {
	return { get: vi.fn(), search: source.search, resolve: source.resolve };
}
