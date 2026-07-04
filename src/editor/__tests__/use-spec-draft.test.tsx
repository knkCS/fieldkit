import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
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
		expect(onCommit).toHaveBeenCalledWith(d1);
		// The server now holds D1; baseline truthfully advanced to it, so
		// the reverted draft (B0) reads dirty against the committed content.
		expect(result.current.dirty).toBe(true);
		act(() => result.current.discard());
		expect(result.current.draft).toEqual(d1);
		expect(result.current.dirty).toBe(false);
	});
});
