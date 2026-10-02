import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { canonicalSpecSettings } from "../../schema/unset";
import { removeField } from "../draft-ops";
import { useSpecDraft } from "../use-spec-draft";

const textPlugin: FieldTypePlugin = {
	id: "text",
	name: "Text",
	description: "",
	icon: () => null,
	category: "text",
	fieldComponent: () => null,
	toZodType: () => z.string(),
};

function f(accessor: string): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

/** Recursively rebuilds objects with reversed key order — simulates a
 * Postgres jsonb round-trip, which preserves content but not key order. */
function reorderKeys<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(reorderKeys) as unknown as T;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		return Object.fromEntries(
			entries.reverse().map(([k, v]) => [k, reorderKeys(v)]),
		) as T;
	}
	return value;
}

describe("useSpecDraft", () => {
	it("seeds from schema, not dirty", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], vi.fn()),
		);
		expect(result.current.draft).toHaveLength(1);
		expect(result.current.dirty).toBe(false);
	});

	it("apply makes it dirty; save commits and resets dirty", async () => {
		const onCommit = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a"), f("b")], [textPlugin], onCommit),
		);
		act(() => result.current.apply(removeField(result.current.draft, "b")));
		expect(result.current.dirty).toBe(true);
		await act(async () => result.current.save());
		expect(onCommit).toHaveBeenCalledWith([
			expect.objectContaining({
				config: expect.objectContaining({ api_accessor: "a" }),
			}),
		]);
		expect(result.current.dirty).toBe(false);
	});

	it("commits settings in canonical form, Unset settings stripped (ADR-0021)", async () => {
		const onCommit = vi.fn();
		const withSettings: Field = {
			...f("b"),
			settings: { placeholder: "", prepend: "€", append: null },
		};
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], onCommit),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([f("a"), withSettings]));
		await act(async () => result.current.save());

		const committed = onCommit.mock.calls[0][0] as Schema;
		expect("settings" in committed[0]).toBe(false);
		expect(committed[1].settings).toStrictEqual({ prepend: "€" });
		// The draft keeps what the author's controls hold.
		expect(result.current.draft[1].settings).toEqual(withSettings.settings);

		// The host echoing the canonical commit back is our own save, not a
		// change made in the background.
		rerender({ schema: committed });
		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(false);
	});

	it("stays dirty and exposes saveError when async onCommit rejects", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("api down"));
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], onCommit),
		);
		act(() => result.current.apply([]));
		await act(async () => result.current.save());
		expect(result.current.dirty).toBe(true);
		expect(result.current.saveError).toBeInstanceOf(Error);
	});

	it("discard restores the schema prop", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a"), f("b")], [textPlugin], vi.fn()),
		);
		act(() => result.current.apply(removeField(result.current.draft, "b")));
		act(() => result.current.discard());
		expect(result.current.draft).toHaveLength(2);
		expect(result.current.dirty).toBe(false);
	});

	it("content-equal schema with new identity does NOT reset a dirty draft", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([]));
		rerender({ schema: [f("a")] }); // fresh array, same content
		expect(result.current.draft).toHaveLength(0);
		expect(result.current.dirty).toBe(true);
	});

	it("content-changed schema resets a CLEAN draft", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		rerender({ schema: [f("x")] });
		expect(result.current.draft[0].config.api_accessor).toBe("x");
		expect(result.current.dirty).toBe(false);
	});

	it("content-changed schema KEEPS a dirty draft (work survives a refetch)", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([f("a"), f("mine")]));
		rerender({ schema: [f("x")] });
		expect(result.current.draft.map((x) => x.config.api_accessor)).toEqual([
			"a",
			"mine",
		]);
		expect(result.current.dirty).toBe(true);
	});

	it("content-changed schema while dirty sets baselineConflict; discard clears it", () => {
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: [f("a")] as Schema } },
		);
		act(() => result.current.apply([f("a"), f("mine")]));
		expect(result.current.baselineConflict).toBe(false);

		rerender({ schema: [f("x")] });
		expect(result.current.dirty).toBe(true);
		expect(result.current.baselineConflict).toBe(true);

		act(() => result.current.discard());
		expect(result.current.baselineConflict).toBe(false);
	});

	it("save is a no-op while the draft is invalid", async () => {
		const onCommit = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], onCommit),
		);
		act(() => result.current.apply([f("dup"), f("dup")]));
		expect(result.current.validation.valid).toBe(false);
		await act(async () => result.current.save());
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("notifies onDirtyChange", () => {
		const onDirty = vi.fn();
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], vi.fn(), onDirty),
		);
		act(() => result.current.apply([]));
		expect(onDirty).toHaveBeenLastCalledWith(true);
	});

	it("calls the LATEST onDirtyChange without re-firing on identity churn", () => {
		const calls: Array<[string, boolean]> = [];
		const { result, rerender } = renderHook(
			({ tag }: { tag: string }) =>
				useSpecDraft(
					[f("a")],
					[textPlugin],
					vi.fn(),
					// Deliberately unmemoized callback — a new identity every render.
					(d) => calls.push([tag, d]),
				),
			{ initialProps: { tag: "a" } },
		);
		const before = calls.length;

		// Re-render with a NEW callback identity but unchanged dirty state:
		// must NOT re-fire the notification.
		rerender({ tag: "b" });
		expect(calls.length).toBe(before);

		// When dirty DOES flip, the LATEST callback (tag "b") is invoked, not
		// a stale one captured by an earlier render's effect closure.
		act(() => result.current.apply([]));
		expect(calls[calls.length - 1]).toEqual(["b", true]);
	});

	it("apply accepts a functional updater applied against the CURRENT draft", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a"), f("b")], [textPlugin], vi.fn()),
		);
		act(() => result.current.apply((draft) => removeField(draft, "b")));
		expect(result.current.draft.map((x) => x.config.api_accessor)).toEqual([
			"a",
		]);
		expect(result.current.dirty).toBe(true);

		// A second updater call sees the result of the first, not a stale
		// closure over the original draft.
		act(() => result.current.apply((draft) => [...draft, f("c")]));
		expect(result.current.draft.map((x) => x.config.api_accessor)).toEqual([
			"a",
			"c",
		]);
	});

	it("exposes a pluginMap built from the plugins array", () => {
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], vi.fn()),
		);
		expect(result.current.pluginMap.get("text")).toBe(textPlugin);
		expect(result.current.pluginMap.size).toBe(1);
	});

	it("apply clears saveError", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("api down"));
		const { result } = renderHook(() =>
			useSpecDraft([f("a")], [textPlugin], onCommit),
		);
		act(() => result.current.apply([f("b")]));
		await act(async () => result.current.save());
		expect(result.current.saveError).toBeInstanceOf(Error);
		act(() => result.current.apply([]));
		expect(result.current.saveError).toBeNull();
	});

	it("a mid-flight save that succeeds after discard advances the baseline to the committed snapshot", async () => {
		let resolve!: () => void;
		const onCommit = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		// Stable prop identity, as with a consumer holding schema in state.
		const b0: Schema = [f("a")];
		const { result } = renderHook(() =>
			useSpecDraft(b0, [textPlugin], onCommit),
		);
		const d1: Schema = [f("a"), f("b")];
		act(() => result.current.apply(d1));
		act(() => {
			void result.current.save(); // in flight, NOT awaited
		});
		act(() => result.current.discard()); // back to B0, clean for now
		expect(result.current.dirty).toBe(false);
		await act(async () => {
			resolve();
		});
		// Committed in canonical form: f()'s `settings: null` is absent.
		expect(onCommit).toHaveBeenCalledWith(canonicalSpecSettings(d1));
		// The server now holds D1; baseline truthfully advanced to it, so
		// the reverted draft (B0) reads dirty against the committed content.
		expect(result.current.dirty).toBe(true);
		act(() => result.current.discard());
		expect(result.current.draft).toEqual(d1);
		expect(result.current.dirty).toBe(false);
	});

	it("a background schema update matching the current draft's exact content adopts it as the baseline without a false conflict (F6)", async () => {
		// Reproduces a synchronous onCommit (e.g. onCommit={setSchema}) racing
		// ahead of save()'s own post-await setBaseline(draft): the `schema` prop
		// can echo the draft's exact content before save()'s continuation has
		// advanced `baseline`, while `dirty` is still (truthfully, at that
		// instant) true. The old guard treated that as a genuine background
		// conflict and fired the warning toast on every ordinary save.
		let resolve!: () => void;
		const onCommit = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		const b0: Schema = [f("a")];
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], onCommit),
			{ initialProps: { schema: b0 as Schema } },
		);
		const d1: Schema = [f("a"), f("b")];
		act(() => result.current.apply(d1));

		act(() => {
			void result.current.save(); // in flight, NOT resolved yet
		});

		// The host's onCommit echoes the draft back as `schema` — same content
		// (here, the exact same reference, mirroring onCommit={setSchema}) —
		// while save()'s own baseline advance is still pending.
		rerender({ schema: d1 });

		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(false);

		await act(async () => {
			resolve();
		});
		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(false);
	});

	it("adopts a key-reordered echo of the baseline silently (jsonb round-trip)", () => {
		const b0: Schema = [f("a")];
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: b0 as Schema } },
		);

		// A backend that stores the schema in Postgres jsonb echoes it back
		// with re-ordered object keys — same content, new identity.
		rerender({ schema: reorderKeys(structuredClone(b0)) });

		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(false);
		expect(result.current.draft).toBe(b0);
	});

	it("does not flag baselineConflict for a reordered echo while dirty", () => {
		const b0: Schema = [f("a")];
		const { result, rerender } = renderHook(
			({ schema }) => useSpecDraft(schema, [textPlugin], vi.fn()),
			{ initialProps: { schema: b0 as Schema } },
		);
		const edited: Schema = [f("a"), f("mine")];
		act(() => result.current.apply(edited));

		// A key-reordered echo of the ORIGINAL baseline arrives while the
		// author still has unsaved edits — this must not read as a genuine
		// background conflict, only a jsonb round-trip of stale content.
		rerender({ schema: reorderKeys(structuredClone(b0)) });

		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(true);
		expect(result.current.draft).toBe(edited);
	});
});

