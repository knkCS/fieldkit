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
});
