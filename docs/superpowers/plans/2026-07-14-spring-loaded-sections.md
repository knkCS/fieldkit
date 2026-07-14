# Spring-Loaded Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-section drag-and-drop with exact-slot placement: dwell on a tab trigger springs the canvas to that section mid-drag; every cross-section drop ends in the target section with the moved item selected; card blocks gain cross-section moves (drag + menu).

**Architecture:** A `useSpringLoadedTab` hook owns the pointer dwell timer (keyboard switches instantly — that behavior already exists); `handleDragCancel`/null-target drops restore the drag-start tab; a `DragRemeasurer` child of `DndContext` re-measures droppable rects when the active tab changes mid-drag (the sprung tab's shells otherwise keep the zero rects measured while hidden — probe-verified dead); `resolveDropTarget` legitimizes card tab-targets and visible cross-tab card-block targets; a new `moveCardToSection` draft-op mirrors `moveFieldToSection`.

**Tech Stack:** React 19, @dnd-kit/core 6.3.1 (`useDndContext().measureDroppableContainers` — verified present in the installed `store/types.d.ts:81`), Vitest + @testing-library/react (jsdom), Biome.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-spring-loaded-sections-design.md` — the 7 locked decisions bind.
- Dwell: **one exported constant `SPRING_DWELL_MS = 500`** (pointer drags only; keyboard switches immediately — Decision 6).
- Escape mid-drag: schema untouched AND active tab restored to the drag-start tab. **A drop that resolves to null (no-op) also restores.** A successful drop stays on the target tab (Decision 4).
- Every cross-section drop (spring, quick trigger-drop, or menu) ends with: target tab active, moved item selected, its shell scrolled into view (Decision 3).
- **No new label keys** — the card menu reuses `moveToSection` (Decision 5). Frozen label keys must never be deleted.
- Hidden panels' droppables stay filtered (`isVisibleDroppable`) — accidental cross-tab moves must remain impossible (Decision 5).
- Drop semantics for same-tab drags are FROZEN — existing dnd/cards-canvas/drag-feedback end-state assertions must pass unchanged (only additions allowed).
- The F8 inert workaround block in `field-shell.tsx` must remain byte-identical. Semantic tokens only; `displayName` on all exported components; conventional commits (< 72 chars).
- Version lands at **0.12.0** in Task 4 only.
- Gates per task: run the named covering suites plus `npm run typecheck` and `npm run lint`, capturing exit codes explicitly (never pipe a gate through grep/tail/head).

## Ground truth (probe-verified 2026-07-14, `spring-groundtruth.mjs`)

1. `handleDragOver` (editor-canvas.tsx:567-588) already switches the active tab UNCONDITIONALLY and INSTANTLY when `over` is a `tabdrop-*` zone — visible tab flipped 120 ms after pointer-hover. The dwell must REPLACE this for pointer drags; keyboard keeps the instant switch.
2. Dragging INTO the sprung tab's canvas is dead: its shells were measured hidden (zero rects) at drag start, dnd-kit never re-measures on the panel swap, `visibleClosestCenter` filters zero rects → no `over`, no line, no tint, no drop. `measureDroppableContainers(ids)` on the public context is the deterministic fix.
3. Escape after a spring leaves the foreign tab active (no restore exists).
4. zag's Tabs hidden-swap can lag the React commit by ~47 ms under load (0.10.0 lesson) — re-measure must retry until the sprung panel is actually unhidden, not fire once post-commit.

---

### Task 1: Card cross-section logic (draft-op + resolution)

**Files:**
- Modify: `src/editor/draft-ops.ts` (add `moveCardToSection` after `moveFieldToSection`, ~line 383; the private `cardBlockRange` helper at ~line 385 already exists — reuse it)
- Modify: `src/editor/resolve-drop-target.ts:106-146` (card branch: tab targets + delete the cross-tab guard)
- Test: `src/editor/__tests__/draft-ops.test.ts` (append describe), `src/editor/__tests__/resolve-drop-target.test.ts` (append describe)

**Interfaces:**
- Consumes: `cardBlockRange(schema, cardAccessor): [number, number] | null` (private, same file); `partitionSchemaBySections`; existing `ResolvedDropTarget` variants.
- Produces: `moveCardToSection(schema: Schema, cardAccessor: string, tabIndex: number): Schema` — Tasks 2/3 call it from `handleDragEnd` and the card menu. `resolveDropTarget` now returns `{kind: "tab", tabIndex}` for a card over a FOREIGN tab trigger, `null` over its own; card-over-visible-foreign-card returns a normal `card-block` target (guard deleted).

- [ ] **Step 1: Write the failing draft-op tests**

Append to `src/editor/__tests__/draft-ops.test.ts` (reuse that file's existing fixture helpers — it builds fields/cards/sections inline; follow its local idiom for constructing `Field` objects; add `moveCardToSection` to the import from `../draft-ops`):

```ts
describe("moveCardToSection", () => {
	// [card c1: f1, f2] | section S: [card c2: f3]
	const schema = [
		makeCard("c1", "One"),
		makeField("f1"),
		makeField("f2"),
		makeSection("s1", "SEO"),
		makeCard("c2", "Two"),
		makeField("f3"),
	];

	it("moves the marker AND its fields to the end of the target section", () => {
		const next = moveCardToSection(schema, "c1", 1);
		expect(next.map((f) => f.config.api_accessor)).toEqual([
			"s1", "c2", "f3", "c1", "f1", "f2",
		]);
	});

	it("moves an empty card", () => {
		const withEmpty = [...schema, makeCard("c3", "Empty")]; // last block of tab 1
		const next = moveCardToSection(withEmpty, "c3", 0);
		expect(next.map((f) => f.config.api_accessor)).toEqual([
			"c1", "f1", "f2", "c3", "s1", "c2", "f3",
		]);
	});

	it("moves into an EMPTY section (right after its marker)", () => {
		const withEmptyTab = [...schema, makeSection("s2", "Empty tab")];
		const next = moveCardToSection(withEmptyTab, "c1", 2);
		expect(next.map((f) => f.config.api_accessor)).toEqual([
			"s1", "c2", "f3", "s2", "c1", "f1", "f2",
		]);
	});

	it("no-ops when the card already lives in the target tab", () => {
		expect(moveCardToSection(schema, "c1", 0)).toBe(schema);
	});

	it("no-ops on an unknown card accessor or missing tab", () => {
		expect(moveCardToSection(schema, "nope", 1)).toBe(schema);
		expect(moveCardToSection(schema, "c1", 9)).toBe(schema);
	});
});
```

If `draft-ops.test.ts` has no `makeCard`/`makeField`/`makeSection` helpers in scope, import them from `./editor-helpers` (they exist there — `editor-helpers.tsx` exports all three).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/editor/__tests__/draft-ops.test.ts` — expect FAIL: `moveCardToSection` is not exported.

- [ ] **Step 3: Implement `moveCardToSection`**

Add to `src/editor/draft-ops.ts` directly after `moveFieldToSection` (the `cardBlockRange` helper sits right below — forward-reference is fine, function declarations hoist):

```ts
/** Moves a card BLOCK (marker + fields, via cardBlockRange) to the END of
 * the target section — the card sibling of moveFieldToSection, sharing its
 * two-phase partition approach (find target tab before removal by index,
 * re-find after removal by section accessor). No-ops when the card already
 * lives in the target tab, or when card/tab don't resolve. */
export function moveCardToSection(
	schema: Schema,
	cardAccessor: string,
	tabIndex: number,
): Schema {
	const range = cardBlockRange(schema, cardAccessor);
	if (!range) return schema;
	const [start, end] = range;

	const originalPartition = partitionSchemaBySections(schema);
	const targetTab = originalPartition.tabs[tabIndex];
	if (!targetTab) return schema;
	const sourceTabIndex = originalPartition.tabs.findIndex((tab) =>
		tab.fields.some(
			(f) => f.field_type === "card" && f.config.api_accessor === cardAccessor,
		),
	);
	if (sourceTabIndex === tabIndex) return schema;

	const block = schema.slice(start, end);
	const without = [...schema.slice(0, start), ...schema.slice(end)];
	const partition = partitionSchemaBySections(without);
	const tab = partition.tabs.find((t) => {
		if (targetTab.section === null) return t.section === null;
		return (
			t.section?.config.api_accessor === targetTab.section.config.api_accessor
		);
	});
	if (!tab) return schema;
	// Flat index just after the tab's last field (or just after its marker
	// when empty) — identical dialect to moveFieldToSection.
	const lastOfTab = tab.fields[tab.fields.length - 1] ?? tab.section;
	if (!lastOfTab) return [...block, ...without]; // implicit empty first tab
	const insertAfter = without.findIndex(
		(f) => f.config.api_accessor === lastOfTab.config.api_accessor,
	);
	return [
		...without.slice(0, insertAfter + 1),
		...block,
		...without.slice(insertAfter + 1),
	];
}
```

Check the imports at the top of `draft-ops.ts` — `partitionSchemaBySections` is already imported (moveFieldToSection uses it).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/editor/__tests__/draft-ops.test.ts` — expect PASS.

- [ ] **Step 5: Write the failing resolution tests**

Append to `src/editor/__tests__/resolve-drop-target.test.ts` (reuse its existing fixture/builder idiom — read the file's head first; it constructs schemas + partitions and calls `resolveDropTarget(activeId, overId, draft, partition)` directly):

```ts
describe("card cross-section targets (0.12.0)", () => {
	// General: [card c1: f1] | SEO: [card c2: f2]
	const draft = [
		makeCard("c1", "One"),
		makeField("f1"),
		makeSection("s1", "SEO"),
		makeCard("c2", "Two"),
		makeField("f2"),
	];
	const partition = partitionSchemaBySections(draft);

	it("card over a FOREIGN tab trigger resolves a tab target", () => {
		expect(resolveDropTarget("c1", "tabdrop-1", draft, partition)).toEqual({
			kind: "tab",
			tabIndex: 1,
		});
	});

	it("card over its OWN tab trigger stays null (self-drop no-op)", () => {
		expect(resolveDropTarget("c1", "tabdrop-0", draft, partition)).toBeNull();
	});

	it("card over a foreign card resolves a card-block target (guard deleted — the sprung tab is visible)", () => {
		expect(resolveDropTarget("c1", "c2", draft, partition)).toEqual({
			kind: "card-block",
			targetCardAccessor: "c2",
			placement: "after",
		});
	});

	it("card over a foreign card's FIELD resolves to that card too", () => {
		expect(resolveDropTarget("c1", "f2", draft, partition)).toEqual({
			kind: "card-block",
			targetCardAccessor: "c2",
			placement: "after",
		});
	});
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/editor/__tests__/resolve-drop-target.test.ts` — expect FAIL on all four (tabdrop returns null for cards; cross-tab guard nulls the last two).

- [ ] **Step 7: Rewrite the resolveDropTarget card branch**

In `src/editor/resolve-drop-target.ts`, replace lines 106-146 (the card branch) with:

```ts
	// Card block move — checked BEFORE the shared tabdrop branch because a
	// card's OWN-tab trigger guard needs the card-aware source lookup.
	const activeField = draft.find((f) => f.config.api_accessor === activeId);
	if (activeField?.field_type === "card") {
		if (overId.startsWith("tabdrop-")) {
			const tabIndex = Number(overId.slice("tabdrop-".length));
			const sourceTabIndex = partition.tabs.findIndex((tab) =>
				tab.fields.some((f) => f.config.api_accessor === activeId),
			);
			// Own-tab trigger: releasing there must be a no-op, exactly like
			// the field path below.
			if (sourceTabIndex === tabIndex) return null;
			return { kind: "tab", tabIndex };
		}
		const overField = draft.find((f) => f.config.api_accessor === overId);
		if (!overField) return null;
		// Resolve the card OWNING the drop target: the target marker itself,
		// or a field's nearest preceding marker — block moves snap to card
		// boundaries (a mid-card insertion would split the target card in
		// the flat model).
		const targetCard =
			overField.field_type === "card"
				? overField
				: owningCard(draft, overField);
		if (!targetCard || targetCard.config.api_accessor === activeId) {
			return null;
		}
		// 0.12.0 (spring-loaded sections): the 0.8.0 same-tab guard is gone.
		// A visible foreign card is a LEGITIMATE target now — the only way a
		// foreign tab's cards become visible mid-drag is an explicit spring
		// (pointer dwell / keyboard zone landing); hidden tabs' droppables
		// stay filtered by isVisibleDroppable, so accidental cross-tab moves
		// remain impossible.
		const fromIndex = draft.indexOf(activeField);
		const toIndex = draft.indexOf(targetCard);
		return {
			kind: "card-block",
			targetCardAccessor: targetCard.config.api_accessor,
			placement: fromIndex < toIndex ? "after" : "before",
		};
	}
```

Also update the function's doc comment (lines 90-99): replace `no-moves, own-tab trigger drops, card-over-tabdrop, cross-tab card moves,` with `no-moves, own-tab trigger drops (fields AND cards),` and drop the "v1 has no cross-tab card drag" sentence if present.

- [ ] **Step 8: Run to verify pass, then the covering suites**

Run each bare, capturing `$?`:
- `npx vitest run src/editor/__tests__/resolve-drop-target.test.ts src/editor/__tests__/draft-ops.test.ts src/editor/__tests__/dnd.test.tsx src/editor/__tests__/cards-canvas.test.tsx src/editor/__tests__/drag-feedback.test.tsx`

Expected: PASS. NOTE: `cards-canvas.test.tsx` or `dnd.test.tsx` may pin the OLD cross-tab null (the 0.8.0 guard — "cross-tab card move is a no-op" style tests). If one fails, that pin is now spec-obsolete: INVERT it to assert the new card-block/tab target and note the inversion in your report (do not delete coverage — the own-tab-trigger null pins must stay green as-is).
- `npm run typecheck`, `npm run lint`

- [ ] **Step 9: Commit**

```bash
git add src/editor/draft-ops.ts src/editor/resolve-drop-target.ts src/editor/__tests__/draft-ops.test.ts src/editor/__tests__/resolve-drop-target.test.ts
git commit -m "feat(editor): card cross-section resolution + moveCardToSection"
```
(Include any inverted-pin test files in the same commit.)

---

### Task 2: Spring dwell + restore semantics

**Files:**
- Create: `src/editor/use-spring-loaded-tab.ts`
- Create: `src/editor/__tests__/use-spring-loaded-tab.test.ts`
- Modify: `src/editor/editor-canvas.tsx` (state ~293-301, handlers 567-638)
- Test: `src/editor/__tests__/dnd.test.tsx` (append)

**Interfaces:**
- Consumes: nothing from Task 1 yet (drop handling unchanged in this task).
- Produces: `SPRING_DWELL_MS = 500` and `useSpringLoadedTab(options: { pendingTabIndex: number | null; enabled: boolean; onSpring: (tabIndex: number) => void; delayMs?: number }): void`. Canvas state `dragKind: "pointer" | "keyboard" | null` and `dragStartTabIndexRef` — Task 3's follow-select reads `dragStartTabIndexRef`.

- [ ] **Step 1: Write the failing hook tests**

Create `src/editor/__tests__/use-spring-loaded-tab.test.ts`:

```ts
// src/editor/__tests__/use-spring-loaded-tab.test.ts
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SPRING_DWELL_MS,
	useSpringLoadedTab,
} from "../use-spring-loaded-tab";

describe("useSpringLoadedTab", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("fires onSpring(tabIndex) after the dwell", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedTab({ pendingTabIndex: 2, enabled: true, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 1);
		expect(onSpring).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("cancels when the pending tab clears before the dwell (pass-through)", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: number | null }) =>
				useSpringLoadedTab({ pendingTabIndex: pending, enabled: true, onSpring }),
			{ initialProps: { pending: 1 as number | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS - 100);
		rerender({ pending: null });
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("re-arms per tab: hovering another trigger restarts the dwell (chained springs)", () => {
		const onSpring = vi.fn();
		const { rerender } = renderHook(
			({ pending }: { pending: number | null }) =>
				useSpringLoadedTab({ pendingTabIndex: pending, enabled: true, onSpring }),
			{ initialProps: { pending: 1 as number | null } },
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledExactlyOnceWith(1);
		rerender({ pending: 2 });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(onSpring).toHaveBeenCalledTimes(2);
		expect(onSpring).toHaveBeenLastCalledWith(2);
	});

	it("does nothing while disabled (keyboard drags bypass the dwell)", () => {
		const onSpring = vi.fn();
		renderHook(() =>
			useSpringLoadedTab({ pendingTabIndex: 1, enabled: false, onSpring }),
		);
		vi.advanceTimersByTime(SPRING_DWELL_MS * 2);
		expect(onSpring).not.toHaveBeenCalled();
	});

	it("calls the LATEST onSpring (call-latest ref, no stale closure)", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ cb }: { cb: (i: number) => void }) =>
				useSpringLoadedTab({ pendingTabIndex: 1, enabled: true, onSpring: cb }),
			{ initialProps: { cb: first } },
		);
		rerender({ cb: second });
		vi.advanceTimersByTime(SPRING_DWELL_MS);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledExactlyOnceWith(1);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/editor/__tests__/use-spring-loaded-tab.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement the hook**

Create `src/editor/use-spring-loaded-tab.ts`:

```ts
// src/editor/use-spring-loaded-tab.ts
import { useEffect, useRef } from "react";

/** Pointer dwell before a hovered tab trigger springs the canvas to that
 * section (spring-loaded sections spec 2026-07-14, Decision 1). ONE tuned
 * constant; keyboard drags bypass the dwell entirely (Decision 6). */
export const SPRING_DWELL_MS = 500;

/**
 * Owns the spring dwell timer: while `enabled` and a tab trigger is the
 * hovered zone (`pendingTabIndex`), fire `onSpring(tabIndex)` once after
 * `delayMs`. Any change of the pending zone (drag moved off the strip, onto
 * another trigger, or the drag ended → null) cancels the armed timer —
 * crossing the strip quickly never springs. Re-hovering (null → index)
 * re-arms, so springs chain within one drag.
 */
export function useSpringLoadedTab({
	pendingTabIndex,
	enabled,
	onSpring,
	delayMs = SPRING_DWELL_MS,
}: {
	pendingTabIndex: number | null;
	enabled: boolean;
	onSpring: (tabIndex: number) => void;
	delayMs?: number;
}): void {
	// Call-latest: the timer must invoke the callback identity from the
	// render it FIRES in, not the one it was armed in (the onDirtyChange
	// idiom from spec-editor.tsx).
	const onSpringRef = useRef(onSpring);
	onSpringRef.current = onSpring;

	useEffect(() => {
		if (!enabled || pendingTabIndex == null) return;
		const timer = setTimeout(
			() => onSpringRef.current(pendingTabIndex),
			delayMs,
		);
		return () => clearTimeout(timer);
	}, [pendingTabIndex, enabled, delayMs]);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/editor/__tests__/use-spring-loaded-tab.test.ts` — expect PASS (5/5).

- [ ] **Step 5: Write the failing canvas tests (keyboard immediate-switch is EXISTING behavior — the new pins are Escape-restore and null-drop-restore)**

Append to `src/editor/__tests__/dnd.test.tsx`, inside the existing top-level describe, reusing the file's rect-mock idiom (see the `"dropping a field on its OWN tab's trigger does not reorder it"` test at ~line 216 for the sectioned-layout mock — copy its rect layout exactly: tabdrop zones in a row at y=0, shells stacked below):

```ts
	it("Escape after a keyboard zone-landing restores the drag-start tab", async () => {
		const rectSpy = mockSectionedRects(); // extract the 216-test's inline mock into this shared helper in the same file
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeSection("s1", "SEO"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		// ArrowUp resolves the nearest zone above — landing on a tabdrop
		// switches the visible tab IMMEDIATELY for keyboard drags. Reaching
		// tabdrop-1 may take two presses depending on x-distance; press until
		// the SEO panel unhides, then Escape.
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowRight" });
		// (whichever key sequence reaches tabdrop-1 under the mock layout —
		// assert the SWITCH actually happened before testing the restore, or
		// the restore assertion passes vacuously:)
		const panelsMid = document.querySelectorAll('[role="tabpanel"]');
		expect(panelsMid[1]).not.toHaveAttribute("hidden");
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Escape" });
		// Restore: tab 0's panel is the unhidden one again, schema unchanged.
		const panels = document.querySelectorAll('[role="tabpanel"]');
		expect(panels[0]).not.toHaveAttribute("hidden");
		const order = Array.from(
			document.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["shell-a", "shell-b"]);
		rectSpy.mockRestore();
	});
```

IMPORTANT for the implementer: the exact key sequence to land on `tabdrop-1` depends on the shared mock's coordinates — derive it the way the existing 216-test derives ArrowUp→tabdrop-0 (nearest rect in the pressed direction), and assert the mid-drag switch (`panels[1]` unhidden) BEFORE Escape so the restore assertion cannot pass vacuously. If landing on `tabdrop-1` from tab 0 proves unreachable under sortableKeyboardCoordinates' direction filtering, land on `tabdrop-0`'s own zone instead and test restore after a spring is NOT triggered — but then ALSO add a direct-state test through a pointer-path simulation: call the canvas's exported pieces if needed. Do not ship a vacuous test.

Also append a null-drop-restore test:

```ts
	it("a drop that resolves to nothing restores the drag-start tab", async () => {
		// Keyboard-land on the OWN tab's trigger (tabdrop-0, the 216-test's
		// exact scenario — a null target) and DROP there instead of Escape:
		// the active tab must equal the drag-start tab afterwards and the
		// schema must be unchanged.
		// (Reuses the 216-test's layout mock and key sequence verbatim, then:)
		// fireEvent.keyDown(..., { code: "Space" }) to drop.
		// Assertions: panels[0] not hidden; shell order unchanged.
	});
```

Write this one out fully by copying the 216-test's body and changing the final assertions — the plan elides the duplicated 60-line mock, but YOUR test file must contain the complete runnable test.

- [ ] **Step 6: Run to verify the new tests fail**

Run: `npx vitest run src/editor/__tests__/dnd.test.tsx` — the two new tests FAIL (no restore exists yet; ground truth #3). Pre-existing tests must still pass.

- [ ] **Step 7: Wire the canvas**

In `src/editor/editor-canvas.tsx`:

(a) Import the hook (top of file, alongside the other `./` imports):
```ts
import { useSpringLoadedTab } from "./use-spring-loaded-tab";
```

(b) Add state/refs next to the existing drag state (~line 293-301):
```ts
	// Spring-loaded sections (0.12.0): pointer drags dwell on a hovered tab
	// trigger before the canvas springs to it; keyboard drags switch
	// immediately (spec Decision 6). The drag-start tab is the restore
	// point for Escape and null-target drops (Decision 4).
	const [dragKind, setDragKind] = useState<"pointer" | "keyboard" | null>(
		null,
	);
	const [hoveredTabZone, setHoveredTabZone] = useState<number | null>(null);
	const dragStartTabIndexRef = useRef<number | null>(null);
```

(c) Replace `handleDragOver`'s unconditional activation (lines 567-588 — the whole handler including its comment) with:

```ts
	// Hovering a tab-trigger drop zone while dragging springs the canvas to
	// that tab so the drop can land at an exact slot (spring-loaded sections
	// spec, Decision 1). Pointer drags dwell (SPRING_DWELL_MS) so crossing
	// the strip never flips tabs by accident; keyboard drags switch
	// immediately — arrowing onto a zone is already deliberate (Decision 6).
	// The zone tracking stays UNCONDITIONAL (not gated on resolveDropTarget):
	// dwelling on the SOURCE tab's own trigger is a null TARGET (releasing
	// there is a no-op) but must still spring the view back.
	// Highlight ≠ activation: only a non-null tab target highlights.
	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		const zone =
			typeof overId === "string" && overId.startsWith("tabdrop-")
				? Number(overId.slice("tabdrop-".length))
				: null;
		setHoveredTabZone(zone);
		if (zone != null && dragKind === "keyboard") {
			onActiveTabChange(zone);
		}
		setLiveTarget(
			event.over == null
				? null
				: resolveDropTarget(
						String(event.active.id),
						String(event.over.id),
						draft,
						partition,
					),
		);
	};

	useSpringLoadedTab({
		pendingTabIndex: hoveredTabZone,
		enabled: dragActive && dragKind === "pointer",
		onSpring: onActiveTabChange,
	});
```

(d) Extend `handleDragStart` (line 590-594):
```ts
	const handleDragStart = (event: DragStartEvent) => {
		setDragActive(true);
		setActiveDragId(String(event.active.id));
		setLiveTarget(null);
		// KeyboardSensor activates on keydown; every pointer/mouse/touch
		// activator is a *down event. jsdom fires plain "keydown" too.
		setDragKind(
			event.activatorEvent?.type === "keydown" ? "keyboard" : "pointer",
		);
		setHoveredTabZone(null);
		dragStartTabIndexRef.current = activeTabIndex;
	};
```

(e) Extend `handleDragCancel` and `handleDragEnd`'s shared teardown — add a helper right above `handleDragCancel`:
```ts
	// Decision 4: a spring is a preview until a drop COMMITS. Escape and
	// null-target drops restore the tab that was active at drag start.
	const restoreDragStartTab = () => {
		const startTab = dragStartTabIndexRef.current;
		if (startTab != null && startTab !== activeTabIndex) {
			onActiveTabChange(startTab);
		}
	};
	const clearDragState = () => {
		setDragActive(false);
		setActiveDragId(null);
		setLiveTarget(null);
		setDragKind(null);
		setHoveredTabZone(null);
	};
	const handleDragCancel = () => {
		clearDragState();
		restoreDragStartTab();
		dragStartTabIndexRef.current = null;
	};
```
and rewrite `handleDragEnd`'s early-return section (keep the switch untouched in this task):
```ts
	const handleDragEnd = (event: DragEndEvent) => {
		// Before the early returns: every drop ends the drag, valid target or not.
		clearDragState();
		const { active, over } = event;
		const target = over
			? resolveDropTarget(String(active.id), String(over.id), draft, partition)
			: null;
		if (!target) {
			// No-op drop: nothing committed, so the spring preview unwinds
			// exactly like Escape (Decision 4).
			restoreDragStartTab();
			dragStartTabIndexRef.current = null;
			return;
		}
		dragStartTabIndexRef.current = null;
		switch (target.kind) {
			/* unchanged in this task — Task 3 rewrites the cases */
		}
	};
```
Keep the existing three `case` bodies verbatim in this task (copy them into the new structure). Preserve the "ONE source of truth" comment block above the resolution.

- [ ] **Step 8: Run to verify pass + covering suites**

- `npx vitest run src/editor/__tests__/use-spring-loaded-tab.test.ts src/editor/__tests__/dnd.test.tsx src/editor/__tests__/drag-feedback.test.tsx src/editor/__tests__/cards-canvas.test.tsx src/editor/__tests__/sections.test.tsx` — PASS. (`sections.test.tsx` exists and exercises tab plumbing; if any existing test pinned the INSTANT pointer activation — e.g. asserting a tab switch right after a pointer-path drag-over simulation — it now needs the dwell: prefer wrapping in `vi.useFakeTimers()` + `advanceTimersByTime(SPRING_DWELL_MS)`. Keyboard-path tests are unaffected by design.)
- `npm run typecheck`, `npm run lint`

- [ ] **Step 9: Commit**

```bash
git add src/editor/use-spring-loaded-tab.ts src/editor/__tests__/use-spring-loaded-tab.test.ts src/editor/editor-canvas.tsx src/editor/__tests__/dnd.test.tsx
git commit -m "feat(editor): spring dwell for pointer tab-hover + restore on cancel/no-op (#0.12.0 spec D1/D4/D6)"
```
Subject too long — use: `feat(editor): spring dwell + drag-start tab restore` (49 chars).

---

### Task 3: Sprung-canvas droppability + follow-select + card menu

**Files:**
- Modify: `src/editor/editor-canvas.tsx` (DragRemeasurer child; handleDragEnd cases; card menu targets; scroll helper)
- Modify: `src/editor/card-menu.tsx` (optional move targets)
- Test: `src/editor/__tests__/cards-canvas.test.tsx` (append)

**Interfaces:**
- Consumes: `moveCardToSection` (Task 1), `dragStartTabIndexRef` + `clearDragState`/`restoreDragStartTab` (Task 2), dnd-kit `useDndContext().measureDroppableContainers(ids)` + `droppableContainers` (verified: `store/types.d.ts:70,81`; `DroppableContainersMap extends Map` → `.keys()`), `useDndContext` export from `@dnd-kit/core`.
- Produces: `CardMenuProps.moveTargets?: Array<{ tabIndex: number; name: string }>` + `onMoveToSection?: (accessor: string, tabIndex: number) => void`, `CardMenuLabels` gains `"moveToSection"`.

- [ ] **Step 1: Write the failing card-menu + follow tests**

Append to `src/editor/__tests__/cards-canvas.test.tsx` (its LABELS constant already contains `moveToSection: "Move to section"` — check; if not, add the key). Follow the file's `Harness` + `selectMenuItem` idioms; for the SECOND menu item use Home + ArrowDown + Enter:

```ts
	describe("card cross-section moves (0.12.0)", () => {
		it("card ⋯ menu moves the block to another section and follows it", async () => {
			render(
				<EditorWrap>
					<Harness
						schema={[
							makeCard("c1", "One"),
							makeField("f1"),
							makeSection("s1", "SEO"),
							makeCard("c2", "Two"),
						]}
					/>
				</EditorWrap>,
			);
			// Open card c1's ⋯ menu (aria-label carries the card name).
			fireEvent.click(screen.getByLabelText("Card menu: One"));
			const menu = await screen.findByRole("menu");
			// Items: rename, delete-merge, delete-with-fields, then one move
			// target per OTHER section — here exactly one: "SEO".
			const move = within(menu).getByText("SEO");
			expect(
				within(menu).getByText("Move to section"),
			).toBeInTheDocument(); // group label from labels.moveToSection
			fireEvent.click(move);
			await waitFor(() => {
				// Block moved: c1+f1 now AFTER s1's existing content.
				const order = Array.from(
					document.querySelectorAll(
						'[data-testid^="shell-"], [data-testid^="card-header-"]',
					),
				).map((el) => el.getAttribute("data-testid"));
				expect(order).toEqual([
					"card-header-c2",
					"card-header-c1",
					"shell-f1",
				]);
			});
			// FOLLOW (Decision 3): the SEO panel is the visible one and the
			// moved card is selected.
			const panels = document.querySelectorAll('[role="tabpanel"]');
			expect(panels[1]).not.toHaveAttribute("hidden");
		});

		it("menu offers NO move targets on a single-tab spec", () => {
			render(
				<EditorWrap>
					<Harness schema={[makeCard("c1", "One"), makeField("f1")]} />
				</EditorWrap>,
			);
			fireEvent.click(screen.getByLabelText("Card menu: One"));
			expect(screen.queryByText("Move to section")).not.toBeInTheDocument();
		});
	});
```

NOTE: if the menu item interaction needs the keyboard idiom instead of `fireEvent.click` (zag menus often do — see `selectMenuItem`), use Home + ArrowDown×n + Enter and document which n selects the move item. Verify selection assertion feasibility: the canvas signals selection via each card header's `selected` styling — assert through the Harness's `onSelectSpy` if the file's harness exposes one (it does: `onSelectSpy` prop) — add `expect(onSelectSpy).toHaveBeenLastCalledWith("c1")`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/editor/__tests__/cards-canvas.test.tsx` — the two new tests FAIL (menu has no move items).

- [ ] **Step 3: Extend CardMenu**

In `src/editor/card-menu.tsx`: add `"moveToSection"` to the `CardMenuLabels` Pick union; extend props and render:

```ts
export type CardMenuLabels = Pick<
	Required<EditorLabels>,
	"renameCard" | "deleteCardMerge" | "deleteCardWithFields" | "moveToSection"
>;
```

```ts
	/** Other sections this card's block can move to (spring-loaded sections
	 * spec, Decision 5) — omitted/empty on single-tab specs. */
	moveTargets?: Array<{ tabIndex: number; name: string }>;
	onMoveToSection?: (accessor: string, tabIndex: number) => void;
```

and inside `<MenuContent>` after the rename item:

```tsx
			{moveTargets && moveTargets.length > 0 && onMoveToSection && (
				<>
					<Text px="2" pt="1" fontSize="xs" color="fg.muted">
						{labels.moveToSection}
					</Text>
					{moveTargets.map((t) => (
						<MenuItem
							key={t.tabIndex}
							value={`move-${t.tabIndex}`}
							onSelect={() => onMoveToSection(cardAccessor, t.tabIndex)}
						>
							{t.name}
						</MenuItem>
					))}
				</>
			)}
```

Import `Text` from `@chakra-ui/react` (match the file's import conventions — check how sibling editor files import Text; `field-shell.tsx` uses `@chakra-ui/react`).

- [ ] **Step 4: Wire the canvas — menu targets, drop cases, follow-select**

In `src/editor/editor-canvas.tsx`:

(a) A scroll helper near the top of the component (the retry-until-unhidden idiom from the 0.10.0 focus work — fixed rAF loses to zag's hidden-swap by ~47 ms under load):

```ts
	// Post-move continuation: the moved shell/header exists immediately (a
	// move keeps its accessor), but the target PANEL unhides asynchronously
	// (zag swaps `hidden` after the React commit). Retry until visible, then
	// scroll. Bounded so a deleted accessor can't loop forever.
	const scrollShellIntoView = (accessor: string) => {
		let attempts = 0;
		const tryScroll = () => {
			const el = document.querySelector(
				`[data-testid="shell-${accessor}"], [data-testid="card-header-${accessor}"]`,
			);
			if (el && !el.closest("[hidden]")) {
				el.scrollIntoView({ block: "nearest" });
				return;
			}
			if (attempts++ < 20) requestAnimationFrame(tryScroll);
		};
		requestAnimationFrame(tryScroll);
	};
```

(b) Rewrite `handleDragEnd`'s switch (the Task 2 structure kept the cases verbatim; now they change):

```ts
		const isCardDrag =
			draft.find((f) => f.config.api_accessor === String(active.id))
				?.field_type === "card";
		const startTab = dragStartTabIndexRef.current;
		dragStartTabIndexRef.current = null;
		// Decision 3: every cross-section drop ends in the target section with
		// the moved item selected. Same-tab drops keep today's behavior.
		const follow = (targetTabIndex: number) => {
			if (startTab != null && targetTabIndex !== startTab) {
				onActiveTabChange(targetTabIndex);
				onSelect(String(active.id));
				scrollShellIntoView(String(active.id));
			}
		};
		switch (target.kind) {
			case "card-block": {
				apply(
					moveCard(
						draft,
						String(active.id),
						target.targetCardAccessor,
						target.placement,
					),
				);
				// A sprung drop's target tab is the currently active tab.
				follow(activeTabIndex);
				return;
			}
			case "tab":
				apply(
					isCardDrag
						? moveCardToSection(draft, String(active.id), target.tabIndex)
						: moveFieldToSection(draft, String(active.id), target.tabIndex),
				);
				follow(target.tabIndex);
				return;
			case "field":
				apply(moveField(draft, target.fromIndex, target.targetIndex));
				follow(activeTabIndex);
				return;
		}
```
Import `moveCardToSection` from `./draft-ops` alongside the existing draft-op imports.

(c) `DragRemeasurer` — define above `EditorCanvas` in the same file:

```tsx
/** Ground truth (2026-07-14 probe): a sprung tab's shells keep the ZERO
 * rects they measured while hidden — dnd-kit only re-measures droppables on
 * drag start, so without this the foreign canvas is drop-dead (no over, no
 * line, no tint). Re-measures ALL droppables whenever the active tab
 * changes mid-drag, retrying until the sprung panel has actually unhidden
 * (zag swaps `hidden` up to ~47 ms after the React commit — the 0.10.0
 * retry-until-unhidden lesson). Renders nothing; must live INSIDE
 * DndContext (useDndContext). */
function DragRemeasurer({
	activeTabIndex,
	dragActive,
}: {
	activeTabIndex: number;
	dragActive: boolean;
}) {
	const { measureDroppableContainers, droppableContainers } = useDndContext();
	useEffect(() => {
		if (!dragActive) return;
		let attempts = 0;
		let raf = 0;
		const measure = () => {
			const panel = document.querySelector(
				'[role="tabpanel"]:not([hidden])',
			);
			if (panel || attempts >= 20) {
				measureDroppableContainers(Array.from(droppableContainers.keys()));
				return;
			}
			attempts++;
			raf = requestAnimationFrame(measure);
		};
		raf = requestAnimationFrame(measure);
		return () => cancelAnimationFrame(raf);
	}, [activeTabIndex, dragActive, measureDroppableContainers, droppableContainers]);
	return null;
}
DragRemeasurer.displayName = "DragRemeasurer";
```
Import `useDndContext` from `@dnd-kit/core` (extend the existing import). CAUTION: the `:not([hidden])` probe confirms A panel is visible, not necessarily the SPRUNG one — strengthen if flaky in the runtime gate: query `[role="tabpanel"]` by index via `document.querySelectorAll('[role="tabpanel"]')[activeTabIndex]` and check IT is unhidden. Prefer the stronger form from the start.

Render it inside the SECTIONED `DndContext` (the second one, line ~1026), next to `{overlayPortal}`:
```tsx
					<DragRemeasurer
						activeTabIndex={activeTabIndex}
						dragActive={dragActive}
					/>
```
(The sectionless context has no tabs — no remeasurer needed.)

(d) Card menu wiring — in `buildCardMenu` (the `CardMenu` usage around line 545-565): pass
```tsx
			moveTargets={
				partition.hasSections && partition.tabs.length >= 2
					? partition.tabs
							.map((tab, i) => ({
								tabIndex: i,
								name: tab.section?.config.name ?? labels.defaultTab,
							}))
							.filter((t) => t.tabIndex !== cardTabIndex)
					: undefined
			}
			onMoveToSection={(accessor, tabIndex) => {
				apply(moveCardToSection(draft, accessor, tabIndex));
				onActiveTabChange(tabIndex);
				onSelect(accessor);
				scrollShellIntoView(accessor);
			}}
```
where `cardTabIndex` is the card's own tab: `partition.tabs.findIndex((tab) => tab.fields.some((f) => f.config.api_accessor === card.config.api_accessor))` — compute it inside `buildCardMenu` (it receives the card). Extend the labels object passed to CardMenu with `moveToSection: labels.moveToSection`.

- [ ] **Step 5: Run to verify pass + covering suites**

- `npx vitest run src/editor/__tests__/cards-canvas.test.tsx src/editor/__tests__/dnd.test.tsx src/editor/__tests__/drag-feedback.test.tsx src/editor/__tests__/sections.test.tsx src/editor/__tests__/use-spring-loaded-tab.test.ts` — PASS.
- `npm run typecheck`, `npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/editor/editor-canvas.tsx src/editor/card-menu.tsx src/editor/__tests__/cards-canvas.test.tsx
git commit -m "feat(editor): sprung-canvas remeasure, follow-select, card move menu"
```

---

### Task 4: Docs + version

**Files:**
- Modify: `src/editor/spec-editor.mdx` (drag section + labels note + Migration to 0.12.0)
- Modify: `docs/dnd-kit-reference.md` (measuring + spring sections)
- Modify: `src/editor/spec-editor.stories.tsx` (BuildWithCards note)
- Modify: `CLAUDE.md` (directory layout: `use-spring-loaded-tab.ts` line)
- Modify: `package.json` + `package-lock.json` (0.11.2 → 0.12.0 via `npm version 0.12.0 --no-git-tag-version`)

**Interfaces:** consumes the shipped behavior of Tasks 1-3; every doc claim must be TRUE against the code.

- [ ] **Step 1: spec-editor.mdx** — in the drag & drop contract section, document: pointer dwell (`SPRING_DWELL_MS` 500 ms) springs the hovered section; keyboard zone-landing switches immediately; quick trigger-drop appends at the section end; every cross-section drop ends on the target tab with the moved item selected and scrolled into view; Escape and no-op drops restore the drag-start tab; card blocks cross sections by drag and by the ⋯ menu's "Move to section" targets (label key reused, none added). Add a `## Migration to 0.12.0` section above the 0.11.x ones stating: no API change, no new label keys; the 0.8.0 cross-tab card guard is retired (accidental moves remain impossible — hidden panels stay filtered); hosts relying on the previous instant tab-activation on hover now see a 500 ms dwell.
- [ ] **Step 2: dnd-kit-reference.md** — add a "Measuring" subsection: droppables measure at drag start only (WhileDragging default); visibility flips mid-drag do NOT re-measure; fieldkit's `DragRemeasurer` calls `useDndContext().measureDroppableContainers(ids)` after the panel swap with the retry-until-unhidden idiom. Extend the "When adding new drag-and-drop" list: "If drop targets appear/unhide mid-drag, re-measure them explicitly."
- [ ] **Step 3: stories + CLAUDE.md** — extend the BuildWithCards note: dwell on a tab mid-drag to spring into it; card ⋯ menu moves blocks across sections. Add the CLAUDE.md layout line `│   ├── use-spring-loaded-tab.ts # Pointer dwell before a hovered tab springs (0.12.0)` after the editor-canvas line.
- [ ] **Step 4: Version bump** — `npm version 0.12.0 --no-git-tag-version`; verify with `grep '"version"' package.json` and that the lockfile changed only its two version fields.
- [ ] **Step 5: Full gates** — `npm run test`, `npm run typecheck`, `npm run lint`, `npm run verify-exports`, each with `$?` captured. Expected: all 0.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "docs(editor): spring-loaded sections contract; chore: v0.12.0"`

---

## Definitive runtime gate (controller-run after all tasks; not a task for implementers)

Real-browser legs on Storybook `build-with-cards` (+ a three-section story if needed): (1) pointer dwell ≥500 ms on a foreign trigger springs the canvas; drag continues INTO the sprung tab — line + exactly-one tint on its slots — and the drop lands at an interior slot (schema end-state verified); (2) crossing the tab strip in <300 ms does NOT switch tabs; (3) quick trigger-drop appends + follows + selects; (4) card block: spring + drop between foreign frames; quick trigger-drop appends block; ⋯ menu move; (5) Escape after spring restores the origin tab; no-op drop restores too; (6) keyboard: zone landing switches instantly, arrows walk the sprung tab, drop + Escape parity; (7) regression: the 0.11.x checks — scale 1.0 everywhere, displacement 0, overlay lifecycle, drag-over-nothing clears feedback, pointer-onto-tab highlight. Real exit codes, screenshots eyeballed at each leg.
