import { describe, expect, it } from "vitest";
import { deepEqual } from "../deep-equal";

describe("deepEqual", () => {
	it("compares primitives with Object.is semantics", () => {
		expect(deepEqual(1, 1)).toBe(true);
		expect(deepEqual("a", "b")).toBe(false);
		expect(deepEqual(null, null)).toBe(true);
		expect(deepEqual(null, undefined)).toBe(false);
		expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
	});

	it("is key-order-insensitive for objects, recursively", () => {
		const a = { x: 1, y: { p: "a", q: [1, 2] }, z: null };
		const b = { z: null, y: { q: [1, 2], p: "a" }, x: 1 };
		expect(deepEqual(a, b)).toBe(true);
	});

	it("is order-SENSITIVE for arrays (field order is meaning)", () => {
		expect(deepEqual([1, 2], [2, 1])).toBe(false);
		expect(deepEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toBe(true);
	});

	it("treats undefined-valued keys as absent (JSON round-trip parity)", () => {
		expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
		expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
		expect(deepEqual({ a: undefined }, { a: null })).toBe(false);
	});

	it("distinguishes object/array/primitive mismatches", () => {
		expect(deepEqual({}, [])).toBe(false);
		expect(deepEqual({ a: 1 }, null)).toBe(false);
		expect(deepEqual([1], { 0: 1 })).toBe(false);
		expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
	});
});