// fieldkit#315: a host that saves from its own page header owns the commit.
// It reads the draft through onDraftChange, the validation through
// onValidationChange, and says "committed" by passing the saved content back
// as the `schema` prop.
describe("useSpecDraft — a host-owned commit", () => {
	function hostHook(initial: Schema) {
		const onDraftChange = vi.fn();
		const onValidationChange = vi.fn();
		const onDirtyChange = vi.fn();
		const hook = renderHook(
			({ schema }: { schema: Schema }) =>
				useSpecDraft(schema, [textPlugin], undefined, onDirtyChange, {
					onDraftChange,
					onValidationChange,
				}),
			{ initialProps: { schema: initial } },
		);
		return { ...hook, onDraftChange, onValidationChange, onDirtyChange };
	}

	it("hands the host every draft change, canonical, and nothing on mount", () => {
		const { result, onDraftChange } = hostHook([f("a")]);
		expect(onDraftChange).not.toHaveBeenCalled();

		const withSettings: Field = {
			...f("b"),
			settings: { placeholder: "", prepend: "€" },
		};
		act(() => result.current.apply([f("a"), withSettings]));

		expect(onDraftChange).toHaveBeenCalledTimes(1);
		expect(onDraftChange).toHaveBeenLastCalledWith(
			canonicalSpecSettings([f("a"), withSettings]),
		);

		act(() => result.current.discard());
		expect(onDraftChange).toHaveBeenCalledTimes(2);
		expect(onDraftChange).toHaveBeenLastCalledWith(
			canonicalSpecSettings([f("a")]),
		);
	});

	it("reports the validation on mount and on every change", () => {
		const { result, onValidationChange } = hostHook([f("a")]);
		expect(onValidationChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ valid: true }),
		);

		act(() => result.current.apply([f("a"), f("a")]));
		expect(onValidationChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				valid: false,
				fieldErrors: expect.arrayContaining([
					expect.objectContaining({ code: "duplicate_accessor" }),
				]),
			}),
		);
	});

	it("the host passing the saved draft back as `schema` makes the draft clean, and keeps the draft as it is", () => {
		const { result, rerender, onDraftChange, onDirtyChange } = hostHook([
			f("a"),
		]);
		const edited = [f("a"), f("b")];
		act(() => result.current.apply(edited));
		expect(result.current.dirty).toBe(true);

		// The host saves what it was handed (a canonical copy) and passes the
		// stored content back — key order reshuffled, as a jsonb echo is.
		const saved = reorderKeys(onDraftChange.mock.lastCall?.[0] as Schema);
		rerender({ schema: saved });

		expect(result.current.dirty).toBe(false);
		expect(result.current.baselineConflict).toBe(false);
		// The draft is the author's own, not the host's copy: controls still
		// holding an Unset value keep it.
		expect(result.current.draft).toBe(edited);
		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
	});

	it("edits made while the host's save is in flight stay dirty, with no conflict, and Discard returns to what was saved", () => {
		const { result, rerender, onDraftChange } = hostHook([f("a")]);
		act(() => result.current.apply([f("a"), f("b")]));
		const sent = onDraftChange.mock.lastCall?.[0] as Schema;

		// The author keeps editing before the host's save resolves.
		act(() => result.current.apply([f("a"), f("b"), f("c")]));
		rerender({ schema: structuredClone(sent) });

		expect(result.current.baselineConflict).toBe(false);
		expect(result.current.dirty).toBe(true);
		expect(result.current.draft).toHaveLength(3);

		act(() => result.current.discard());
		expect(result.current.draft.map((x) => x.config.api_accessor)).toEqual([
			"a",
			"b",
		]);
		expect(result.current.dirty).toBe(false);
	});

	it("a genuine background change while dirty is still a conflict", () => {
		const { result, rerender } = hostHook([f("a")]);
		act(() => result.current.apply([f("a"), f("b")]));
		rerender({ schema: [f("z")] });
		expect(result.current.baselineConflict).toBe(true);
		expect(result.current.dirty).toBe(true);
	});
});
