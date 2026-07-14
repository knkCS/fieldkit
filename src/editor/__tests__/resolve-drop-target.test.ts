// src/editor/__tests__/resolve-drop-target.test.ts
import { describe, expect, it } from "vitest";
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { flatInsertIndex } from "../draft-ops";
import { resolveDropTarget } from "../resolve-drop-target";
import { makeCard, makeField, makeSection } from "./editor-helpers";

const resolve = (activeId: string, overId: string, schema: Schema) =>
	resolveDropTarget(
		activeId,
		overId,
		schema,
		partitionSchemaBySections(schema),
	);

describe("resolveDropTarget — field moves", () => {
	const flat: Schema = [makeField("a"), makeField("b"), makeField("c")];

	it("downward drag onto a field: splice at the target, line below it", () => {
		expect(resolve("a", "b", flat)).toEqual({
			kind: "field",
			fromIndex: 0,
			targetIndex: 1,
			indicatorIndex: 2,
			indicator: { tabIndex: 0, position: 2 },
			tintCardAccessor: null,
		});
	});

	it("upward drag onto a field: splice at the target, line above it", () => {
		expect(resolve("c", "a", flat)).toEqual({
			kind: "field",
			fromIndex: 2,
			targetIndex: 0,
			indicatorIndex: 0,
			indicator: { tabIndex: 0, position: 0 },
			tintCardAccessor: null,
		});
	});

	it("self drop resolves to null", () => {
		expect(resolve("a", "a", flat)).toBeNull();
	});

	it("unknown over id resolves to null", () => {
		expect(resolve("a", "nope", flat)).toBeNull();
	});
});

describe("resolveDropTarget — card-marker snap (fields into cards)", () => {
	const carded: Schema = [
		makeCard("m0", "One"),
		makeField("f1"),
		makeField("f2"),
		makeCard("m3", "Two"),
		makeField("f4"),
	];

	it("upward drag onto a marker snaps INSIDE the card: line + tint at its top", () => {
		expect(resolve("f4", "m0", carded)).toEqual({
			kind: "field",
			fromIndex: 4,
			targetIndex: 1,
			indicatorIndex: 1,
			indicator: { tabIndex: 0, position: 1 },
			tintCardAccessor: "m0",
		});
	});

	it("downward drag onto a marker lands inside too (splice right after it)", () => {
		expect(resolve("f1", "m3", carded)).toEqual({
			kind: "field",
			fromIndex: 1,
			targetIndex: 3,
			indicatorIndex: 4,
			indicator: { tabIndex: 0, position: 4 },
			tintCardAccessor: "m3",
		});
	});

	it("a card's first field onto its own marker is a NO-MOVE — null, no line", () => {
		// Pre-0.11 this applied moveField(1, 1), which returns the schema
		// reference unchanged — same end state, but returning null keeps the
		// live feedback honest (no line for a drop that moves nothing).
		expect(resolve("f1", "m0", carded)).toBeNull();
	});

	it("dropping into an EMPTY card resolves inside it", () => {
		const withEmpty: Schema = [
			makeCard("m0", "Empty"),
			makeCard("m1", "Full"),
			makeField("f1"),
		];
		expect(resolve("f1", "m0", withEmpty)).toEqual({
			kind: "field",
			fromIndex: 2,
			targetIndex: 1,
			indicatorIndex: 1,
			indicator: { tabIndex: 0, position: 1 },
			tintCardAccessor: "m0",
		});
	});

	it("indicator speaks the boundary dialect: flatInsertIndex round-trips", () => {
		const target = resolve("f4", "m0", carded);
		expect(target?.kind).toBe("field");
		if (target?.kind !== "field" || !target.indicator) {
			throw new Error("unreachable");
		}
		expect(
			flatInsertIndex(
				carded,
				partitionSchemaBySections(carded),
				target.indicator.tabIndex,
				target.indicator.position,
			),
		).toBe(target.indicatorIndex);
	});
});

describe("resolveDropTarget — tab triggers", () => {
	const sectioned: Schema = [
		makeField("a"),
		makeSection("s1", "SEO"),
		makeField("b"),
	];

	it("another tab's trigger resolves to a tab target", () => {
		expect(resolve("a", "tabdrop-1", sectioned)).toEqual({
			kind: "tab",
			tabIndex: 1,
		});
	});

	it("the field's OWN tab trigger resolves to null (self-tab guard)", () => {
		expect(resolve("a", "tabdrop-0", sectioned)).toBeNull();
	});
});

describe("resolveDropTarget — card block drags", () => {
	const carded: Schema = [
		makeCard("m0", "One"),
		makeField("f1"),
		makeField("f2"),
		makeCard("m3", "Two"),
		makeField("f4"),
	];

	it("card over a later card's field: block lands AFTER that card", () => {
		expect(resolve("m0", "f4", carded)).toEqual({
			kind: "card-block",
			targetCardAccessor: "m3",
			placement: "after",
		});
	});

	it("card over an earlier field: block lands BEFORE its owning card", () => {
		expect(resolve("m3", "f1", carded)).toEqual({
			kind: "card-block",
			targetCardAccessor: "m0",
			placement: "before",
		});
	});

	it("card over a marker targets that card directly", () => {
		expect(resolve("m0", "m3", carded)).toEqual({
			kind: "card-block",
			targetCardAccessor: "m3",
			placement: "after",
		});
	});

	it("card over its OWN contained field is a no-op", () => {
		expect(resolve("m0", "f1", carded)).toBeNull();
	});

	it("card over a tab trigger is a no-op (marker-orphan guard)", () => {
		expect(resolve("m0", "tabdrop-1", carded)).toBeNull();
	});

	it("cross-tab card targets are a no-op (v1 guard)", () => {
		const crossTab: Schema = [
			makeCard("c1", "One"),
			makeField("a"),
			makeSection("s1", "SEO"),
			makeCard("c2", "Two"),
			makeField("b"),
		];
		expect(resolve("c1", "b", crossTab)).toBeNull();
	});
});
