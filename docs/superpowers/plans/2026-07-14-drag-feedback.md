# Drag Feedback Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldkit 0.11.0 — mid-drag visuals in the editor canvas are rebuilt on a **DragOverlay clone + still list** model: the dragged shell/card never transforms (the measured `scaleY 0.33–3.5` artifact and the −150px frame escape are structurally dead), a portaled fixed-size preview follows the pointer (card drags: header bar + "+ N fields" hint), the origin dims in place, and a **3px accent insertion line + receiving-card tint + tab-trigger highlight** render from the SAME pure `resolveDropTarget()` that `handleDragEnd` applies. Keyboard drags get identical treatment. Zero API delta; drop semantics byte-frozen.

**Architecture:** `handleDragEnd`'s decision logic moves verbatim into a new pure `src/editor/resolve-drop-target.ts` (`resolveDropTarget(activeId, overId, draft, partition)` → `{kind:"field"|"card-block"|"tab"} | null`), consumed by the end handler AND by `onDragOver` state that drives the live feedback. Both `SortableContext`s swap `verticalListSortingStrategy` for a no-op strategy (`() => null`); `FieldShell`/`CardFrame` swap `CSS.Transform` → `CSS.Translate` and pass `animateLayoutChanges: () => false`. `EditorCanvas` renders a `createPortal(<DragOverlay>…, document.body)` inside each `DndContext` with new presentational `ShellDragPreview`/`CardDragPreview` components; the insertion line (`DropIndicatorLine`) renders in the exact insertion-boundary geometry slots ((tabIndex, position) dialect, inverse-mapped through `flatInsertIndex` itself); the tint is a background-token prop on `CardFrame`.

**Tech Stack:** TypeScript, React 19, @dnd-kit/core 6.3.1 + @dnd-kit/sortable 8.0.0 + @dnd-kit/utilities 3.2.2 (installed, verified), Chakra v3 via @knkcs/anker (semantic tokens), Vitest + @testing-library/react (jsdom), Biome, Storybook, playwright-core (runtime gate probe).

**Spec:** `docs/superpowers/specs/2026-07-14-drag-feedback-design.md` (approved, five decisions LOCKED). Branch: `feat/drag-feedback`.

## Global Constraints

- All work on branch `feat/drag-feedback`; never commit to main.
- Conventional Commits, subject < 72 chars, scope `editor` (or none for cross-cutting docs/version).
- `npm run typecheck` && `npm run lint` green before every commit; `npm run test` (full suite) before finishing a task. **Gates use REAL exit codes — run the command bare and read `$?`; NEVER pipe the pass/fail decision through `tail`/`grep`/`echo` (hard rule after a recent recurrence).**
- Ships as **0.11.0** (bump in the final task). The release tag push / npm publish is NOT part of this plan — only after explicit user OK.
- **Drop SEMANTICS are FROZEN.** These end-state tests are the net and must not change (assertions untouched; only the rect-mock overlay branches listed in Task 2 may be added to their setup):
  - `dnd.test.tsx`: "Move to section… relocates the field", "keyboard reorder moves a field down", "dropping a field on its OWN tab's trigger does not reorder it", "insertion boundaries leave the a11y tree during a drag and return after cancel", "hides the Move to section trigger when only one tab exists".
  - `cards-canvas.test.tsx`: "clicking a card header selects the card", "titled headers show the name; the ⊕ picker never offers the card type", "card header drag block-moves the marker WITH its contained fields", "releasing a card header over a tab trigger is a no-op", "an empty card shows an always-visible insertion point scoped to its body", "card header drag never crosses tab boundaries even when dnd-kit resolves a target there", "dragging a field UP onto the tab's first card frame drops it INSIDE that card", "card header drag reorders within the SECOND tab".
  - `field-shell.test.tsx`: "keyboard drag lifecycle works from the grip of an UNSELECTED shell" (its harness has no DragOverlay — zero impact).
- **Enumerated existing mid-drag assertions** (complete sweep of `src/editor/__tests__/`): exactly ONE test asserts mid-drag DOM — `dnd.test.tsx` "insertion boundaries leave the a11y tree during a drag and return after cancel" (Add-field button counts 3 → 0 → 3). It stays byte-identical: boundaries still go `display:none` mid-drag, and neither the overlay clone, the indicator line, nor the flow placeholder slot renders any "Add field" button. Everything else mid-drag in the existing suites is *mechanics* (keyboard collision stepping through mocked rects), which the overlay changes — hence the seven mock branches in Task 2 (two in `dnd.test.tsx`, five in `cards-canvas.test.tsx`), enumerated with exact values there.
- All new mid-drag behavior is pinned in a NEW suite `src/editor/__tests__/drag-feedback.test.tsx` plus unit tests `resolve-drop-target.test.ts` — the frozen suites gain no assertions.
- **The F8 inert block in `field-shell.tsx` stays byte-identical** (comment + `{...({ inert: "true" } as Record<string, unknown>)}` Box). All Task 1/2 edits to that file sit ABOVE it.
- Token-first styling (semantic tokens only); icons from lucide-react only; `displayName` on every exported React component.
- No new public exports: `src/editor/index.ts` untouched. `resolveDropTarget`, the preview components, and `DropIndicatorLine` are internal (non-index) modules.
- TDD: every task writes its failing test first (superpowers:test-driven-development).
- **Verified dnd-kit facts (checked against the installed `node_modules` sources — the design leans on every one of these):**
  1. **No-op strategy shape:** `useSortable` computes `finalTransform = displaceItem ? (dragSourceDisplacement ?? strategy({...})) : null`. A strategy of `() => null` therefore yields a `null` transform for every non-active item. For the ACTIVE item, `shouldDisplaceDragSource = !useDragOverlay && isDragging`; `SortableContext` sets `useDragOverlay = Boolean(dragOverlay.rect !== null)`, which flips true once the overlay node mounts and measures — after that the active item also falls through to `strategy(...) → null`. `CSS.Translate.toString(null)` returns `undefined` → NO inline transform on any real node. The `transition` string during sorting (`transform 200ms ease`) is harmless with null transforms and clears after the drag (`isSorting` false).
  2. **Post-drop settle:** `useDerivedTransform` (driven by `animateLayoutChanges`) re-transforms a moved node from its old rect INCLUDING `scaleX/scaleY = initialRect/currentRect` — a transient scale ≠ 1 whenever a shell's width changes (e.g. moving into a card frame). Both `useSortable` calls pass `animateLayoutChanges: () => false`; the DragOverlay's default drop animation is the only settle.
  3. **DragOverlay does NOT portal itself** — it renders a `position: fixed` wrapper in place (`PositionedOverlay`), which a transformed/filtered host ancestor would re-anchor. Fieldkit portals it: `createPortal(<DragOverlay …>, document.body)` (React context — FormProvider, plugin registry — flows through portals).
  4. **Keyboard collision rect:** once the overlay measures, dnd-kit derives `collisionRect` from `dragOverlay.rect ?? activeNodeRect` (core line `draggingNodeRect = dragOverlay.rect ?? activeNodeRect`), and `sortableKeyboardCoordinates` direction-filters candidates against `collisionRect.top/left`. Every jsdom keyboard test that mocks `getBoundingClientRect` MUST give the overlay preview the dragged item's initial rect (Task 2 branches) or arrow stepping silently degrades.
  5. **Measured node:** `getMeasurableNode(wrapper)` returns the wrapper's single CHILD — the preview root's `data-testid="drag-overlay-preview"` is the measured element, so the mock branches key off it directly. The testid must NOT start with `shell-` or `card-frame-` (document-level rect mocks and order queries key on those prefixes).
  6. **Keyboard overlay positioning is built in:** `PositionedOverlay`'s default transition is `transform 250ms ease` for keyboard activators (none for pointer) — the clone glides to each announced slot with zero extra code (Decision 5).
  7. **Default `dropAnimation` is jsdom-safe:** it reads `getComputedStyle(node).transform` and `parseTransform` only accepts `matrix(`/`matrix3d(` strings — jsdom never produces those, so it early-returns before `node.animate` (which jsdom lacks). The default stays (browser polish, test-safe); the post-drop clone unmount is async → absence assertions use `waitFor`.
  8. `modifiers` and `adjustScale` are not needed: no axis lock, and `adjustScale` defaults to `false` (the clone's transform is serialized with `scaleX/Y` forced to 1).
- **Spec refinements (locked during planning):**
  1. **Tint token:** anker has no `accent-subtle` semantic token (verified against the installed theme: `bg-*`, `border`, `accent`, `success`, `error`, plus colorPalette groups). The tint and tab-trigger highlight use **`primary.subtle`** — the accent (`primary.700`) palette's semantic subtle step, light/dark aware, background-only. The frame's border is never touched (selection keeps the solid accent border channel).
  2. **Card-over-tabdrop hover still ACTIVATES the tab** (unconditional activation kept in `handleDragOver`): gating activation on `resolveDropTarget` would strand the author on a previously hovered tab when dragging back over the source tab's trigger (a null target). Highlight ≠ activation: only a non-null `{kind:"tab"}` target highlights.
  3. **New labels:** `cardDragFields` (`"+ {count} fields"`) / `cardDragFieldsOne` (`"+ 1 field"`) — the `formatCount(one, many, count)` idiom (`tabErrors`/`tabErrorsOne` precedent). Added to `EditorLabels` + `DEFAULT_EDITOR_LABELS`; on `CanvasLabels` they join the OPTIONAL passthrough block with English fallbacks, so the hand-rolled LABELS fixtures in the existing test suites need no edits.
  4. **Preview components take `children`** — the canvas composes `<ShellDragPreview><ShellContent …/></ShellDragPreview>`; `ShellContent` stays private to `editor-canvas.tsx` (no extraction, no import cycle).
  5. **No-move guard:** when the card-marker snap makes `targetIndex === fromIndex` (a card's first field dropped on its own marker), `resolveDropTarget` returns null. Pre-0.11 code applied `moveField(i, i)`, which returns the SAME schema reference — end state identical, live feedback now honest (no line for a drop that moves nothing). Pinned by a unit test.
  6. **Dimmed origin pins** use `data-drag-origin="true"` + computed `opacity: 0.35` (Chakra class-based computed styles resolve in jsdom — the 0.10 width-token probe precedent). The dashed border ships but is pinned only by the runtime gate's screenshots (jsdom's border-style shorthand resolution is unproven; no test bets on it).
  7. **Card clone height:** the overlay wrapper is sized to the active node's rect (a full ~300px frame) — `DragOverlay` gets `style={{ height: "auto" }}` for card drags only, so the clone collapses to its header-bar content. Field clones keep the wrapper's fixed size (the spec's "fixed size from the active rect").
  8. **Indicator geometry literally reuses the boundary dialect:** `resolveDropTarget` inverse-maps its flat `indicatorIndex` through `flatInsertIndex` itself to a `(tabIndex, position)` — the same coordinates every ⊕ boundary is keyed by. Overlay-variant lines render absolutely in the 20px gap above a shell (the boundary's `top="-5"` geometry); flow-variant lines render where the trailing boundary sits, as an always-present-during-drag same-height slot so the tab/card end doesn't collapse-and-pop mid-drag (the list holds still).
  9. **`docs/dnd-kit-reference.md` is stale** (claims dnd-kit lives in `spec-editor.tsx` only and lists `DragOverlay`/`onDragStart`/`onDragOver`/`onDragCancel` as unused — all wrong since 0.8). Task 4 rewrites it wholesale.
  10. `Schema` becomes an unused import in `editor-canvas.tsx` once `owningCard` moves out (verified: its only remaining use) — Task 1 trims it.

---

### Task 1: `resolveDropTarget` extraction + no-op strategy + `CSS.Translate` (the still list)

**Files:**
- Create: `src/editor/resolve-drop-target.ts`
- Modify: `src/editor/editor-canvas.tsx` (strategy swap, `handleDragEnd` rewrite, `owningCard` moves out)
- Modify: `src/editor/field-shell.tsx`, `src/editor/card-frame.tsx` (`CSS.Translate`, `animateLayoutChanges`)
- Create: `src/editor/__tests__/resolve-drop-target.test.ts`
- Create: `src/editor/__tests__/drag-feedback.test.tsx` (harness + the Finding-2 pin)

**Interfaces (produced, used VERBATIM by Tasks 2–3):**

```ts
// src/editor/resolve-drop-target.ts
export interface FieldDropTarget {
	kind: "field";
	fromIndex: number; // moveField's fromIndex (the active field's flat index)
	targetIndex: number; // moveField's splice index (post-removal dialect, marker snap applied)
	indicatorIndex: number; // PRE-removal flat index the line precedes (draft.length = end)
	indicator: { tabIndex: number; position: number } | null; // insertion-boundary dialect
	tintCardAccessor: string | null; // the ONE frame to tint; null in card-less tabs
}
export interface CardBlockDropTarget {
	kind: "card-block";
	targetCardAccessor: string;
	placement: "before" | "after";
}
export interface TabDropTarget {
	kind: "tab";
	tabIndex: number;
}
export type ResolvedDropTarget = FieldDropTarget | CardBlockDropTarget | TabDropTarget;
export function resolveDropTarget(
	activeId: string,
	overId: string,
	draft: Schema,
	partition: SpecPartition,
): ResolvedDropTarget | null;
```

DOM contract after this task: during a drag, NO field shell or card frame carries an inline `transform` except the active node (which still displaces raw — translate-only, scale always 1 — until Task 2's overlay lands and kills that too). Every drop lands exactly where it did pre-refactor (the frozen net proves it).

- [ ] **Step 1: Write the failing tests**

1. Create `src/editor/__tests__/resolve-drop-target.test.ts`:

```ts
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
```

2. Create `src/editor/__tests__/drag-feedback.test.tsx` (harness + the Finding-2 pin; Tasks 2–3 append to this file, each adding ONLY the imports/helpers its own tests use — Biome's unused-import rules gate every task):

```tsx
// src/editor/__tests__/drag-feedback.test.tsx
// Mid-drag feedback pins for the 0.11.0 drag-feedback rework (spec
// 2026-07-14): still list, overlay preview + dimmed origin, indicator line,
// card tint, tab-trigger highlight. End-state drop semantics stay pinned by
// dnd.test.tsx / cards-canvas.test.tsx — those suites are FROZEN.
// Every drag here is keyboard-driven, so keyboard parity (Decision 5) is
// structural, not a separate test axis.
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";

// anker's Menu/Tooltip positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver and IntersectionObserver — both unimplemented
// in jsdom. Stub them locally, mirroring dnd.test.tsx's rationale.
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const LABELS = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
	hiddenField: "Hidden field:",
	groupPreview: "Repeating group",
	addField: "Add field",
	emptySpec: "No fields yet. Add the first one:",
	dragField: "Drag to reorder",
	editField: "Edit field",
	duplicateField: "Duplicate field",
	deleteField: "Delete field",
	viewField: "View definition",
	systemLocked: "System field",
	moveToSection: "Move to section",
	renameSection: "Rename",
	moveLeft: "Move left",
	moveRight: "Move right",
	deleteSection: "Delete section",
	deleteSectionConfirm:
		'Delete section "{section}"? Its fields move to the previous tab.',
	orientationH: "Horizontal tabs",
	orientationV: "Vertical tabs",
	sectionMenu: "Section menu: {section}",
	sectionNameInput: "Section name",
	cardUntitled: "Untitled card",
	dragCard: "Drag to move card",
	cardMenu: "Card menu: {card}",
	renameCard: "Rename",
	deleteCardMerge: "Delete card",
	deleteCardWithFields: "Delete card and fields",
	deleteCardWithFieldsConfirm: 'Delete card "{card}" and all of its fields?',
};

function Harness({ schema }: { schema: Schema }) {
	const spec = useSpecDraft(schema, testPlugins, vi.fn());
	const [selected, setSelected] = useState<string | null>(null);
	const [activeTabIndex, setActiveTabIndex] = useState(0);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={testPlugins}
				selectedAccessor={selected}
				onSelect={setSelected}
				onEdit={setSelected}
				labels={LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
			/>
		</ConfirmModalProvider>
	);
}

/** Uniform single-column rect mock: card frames and field shells in DOM
 * order, 60px apart, 50px tall. The DragOverlay preview (0.11.0) is pinned
 * to `overlayTop` — the DRAGGED item's initial rect — because dnd-kit
 * derives the keyboard collisionRect from the OVERLAY once it measures
 * (core: draggingNodeRect = dragOverlay.rect ?? activeNodeRect). */
function columnRectMock(overlayTop: number) {
	return vi
		.spyOn(Element.prototype, "getBoundingClientRect")
		.mockImplementation(function (this: Element) {
			const rect = (top: number) =>
				({
					top,
					left: 0,
					width: 200,
					height: 50,
					bottom: top + 50,
					right: 200,
					x: 0,
					y: top,
					toJSON() {
						return this;
					},
				}) as DOMRect;
			const testId = this.getAttribute("data-testid") ?? "";
			if (testId === "drag-overlay-preview") return rect(overlayTop);
			if (testId.startsWith("card-frame-") || testId.startsWith("shell-")) {
				const items = Array.from(
					document.querySelectorAll(
						'[data-testid^="card-frame-"], [data-testid^="shell-"]',
					),
				);
				return rect(items.indexOf(this) * 60);
			}
			return rect(0);
		});
}

/** Lift via keyboard, then yield the macrotask dnd-kit's KeyboardSensor
 * needs before it attaches its document keydown listener. */
async function lift(handle: HTMLElement) {
	handle.focus();
	fireEvent.keyDown(handle, { code: "Space" });
	await new Promise((resolve) => setTimeout(resolve, 0));
}
const arrow = (code: "ArrowUp" | "ArrowDown") =>
	fireEvent.keyDown(document.activeElement ?? document.body, { code });
const cancel = () =>
	fireEvent.keyDown(document.activeElement ?? document.body, {
		code: "Escape",
	});

describe("still list (Decision 2)", () => {
	it("non-active shells carry NO inline transform mid-drag", async () => {
		const rectSpy = columnRectMock(0); // dragging shell-a (top row)
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b"), makeField("c")]} />
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		arrow("ArrowDown"); // over shell-b — pre-0.11 this displaced b upward

		// The Finding-2 pin: with the no-op strategy, non-active items receive
		// NO transform at all. Pre-0.11, verticalListSortingStrategy put
		// translate3d + scaleY on shell-b here (measured root cause of the
		// frame-escape and scale artifacts).
		expect(screen.getByTestId("shell-b").style.transform).toBe("");
		expect(screen.getByTestId("shell-c").style.transform).toBe("");

		cancel();
		rectSpy.mockRestore();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/resolve-drop-target.test.ts src/editor/__tests__/drag-feedback.test.tsx`
Expected: the unit suite FAILS to collect (`../resolve-drop-target` does not exist — `npm run typecheck` fails on the same missing module, same signal); the still-list test FAILS (shell-b carries a `translate3d(…) scaleX(1) scaleY(…)` inline transform mid-drag under the current `verticalListSortingStrategy`).

- [ ] **Step 3: Implement — `src/editor/resolve-drop-target.ts`**

Create the file:

```ts
// src/editor/resolve-drop-target.ts
import type { SpecPartition } from "../schema/partition";
import type { Field, Schema } from "../schema/types";
import { flatInsertIndex } from "./draft-ops";

/** The card marker owning `field`: the nearest preceding `card` in the
 * flat schema, cut off at a `section` boundary (cards never span tabs).
 * Null for loose fields with no marker before them in their tab.
 * (Moved verbatim from editor-canvas.tsx — 0.11.0 drag-feedback rework.) */
export function owningCard(schema: Schema, field: Field): Field | null {
	const index = schema.indexOf(field);
	for (let i = index - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") return schema[i];
	}
	return null;
}

/** The card marker whose body contains the insertion SLOT before flat index
 * `slotIndex` — `owningCard`'s walk, but from a slot instead of a field:
 * the slot right after a marker (the card's top) belongs to that marker. */
function owningCardOfSlot(schema: Schema, slotIndex: number): string | null {
	for (let i = slotIndex - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") {
			return schema[i].config.api_accessor;
		}
	}
	return null;
}

export interface FieldDropTarget {
	kind: "field";
	/** The active field's current flat index (moveField's fromIndex). */
	fromIndex: number;
	/** moveField's splice index (post-removal dialect) — the card-marker
	 * snap (upward drags land one past the marker) already applied. */
	targetIndex: number;
	/** The PRE-removal flat index the indicator line precedes
	 * (draft.length = the end of the last tab). */
	indicatorIndex: number;
	/** Where the line renders, in the ⊕ insertion-boundary dialect —
	 * flatInsertIndex(draft, partition, tabIndex, position) equals
	 * indicatorIndex. Null only if no boundary maps (defensive; duplicate
	 * consumer-schema accessors can defeat the accessor-keyed lookup). */
	indicator: { tabIndex: number; position: number } | null;
	/** The card whose body contains the insertion slot — the ONE frame to
	 * tint (Decision 4); null in card-less tabs and before a leading
	 * implicit (hand-written-schema) group. */
	tintCardAccessor: string | null;
}

export interface CardBlockDropTarget {
	kind: "card-block";
	targetCardAccessor: string;
	placement: "before" | "after";
}

export interface TabDropTarget {
	kind: "tab";
	tabIndex: number;
}

export type ResolvedDropTarget =
	| FieldDropTarget
	| CardBlockDropTarget
	| TabDropTarget;

/** Maps a flat insertion index back to the (tabIndex, position) dialect the
 * canvas renders boundaries with — probed through `flatInsertIndex` itself,
 * so line geometry and ⊕ boundaries can never disagree. */
function indicatorPosition(
	draft: Schema,
	partition: SpecPartition,
	indicatorIndex: number,
): { tabIndex: number; position: number } | null {
	for (let tabIndex = 0; tabIndex < partition.tabs.length; tabIndex++) {
		const length = partition.tabs[tabIndex].fields.length;
		for (let position = 0; position <= length; position++) {
			if (
				flatInsertIndex(draft, partition, tabIndex, position) ===
				indicatorIndex
			) {
				return { tabIndex, position };
			}
		}
	}
	return null;
}

/**
 * ONE source of truth for "where would releasing land this drag?" — used by
 * BOTH handleDragEnd (which applies it) and the live drag feedback (the
 * indicator line, card tint, and tab-trigger highlight render from the same
 * answer, so they can never disagree with the drop; drag-feedback spec
 * 2026-07-14, Decisions 3–4). Returns null for every no-op: self drops,
 * no-moves, own-tab trigger drops, card-over-tabdrop, cross-tab card moves,
 * and unresolvable ids. The decision logic is a verbatim port of the
 * pre-0.11 handleDragEnd — drop SEMANTICS are frozen.
 */
export function resolveDropTarget(
	activeId: string,
	overId: string,
	draft: Schema,
	partition: SpecPartition,
): ResolvedDropTarget | null {
	// Card block move — checked BEFORE the tabdrop branch: releasing a card
	// header over a tab trigger must be a no-op (moveFieldToSection would
	// relocate only the MARKER, orphaning its fields). v1 has no cross-tab
	// card drag.
	const activeField = draft.find((f) => f.config.api_accessor === activeId);
	if (activeField?.field_type === "card") {
		if (overId.startsWith("tabdrop-")) return null;
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
		// Tab-scoping guard (review-mandated, cards Task 5 carry-forward):
		// moveCard mechanically permits a CROSS-TAB block move, and dnd-kit's
		// keyboard sensor can resolve a target inside a hidden (mounted) tab.
		// v1 has no cross-tab card drag, so no-op instead of relocating.
		const sourceTabIndex = partition.tabs.findIndex((tab) =>
			tab.fields.some((f) => f.config.api_accessor === activeId),
		);
		const targetTabIndex = partition.tabs.findIndex((tab) =>
			tab.fields.some(
				(f) => f.config.api_accessor === targetCard.config.api_accessor,
			),
		);
		if (sourceTabIndex !== targetTabIndex) return null;
		const fromIndex = draft.indexOf(activeField);
		const toIndex = draft.indexOf(targetCard);
		return {
			kind: "card-block",
			targetCardAccessor: targetCard.config.api_accessor,
			placement: fromIndex < toIndex ? "after" : "before",
		};
	}

	if (overId.startsWith("tabdrop-")) {
		const tabIndex = Number(overId.slice("tabdrop-".length));
		// Releasing over the field's OWN tab trigger must be a no-op:
		// moveFieldToSection appends to the target tab, so an unguarded
		// self-drop would silently jump the field to its tab's end.
		const sourceTabIndex = partition.tabs.findIndex((tab) =>
			tab.fields.some((f) => f.config.api_accessor === activeId),
		);
		if (sourceTabIndex === tabIndex) return null;
		return { kind: "tab", tabIndex };
	}

	if (activeId === overId) return null;
	const fromIndex = draft.findIndex(
		(f) => f.config.api_accessor === activeId,
	);
	const toIndex = draft.findIndex((f) => f.config.api_accessor === overId);
	if (fromIndex === -1 || toIndex === -1) return null;
	// Dropping a FIELD onto a `card` MARKER must land it INSIDE that card,
	// not before it in the flat array: on a DOWNWARD drag splicing at
	// toIndex already lands right after the marker (toIndex shifts down by
	// one once the source is removed); snap UPWARD drags one slot past the
	// marker so they land inside it too — otherwise a tab's FIRST card
	// would strand the field ahead of every card (a
	// loose_field_in_carded_tab violation).
	const overField = draft[toIndex];
	const targetIndex =
		overField.field_type === "card" && fromIndex > toIndex
			? toIndex + 1
			: toIndex;
	// The marker snap can resolve to the field's own slot (a card's first
	// field dropped on its own marker): pre-0.11 this applied
	// moveField(i, i), which returns the schema unchanged — null is the
	// same end state and keeps the live feedback honest (no line for a
	// drop that moves nothing).
	if (targetIndex === fromIndex) return null;
	// The line precedes this PRE-removal flat index: splicing at
	// targetIndex (post-removal dialect) lands the field immediately before
	// the item currently at targetIndex (upward drags) or at targetIndex + 1
	// (downward drags — removing the source shifts later items up by one).
	const indicatorIndex =
		targetIndex < fromIndex ? targetIndex : targetIndex + 1;
	return {
		kind: "field",
		fromIndex,
		targetIndex,
		indicatorIndex,
		indicator: indicatorPosition(draft, partition, indicatorIndex),
		tintCardAccessor: owningCardOfSlot(draft, indicatorIndex),
	};
}
```

- [ ] **Step 4: Implement — `editor-canvas.tsx` strategy swap + `handleDragEnd` rewrite**

1. Sortable imports — replace:

```tsx
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
```

with:

```tsx
import {
	SortableContext,
	type SortingStrategy,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
```

2. Schema type import (now unused — `owningCard` moves out) — replace:

```tsx
import type { Field, Schema } from "../schema/types";
```

with:

```tsx
import type { Field } from "../schema/types";
```

3. resolveDropTarget import — replace:

```tsx
import { FieldShell } from "./field-shell";
import type { SectionMenuLabels } from "./section-menu";
```

with:

```tsx
import { FieldShell } from "./field-shell";
import { resolveDropTarget } from "./resolve-drop-target";
import type { SectionMenuLabels } from "./section-menu";
```

4. `owningCard` moves out; the no-op strategy takes its place — replace:

```tsx
/** The card marker owning `field`: the nearest preceding `card` in the
 * flat schema, cut off at a `section` boundary (cards never span tabs).
 * Null for loose fields with no marker before them in their tab. */
function owningCard(schema: Schema, field: Field): Field | null {
	const index = schema.indexOf(field);
	for (let i = index - 1; i >= 0; i--) {
		if (schema[i].field_type === "section") return null;
		if (schema[i].field_type === "card") return schema[i];
	}
	return null;
}
```

with:

```tsx
/** Drag-feedback rework (2026-07-14 spec, Decision 2 — "the list holds
 * still"): sortables get NO displacement transforms during a drag. The
 * DragOverlay carries the only moving element, so useSortable's transform
 * is `strategy(...)` for every non-active item — and for the active item
 * too once the overlay is measured (`shouldDisplaceDragSource` is false).
 * Returning null therefore leaves every real node untransformed, which
 * kills the frame-escape artifact (flat-strategy translations vs nested
 * card-frame DOM) structurally. Verified against the installed
 * @dnd-kit/sortable 8.0.0 useSortable source. */
const noopSortingStrategy: SortingStrategy = () => null;
```

5. `handleDragEnd` — replace the ENTIRE current handler (from `const handleDragEnd = (event: DragEndEvent) => {` through the closing `};` right before `// Built per-field so the canvas (not FieldShell) owns the cross-section`) with:

```tsx
	const handleDragEnd = (event: DragEndEvent) => {
		// Before the early returns: every drop ends the drag, valid target or not.
		setDragActive(false);
		const { active, over } = event;
		if (!over) return;
		// ONE source of truth (drag-feedback spec, Decision 3): the same
		// resolution that drives the live indicator/tint decides the drop.
		// The full decision logic — card branch, field-over-frame snap,
		// cross-tab guard, tabdrop targets — lives in resolveDropTarget,
		// ported verbatim; this handler only applies the answer.
		const target = resolveDropTarget(
			String(active.id),
			String(over.id),
			draft,
			partition,
		);
		if (!target) return;
		switch (target.kind) {
			case "card-block":
				apply(
					moveCard(
						draft,
						String(active.id),
						target.targetCardAccessor,
						target.placement,
					),
				);
				return;
			case "tab":
				apply(moveFieldToSection(draft, String(active.id), target.tabIndex));
				return;
			case "field":
				apply(moveField(draft, target.fromIndex, target.targetIndex));
				return;
		}
	};
```

6. Strategy swap on BOTH SortableContexts — `replace_all` (the two occurrences are byte-identical):

```tsx
			<SortableContext
				items={fields.map((f) => f.config.api_accessor)}
				strategy={verticalListSortingStrategy}
			>
```

with:

```tsx
			<SortableContext
				items={fields.map((f) => f.config.api_accessor)}
				strategy={noopSortingStrategy}
			>
```

- [ ] **Step 5: Implement — `field-shell.tsx` and `card-frame.tsx`**

1. `field-shell.tsx` — replace:

```tsx
	} = useSortable({
		id: accessor,
	});
```

with:

```tsx
	} = useSortable({
		id: accessor,
		// Drag-feedback rework: no post-drop settle transform. The default
		// animateLayoutChanges re-transforms a moved node from its old rect —
		// including a transient scaleX/scaleY ≠ 1 whenever its width changes
		// (e.g. moving into a card frame) — re-introducing the scale-artifact
		// class this rework kills. The DragOverlay's drop animation is the
		// only settle.
		animateLayoutChanges: () => false,
	});
```

then replace:

```tsx
			style={{ transform: CSS.Transform.toString(transform), transition }}
```

with:

```tsx
			style={{ transform: CSS.Translate.toString(transform), transition }}
```

(The transform is always null under the no-op strategy + overlay; `CSS.Translate` is the belt — scale components can never be serialized onto a real node again. NOTHING at or below the F8 comment block is touched.)

2. `card-frame.tsx` — replace:

```tsx
	} = useSortable({ id: accessor });
```

with:

```tsx
	} = useSortable({
		id: accessor,
		// See FieldShell: the DragOverlay's drop animation is the only settle.
		animateLayoutChanges: () => false,
	});
```

then replace:

```tsx
			style={{ transform: CSS.Transform.toString(transform), transition }}
```

with:

```tsx
			style={{ transform: CSS.Translate.toString(transform), transition }}
```

- [ ] **Step 6: Run tests to verify they pass, full gates + commit**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — including, notably, the WHOLE frozen net without edits: all five `dnd.test.tsx` tests (keyboard stepping still uses `activeNodeRect` — no overlay exists yet), all eight `cards-canvas.test.tsx` tests (drop results identical through `resolveDropTarget`), `field-shell.test.tsx` unchanged.

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): still-list drag model + resolveDropTarget extraction"
```

---

### Task 2: DragOverlay + previews + dimmed origin (+ count-hint labels)

**Files:**
- Create: `src/editor/drag-previews.tsx` (`ShellDragPreview`, `CardDragPreview`, `cardBlockFieldCount`)
- Modify: `src/editor/editor-canvas.tsx` (overlay portal, `activeDragId` state, `CanvasLabels` keys)
- Modify: `src/editor/spec-editor.tsx` (`cardDragFields`/`cardDragFieldsOne` labels)
- Modify: `src/editor/field-shell.tsx`, `src/editor/card-frame.tsx` (dimmed origin)
- Modify: `src/editor/__tests__/drag-feedback.test.tsx` (overlay + dim pins)
- Modify: `src/editor/__tests__/dnd.test.tsx`, `src/editor/__tests__/cards-canvas.test.tsx` (rect-mock overlay branches ONLY — no assertion edits)

**Interfaces:**
- Produces: mid-drag, `document.body` hosts exactly one `[data-testid="drag-overlay-preview"]` (a `ShellDragPreview` clone for field drags; a header-bar `CardDragPreview` with a `formatCount`-driven "+ N fields" hint for card drags); the origin shell/frame carries `data-drag-origin="true"`, computed `opacity: 0.35`, and a dashed `border`-token outline; the ACTIVE node's inline transform is empty for the whole drag. New `EditorLabels` keys (used verbatim by Task 4's docs): `cardDragFields` (default `"+ {count} fields"`), `cardDragFieldsOne` (default `"+ 1 field"`).

- [ ] **Step 1: Write the failing tests**

In `src/editor/__tests__/drag-feedback.test.tsx`, first extend the imports this task's tests need — replace:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
```

with:

```tsx
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
```

then replace:

```tsx
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";
```

with:

```tsx
import { EditorWrap, makeCard, makeField, testPlugins } from "./editor-helpers";
```

Then append after the `describe("still list …")` block:

```tsx
describe("overlay preview + dimmed origin (Decision 1)", () => {
	it("a portaled preview appears; the origin dims and keeps NO transform", async () => {
		const rectSpy = columnRectMock(0); // dragging shell-a (top row)
		const { container } = render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);

		const shell = screen.getByTestId("shell-a");
		const handle = within(shell).getByLabelText("Drag to reorder");
		await lift(handle);

		// The clone lives in a document.body portal — OUTSIDE the canvas tree
		// (dnd-kit's DragOverlay is position:fixed and does NOT portal itself;
		// a transformed host ancestor would re-anchor it).
		const preview = screen.getByTestId("drag-overlay-preview");
		expect(container).not.toContainElement(preview);
		// It clones the shell interior (the field's real preview component).
		expect(within(preview).getByTestId("field-a")).toBeInTheDocument();

		// The ORIGIN never receives a drag transform (the scale artifact is
		// dead at the root) — it stays in place, dimmed.
		arrow("ArrowDown");
		expect(shell.style.transform).toBe("");
		expect(shell).toHaveAttribute("data-drag-origin", "true");
		expect(window.getComputedStyle(shell).opacity).toBe("0.35");

		cancel();
		// The overlay unmounts once the (jsdom-skipped) drop animation
		// resolves — async, hence waitFor.
		await waitFor(() =>
			expect(screen.queryByTestId("drag-overlay-preview")).toBeNull(),
		);
		expect(shell).not.toHaveAttribute("data-drag-origin");
		expect(window.getComputedStyle(shell).opacity).toBe("1");
		rectSpy.mockRestore();
	});

	it("card block drags carry a header-bar-only clone with a '+ N fields' hint", async () => {
		const rectSpy = columnRectMock(0); // dragging card-frame-c1 (top row)
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "Basics"),
						makeField("a"),
						makeField("x"),
						makeCard("c2", "Two"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = screen.getAllByLabelText("Drag to move card")[0];
		await lift(handle);

		const preview = screen.getByTestId("drag-overlay-preview");
		expect(within(preview).getByText("Basics")).toBeInTheDocument();
		// LABELS has no cardDragFields override — the English fallback
		// interpolates the block's field count (formatCount idiom).
		expect(within(preview).getByText("+ 2 fields")).toBeInTheDocument();
		// Header bar ONLY: none of the card's field shells are cloned.
		expect(within(preview).queryByTestId("field-a")).toBeNull();
		expect(within(preview).queryByTestId("field-x")).toBeNull();
		// The origin frame dims in place.
		const frame = screen.getByTestId("card-frame-c1");
		expect(frame).toHaveAttribute("data-drag-origin", "true");
		expect(window.getComputedStyle(frame).opacity).toBe("0.35");

		cancel();
		rectSpy.mockRestore();
	});
});
```

- [ ] **Step 2: Add the rect-mock overlay branches to the frozen suites (setup-only edits)**

These are the SEVEN mock branches (Global Constraints, verified fact 4): once the overlay mounts, dnd-kit derives the keyboard collisionRect from `dragOverlay.rect` instead of the active node's rect — each mock must pin the preview to the dragged item's initial rect or arrow stepping degrades (in `cards-canvas`' "field UP onto the tab's first card" the four ArrowUps would find NO candidates above the fallback rect and the test would pass vacuously).

1. `src/editor/__tests__/dnd.test.tsx` — "keyboard reorder moves a field down": replace

```tsx
			.mockImplementation(function (this: Element) {
				const shells = Array.from(
					document.querySelectorAll('[data-testid^="shell-"]'),
				);
				const index = shells.indexOf(this);
				const top = index === -1 ? 0 : index * 60;
```

with:

```tsx
			.mockImplementation(function (this: Element) {
				// 0.11.0: the DragOverlay preview measures through this mock too,
				// and dnd-kit derives the keyboard collisionRect from the OVERLAY
				// once it mounts — pin it to dragged shell-a's initial rect so
				// the stepping semantics stay exactly pre-overlay.
				if (this.getAttribute("data-testid") === "drag-overlay-preview") {
					return {
						top: 0,
						bottom: 50,
						left: 0,
						right: 200,
						width: 200,
						height: 50,
						x: 0,
						y: 0,
						toJSON() {
							return this;
						},
					} as DOMRect;
				}
				const shells = Array.from(
					document.querySelectorAll('[data-testid^="shell-"]'),
				);
				const index = shells.indexOf(this);
				const top = index === -1 ? 0 : index * 60;
```

2. `dnd.test.tsx` — "dropping a field on its OWN tab's trigger does not reorder it": replace

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("tabdrop-")) {
					const index = Number(testId.slice("tabdrop-".length));
					return rect(0, index * 200, 100, 40);
				}
```

with:

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: pin the DragOverlay preview to dragged shell-a's initial
				// rect (see the keyboard-reorder test's rationale).
				if (testId === "drag-overlay-preview") {
					return rect(100, 0, 200, 50);
				}
				if (testId.startsWith("tabdrop-")) {
					const index = Number(testId.slice("tabdrop-".length));
					return rect(0, index * 200, 100, 40);
				}
```

("insertion boundaries leave the a11y tree…" has NO rect mock and needs NO edit — the overlay measures jsdom's native zero rect, which is non-null, and the test's Add-field counts see neither the clone nor the line.)

3. `src/editor/__tests__/cards-canvas.test.tsx` — the three block-move mocks ("card header drag block-moves…", "…never crosses tab boundaries…", "…reorders within the SECOND tab") share a byte-identical snippet; ONE `replace_all` of:

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("card-frame-")) {
					const frames = Array.from(
						document.querySelectorAll('[data-testid^="card-frame-"]'),
					);
					return rect(frames.indexOf(this) * 300, 0);
				}
```

with:

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: the keyboard collisionRect derives from the DragOverlay
				// preview once it mounts — pin it to the dragged frame's initial
				// rect (c1, the top-left frame in each of these block-move tests).
				if (testId === "drag-overlay-preview") {
					return rect(0, 0);
				}
				if (testId.startsWith("card-frame-")) {
					const frames = Array.from(
						document.querySelectorAll('[data-testid^="card-frame-"]'),
					);
					return rect(frames.indexOf(this) * 300, 0);
				}
```

4. `cards-canvas.test.tsx` — "releasing a card header over a tab trigger is a no-op": replace

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("tabdrop-")) {
					return rect(0, Number(testId.slice("tabdrop-".length)) * 200);
				}
```

with:

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: pin the DragOverlay preview to dragged c1's initial rect.
				if (testId === "drag-overlay-preview") {
					return rect(100, 0);
				}
				if (testId.startsWith("tabdrop-")) {
					return rect(0, Number(testId.slice("tabdrop-".length)) * 200);
				}
```

5. `cards-canvas.test.tsx` — "dragging a field UP onto the tab's first card frame drops it INSIDE that card": replace

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				if (testId.startsWith("card-frame-") || testId.startsWith("shell-")) {
```

with:

```tsx
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: pin the DragOverlay preview to dragged f4's initial rect
				// (column index 4 × 60) — at the fallback rect(0) the four
				// ArrowUps would find no candidates above and the walk would be
				// vacuous.
				if (testId === "drag-overlay-preview") {
					return rect(240);
				}
				if (testId.startsWith("card-frame-") || testId.startsWith("shell-")) {
```

- [ ] **Step 3: Run tests to verify the red/green split**

Run: `npx vitest run src/editor/__tests__/drag-feedback.test.tsx src/editor/__tests__/dnd.test.tsx src/editor/__tests__/cards-canvas.test.tsx`
Expected: the two new overlay tests FAIL (`drag-overlay-preview` does not exist); the still-list test and BOTH frozen suites stay GREEN (the new mock branches are dead code until the overlay mounts — expected-green setup pins).

- [ ] **Step 4: Implement — `src/editor/drag-previews.tsx`**

Create the file:

```tsx
// src/editor/drag-previews.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { formatCount } from "../renderer/merge-labels";
import type { Field, Schema } from "../schema/types";

/** Fields inside a card marker's block (up to the next card/section
 * marker) — the "+ N fields" count on the block-drag preview. */
export function cardBlockFieldCount(draft: Schema, card: Field): number {
	const start = draft.indexOf(card);
	if (start === -1) return 0;
	let count = 0;
	for (let i = start + 1; i < draft.length; i++) {
		const type = draft[i].field_type;
		if (type === "card" || type === "section") break;
		count++;
	}
	return count;
}

/**
 * DragOverlay clone for a FIELD drag (drag-feedback spec 2026-07-14,
 * Decision 1): dnd-kit sizes the overlay wrapper to the active shell's
 * rect; this fills it with the shell's look — shadow + slight tilt for
 * lift. Presentational only; the interior is inert (the same
 * React-18-safe string-value idiom as FieldShell's F8 block).
 */
export function ShellDragPreview({ children }: { children: ReactNode }) {
	return (
		<Box
			data-testid="drag-overlay-preview"
			width="100%"
			height="100%"
			bg="bg-surface"
			borderWidth="2px"
			borderColor="border"
			borderRadius="md"
			boxShadow="lg"
			transform="rotate(1deg)"
			overflow="hidden"
			position="relative"
			py="2"
			pr="2"
			pl="10"
			cursor="grabbing"
		>
			<Box position="absolute" top="2" left="1.5" color="fg.muted" aria-hidden>
				<GripVertical size={14} />
			</Box>
			<Box
				{...({ inert: "true" } as Record<string, unknown>)}
				pointerEvents="none"
				userSelect="none"
			>
				{children}
			</Box>
		</Box>
	);
}
ShellDragPreview.displayName = "ShellDragPreview";

export interface CardDragPreviewLabels {
	cardUntitled: string;
	/** "+ {count} fields" — optional CanvasLabels passthrough with an
	 * English fallback (the tabErrors idiom). */
	cardDragFields?: string;
	/** "+ 1 field" at count 1. */
	cardDragFieldsOne?: string;
}

/**
 * DragOverlay clone for a CARD block drag: the HEADER BAR ONLY plus a
 * "+ N fields" count hint — a full-height frame clone would occlude the
 * canvas (drag-feedback spec, Decision 1). The canvas passes
 * `style={{ height: "auto" }}` to DragOverlay for card drags so the
 * wrapper collapses to this bar instead of the frame's measured height.
 */
export function CardDragPreview({
	card,
	fieldCount,
	labels,
}: {
	card: Field;
	fieldCount: number;
	labels: CardDragPreviewLabels;
}) {
	const title = card.config.name.trim();
	return (
		<Flex
			data-testid="drag-overlay-preview"
			align="center"
			gap="2"
			px="5"
			py="2"
			width="100%"
			bg="bg-subtle"
			borderWidth="2px"
			borderColor="border"
			borderRadius="lg"
			boxShadow="lg"
			transform="rotate(1deg)"
			cursor="grabbing"
		>
			<Box color="fg.muted" aria-hidden>
				<GripVertical size={14} />
			</Box>
			{title ? (
				<Text fontSize="sm" fontWeight="semibold">
					{title}
				</Text>
			) : (
				<Text fontSize="sm" color="fg.muted" fontStyle="italic">
					{labels.cardUntitled}
				</Text>
			)}
			<Text fontSize="xs" color="fg.muted" marginLeft="auto">
				{formatCount(
					labels.cardDragFieldsOne ?? "+ 1 field",
					labels.cardDragFields ?? "+ {count} fields",
					fieldCount,
				)}
			</Text>
		</Flex>
	);
}
CardDragPreview.displayName = "CardDragPreview";
```

- [ ] **Step 5: Implement — canvas wiring, dimmed origins, labels**

1. `editor-canvas.tsx` core imports — replace:

```tsx
import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
```

with:

```tsx
import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
```

2. Portal import — replace:

```tsx
} from "react";
import { FormProvider, useForm } from "react-hook-form";
```

with:

```tsx
} from "react";
import { createPortal } from "react-dom";
import { FormProvider, useForm } from "react-hook-form";
```

3. Preview imports — replace:

```tsx
import { FieldShell } from "./field-shell";
```

with:

```tsx
import {
	CardDragPreview,
	ShellDragPreview,
	cardBlockFieldCount,
} from "./drag-previews";
import { FieldShell } from "./field-shell";
```

4. State — replace:

```tsx
	const [dragActive, setDragActive] = useState(false);
```

with:

```tsx
	const [dragActive, setDragActive] = useState(false);
	// The dragged field's accessor while a drag is live — drives the overlay
	// preview clone (drag-feedback spec, Decision 1).
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
```

5. Handlers — replace:

```tsx
	const handleDragStart = () => setDragActive(true);
	const handleDragCancel = () => setDragActive(false);
```

with:

```tsx
	const handleDragStart = (event: DragStartEvent) => {
		setDragActive(true);
		setActiveDragId(String(event.active.id));
	};
	const handleDragCancel = () => {
		setDragActive(false);
		setActiveDragId(null);
	};
```

then replace (in `handleDragEnd`):

```tsx
		setDragActive(false);
		const { active, over } = event;
```

with:

```tsx
		setDragActive(false);
		setActiveDragId(null);
		const { active, over } = event;
```

6. The overlay portal — insert directly BEFORE `if (partition.tabs.length === 0) {`:

```tsx
	const activeDragField = activeDragId
		? (draft.find((f) => f.config.api_accessor === activeDragId) ?? null)
		: null;
	// PORTALED to document.body (drag-feedback spec, Decision 1): dnd-kit's
	// DragOverlay renders a position:fixed wrapper IN PLACE — inside a
	// transformed/filtered host ancestor (a drawer, a scaled preview) that
	// wrapper would anchor to the wrong containing block. The portal keeps
	// React context (FormProvider, plugin registry) while escaping the DOM.
	// dnd-kit positions the clone at the active node's initial rect and
	// moves it with the drag delta; keyboard drags glide via the built-in
	// 'transform 250ms ease' overlay transition (keyboard parity, Decision
	// 5). Card drags collapse the wrapper to the header-bar clone via
	// height:auto (the wrapper is otherwise sized to the full frame rect).
	const overlayPortal = createPortal(
		<DragOverlay
			style={
				activeDragField?.field_type === "card" ? { height: "auto" } : undefined
			}
		>
			{activeDragField ? (
				activeDragField.field_type === "card" ? (
					<CardDragPreview
						card={activeDragField}
						fieldCount={cardBlockFieldCount(draft, activeDragField)}
						labels={labels}
					/>
				) : (
					<ShellDragPreview>
						<ShellContent field={activeDragField} labels={labels} />
					</ShellDragPreview>
				)
			) : null}
		</DragOverlay>,
		document.body,
	);

```

7. Mount it inside BOTH DndContexts. Sectionless — replace:

```tsx
						<Box ref={containerRef}>
							{renderFields(partition.tabs[0].fields, 0)}
						</Box>
					</DndContext>
```

with:

```tsx
						<Box ref={containerRef}>
							{renderFields(partition.tabs[0].fields, 0)}
						</Box>
						{overlayPortal}
					</DndContext>
```

Sectioned — replace:

```tsx
						</Tabs.Root>
					</Box>
				</DndContext>
```

with:

```tsx
						</Tabs.Root>
					</Box>
					{overlayPortal}
				</DndContext>
```

(If the sectioned anchor's indentation doesn't match exactly, locate the `</Tabs.Root>` closing sequence — it is unique — and add `{overlayPortal}` between the `</Box>` that closes `containerRef` and `</DndContext>`.)

8. `CanvasLabels` optional passthrough — replace:

```tsx
	/** Accessible name for a tab's error badge at count 1; falls back to
	 * "1 invalid field". */
	tabErrorsOne?: string;
```

with:

```tsx
	/** Accessible name for a tab's error badge at count 1; falls back to
	 * "1 invalid field". */
	tabErrorsOne?: string;
	/** Count hint on the card block-drag overlay preview; "{count}"
	 * interpolated; falls back to "+ {count} fields". */
	cardDragFields?: string;
	/** Count hint at count 1; falls back to "+ 1 field". */
	cardDragFieldsOne?: string;
```

9. `field-shell.tsx` dimmed origin — replace:

```tsx
	const borderColor = invalid
		? "danger.600"
		: selected
			? "accent"
			: "transparent";
```

with:

```tsx
	// While this shell is the drag ORIGIN its outline switches to dashed
	// `border` (dimmed-origin treatment, Decision 1) — the unselected
	// "transparent" would render invisible dashes, and the accent border
	// stays reserved for selection (Decision 4).
	const borderColor = isDragging
		? "border"
		: invalid
			? "danger.600"
			: selected
				? "accent"
				: "transparent";
```

then replace:

```tsx
			bg={selected ? "bg-subtle" : undefined}
			opacity={isDragging ? 0.6 : 1}
```

with:

```tsx
			bg={selected ? "bg-subtle" : undefined}
			// Dimmed origin (drag-feedback spec, Decision 1): the overlay clone
			// is the moving element; the in-list original stays put, dimmed and
			// dash-outlined.
			opacity={isDragging ? 0.35 : 1}
			borderStyle={isDragging ? "dashed" : "solid"}
			data-drag-origin={isDragging ? "true" : undefined}
```

10. `card-frame.tsx` dimmed origin — replace:

```tsx
			opacity={isDragging ? 0.6 : 1}
			bg="bg-surface"
			borderWidth="2px"
			borderColor={selected ? "accent" : "border"}
```

with:

```tsx
			// Dimmed origin (drag-feedback spec, Decision 1) — see FieldShell.
			opacity={isDragging ? 0.35 : 1}
			data-drag-origin={isDragging ? "true" : undefined}
			bg="bg-surface"
			borderWidth="2px"
			borderStyle={isDragging ? "dashed" : "solid"}
			borderColor={selected ? "accent" : "border"}
```

11. `spec-editor.tsx` labels — replace:

```ts
	/** aria-label/tooltip for a card header's drag handle (block move). */
	dragCard?: string;
```

with:

```ts
	/** aria-label/tooltip for a card header's drag handle (block move). */
	dragCard?: string;
	/** Count hint on the card block-drag overlay preview ("{count}"
	 * interpolated) — 0.11.0 drag-feedback rework. */
	cardDragFields?: string;
	/** Count hint on the card block-drag overlay preview at count 1. */
	cardDragFieldsOne?: string;
```

then replace:

```ts
	dragCard: "Drag to move card",
```

with:

```ts
	dragCard: "Drag to move card",
	cardDragFields: "+ {count} fields",
	cardDragFieldsOne: "+ 1 field",
```

- [ ] **Step 6: Run tests to verify they pass, full gates + commit**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — the two overlay tests go green; the frozen net stays green THROUGH the overlay (this is the moment the mock branches earn their keep — the keyboard walks now step off the overlay's pinned rects).

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): drag overlay previews with dimmed origin"
```

---

### Task 3: Indicator line + card tint + tab-trigger highlight (single-source feedback)

**Files:**
- Create: `src/editor/drop-indicator.tsx` (`DropIndicatorLine`)
- Modify: `src/editor/editor-canvas.tsx` (`liveTarget` state via `onDragOver`, line/tint/highlight wiring, `TabDropZone` highlight)
- Modify: `src/editor/card-frame.tsx` (`dropTint` + `dropIndicator` props)
- Modify: `src/editor/__tests__/drag-feedback.test.tsx` (six feedback pins)

**Interfaces:**
- Produces: during a drag, at most ONE `[data-testid="drop-indicator"]` exists, carrying `data-position` — `"{tabIndex}:{position}"` (the ⊕ boundary dialect) for field targets, `"card:{accessor}:before|after"` for block targets; the ONE receiving frame (field drags in carded tabs) or the ONE hovered foreign tab trigger carries `data-drop-target="true"` with a `primary.subtle` background wash; card block drags tint nothing; null targets (self/no-move/own-tab) render neither line nor highlight. All of it derives from the `liveTarget` state fed by `resolveDropTarget` — the same function the end handler applies.

- [ ] **Step 1: Write the failing tests**

In `src/editor/__tests__/drag-feedback.test.tsx`, first extend the imports — replace:

```tsx
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import { EditorWrap, makeCard, makeField, testPlugins } from "./editor-helpers";
```

with:

```tsx
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { resolveDropTarget } from "../resolve-drop-target";
import { useSpecDraft } from "../use-spec-draft";
import {
	EditorWrap,
	makeCard,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";
```

then add the sectioned-canvas rect mock this task's tab tests drive — insert directly BEFORE the `/** Lift via keyboard, …` comment:

```tsx
/** Sectioned-canvas rect mock: tab-trigger drop zones along y=0 (spread
 * horizontally), shells stacked below at x=`shellLeft` — steering keyboard
 * ArrowUp toward tabdrop-0 (shellLeft=0) or tabdrop-1 (shellLeft=200). The
 * overlay preview is pinned to the dragged shell-a's initial rect. */
function tabdropRectMock(shellLeft: number) {
	return vi
		.spyOn(Element.prototype, "getBoundingClientRect")
		.mockImplementation(function (this: Element) {
			const rect = (top: number, left: number, width = 200, height = 50) =>
				({
					top,
					left,
					width,
					height,
					bottom: top + height,
					right: left + width,
					x: left,
					y: top,
					toJSON() {
						return this;
					},
				}) as DOMRect;
			const testId = this.getAttribute("data-testid") ?? "";
			if (testId === "drag-overlay-preview") return rect(100, shellLeft);
			if (testId.startsWith("tabdrop-")) {
				return rect(0, Number(testId.slice("tabdrop-".length)) * 200, 100, 40);
			}
			if (testId.startsWith("shell-")) {
				const shells = Array.from(
					document.querySelectorAll('[data-testid^="shell-"]'),
				);
				return rect(100 + shells.indexOf(this) * 60, shellLeft);
			}
			return rect(0, 0, 0, 0);
		});
}

```

Then append at the end of the file:

```tsx
describe("indicator line + tint + highlight (Decisions 3–4)", () => {
	it("field drag between shells: exactly one line, at resolveDropTarget's slot", async () => {
		const rectSpy = columnRectMock(0);
		const schema = [makeField("a"), makeField("b"), makeField("c")];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		arrow("ArrowDown"); // over shell-b

		// THE single-source pin: the rendered line's slot is computed by the
		// very function handleDragEnd will apply on release.
		const expected = resolveDropTarget(
			"a",
			"b",
			schema,
			partitionSchemaBySections(schema),
		);
		if (expected?.kind !== "field" || !expected.indicator) {
			throw new Error("fixture no longer resolves to a field target");
		}
		const indicator = screen.getByTestId("drop-indicator"); // getBy: exactly one
		expect(indicator).toHaveAttribute(
			"data-position",
			`${expected.indicator.tabIndex}:${expected.indicator.position}`,
		);
		// …and concretely: dragging a below b puts the line above shell-c.
		expect(indicator.getAttribute("data-position")).toBe("0:2");
		expect(screen.getByTestId("shell-c").parentElement).toContainElement(
			indicator,
		);

		cancel();
		expect(screen.queryByTestId("drop-indicator")).toBeNull();
		rectSpy.mockRestore();
	});

	it("field over a card marker from below: line at the card's top, exactly ONE tint", async () => {
		const rectSpy = columnRectMock(240); // f4 = column index 4
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("m0", "One"),
						makeField("f1"),
						makeField("f2"),
						makeCard("m3", "Two"),
						makeField("f4"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-f4")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		// Four steps up the flat column: f4 → m3 → f2 → f1 → m0.
		arrow("ArrowUp");
		arrow("ArrowUp");
		arrow("ArrowUp");
		arrow("ArrowUp");

		const indicator = screen.getByTestId("drop-indicator");
		expect(indicator.getAttribute("data-position")).toBe("0:1");
		// The line renders INSIDE the receiving card's frame (its top slot)…
		expect(screen.getByTestId("card-frame-m0")).toContainElement(indicator);
		// …which is the ONE tinted frame (Decision 4's exactly-one rule).
		expect(screen.getByTestId("card-frame-m0")).toHaveAttribute(
			"data-drop-target",
			"true",
		);
		expect(screen.getByTestId("card-frame-m3")).not.toHaveAttribute(
			"data-drop-target",
		);
		expect(
			document.querySelectorAll(
				'[data-testid^="card-frame-"][data-drop-target="true"]',
			),
		).toHaveLength(1);

		cancel();
		rectSpy.mockRestore();
	});

	it("dropping into an EMPTY card: line + tint inside it; a no-move renders nothing", async () => {
		const rectSpy = columnRectMock(120); // f1 = column index 2
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("m0", "Empty"),
						makeCard("m1", "Full"),
						makeField("f1"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-f1")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		arrow("ArrowUp"); // over m1 — f1's OWN marker: a no-move (null target)
		expect(screen.queryByTestId("drop-indicator")).toBeNull();
		expect(
			document.querySelectorAll('[data-drop-target="true"]'),
		).toHaveLength(0);

		arrow("ArrowUp"); // over m0 — the empty card
		const indicator = screen.getByTestId("drop-indicator");
		expect(indicator.getAttribute("data-position")).toBe("0:1");
		expect(screen.getByTestId("card-frame-m0")).toContainElement(indicator);
		expect(screen.getByTestId("card-frame-m0")).toHaveAttribute(
			"data-drop-target",
			"true",
		);

		cancel();
		rectSpy.mockRestore();
	});

	it("card block drag: line between frames, NO tint or highlight anywhere", async () => {
		const rectSpy = columnRectMock(0); // dragging card-frame-c1 (top row)
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "One"),
						makeField("a"),
						makeCard("c2", "Two"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = screen.getAllByLabelText("Drag to move card")[0];
		await lift(handle);
		arrow("ArrowDown"); // over shell-a — c1's OWN block: null target
		expect(screen.queryByTestId("drop-indicator")).toBeNull();

		arrow("ArrowDown"); // over card-frame-c2 → block lands AFTER c2
		const indicator = screen.getByTestId("drop-indicator");
		expect(indicator.getAttribute("data-position")).toBe("card:c2:after");
		expect(screen.getByTestId("card-frame-c2")).toContainElement(indicator);
		// Block drags highlight NOTHING (Decision 4): no frame tint, no
		// trigger highlight — data-drop-target does not exist on the page.
		expect(
			document.querySelectorAll('[data-drop-target="true"]'),
		).toHaveLength(0);

		cancel();
		rectSpy.mockRestore();
	});

	it("cross-tab drag: the hovered FOREIGN trigger highlights, no line", async () => {
		const rectSpy = tabdropRectMock(200); // shells under tabdrop-1
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeField("x"),
						makeSection("s1", "SEO"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		arrow("ArrowUp"); // nearest droppable above: tabdrop-1 (the SEO tab)

		expect(screen.getByTestId("tabdrop-1")).toHaveAttribute(
			"data-drop-target",
			"true",
		);
		expect(screen.queryByTestId("drop-indicator")).toBeNull();
		// The hover-activation (pre-0.11 behavior) still switches the view.
		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		cancel();
		expect(screen.getByTestId("tabdrop-1")).not.toHaveAttribute(
			"data-drop-target",
		);
		rectSpy.mockRestore();
	});

	it("own-tab trigger: activates but does NOT highlight (null target)", async () => {
		const rectSpy = tabdropRectMock(0); // shells under tabdrop-0
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeField("x"),
						makeSection("s1", "SEO"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		await lift(handle);
		arrow("ArrowUp"); // nearest droppable above: tabdrop-0 — a's OWN tab

		// Releasing here is a no-op (self-tab guard) — an honest preview
		// shows NO highlight, discriminating highlight from activation.
		expect(screen.getByTestId("tabdrop-0")).not.toHaveAttribute(
			"data-drop-target",
		);
		expect(screen.queryByTestId("drop-indicator")).toBeNull();

		cancel();
		rectSpy.mockRestore();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/drag-feedback.test.tsx`
Expected: all six new tests FAIL (no `drop-indicator` testid, no `data-drop-target` attribute exists anywhere); the Task 1/2 tests stay green.

- [ ] **Step 3: Implement — `src/editor/drop-indicator.tsx`**

Create the file:

```tsx
// src/editor/drop-indicator.tsx
import { Box, Flex } from "@chakra-ui/react";

export type DropIndicatorVariant = "above" | "below" | "flow";

/**
 * The mid-drag insertion line (drag-feedback spec 2026-07-14, Decision 3):
 * a 3px accent line with an end-dot at the exact insertion point. It
 * renders in the SAME geometry slots as the ⊕ insertion boundaries (which
 * are display:none during a drag): "above" mirrors the overlay boundary
 * (an absolute strip filling the 20px gap above a shell/frame), "below" is
 * its bottom-edge mirror (a block landing after the last frame), "flow"
 * mirrors the in-flow trailing boundary at the end of a tab or card body.
 *
 * `active=false` renders the empty strip only: during a drag every flow
 * slot must keep the hidden ⊕ boundary's height so the list holds still
 * (Decision 2) — the line itself appears in at most ONE slot.
 *
 * `position` is the slot's identity for tests and the single-source pin:
 * "{tabIndex}:{position}" (boundary dialect) for field targets,
 * "card:{accessor}:before|after" for card block targets.
 */
export function DropIndicatorLine({
	variant,
	active = true,
	position,
}: {
	variant: DropIndicatorVariant;
	active?: boolean;
	position?: string;
}) {
	return (
		<Flex
			data-testid={active ? "drop-indicator" : undefined}
			data-position={active ? position : undefined}
			align="center"
			height="5"
			pointerEvents="none"
			{...(variant === "flow"
				? { position: "relative" as const }
				: {
						position: "absolute" as const,
						left: "0",
						right: "0",
						zIndex: "docked",
						...(variant === "above" ? { top: "-5" } : { bottom: "-5" }),
					})}
		>
			{active && (
				<>
					<Box
						width="2"
						height="2"
						borderRadius="full"
						bg="accent"
						flexShrink="0"
					/>
					<Box flex="1" borderTopWidth="3px" borderColor="accent" />
				</>
			)}
		</Flex>
	);
}
DropIndicatorLine.displayName = "DropIndicatorLine";
```

- [ ] **Step 4: Implement — canvas wiring**

All edits in `src/editor/editor-canvas.tsx`:

1. Imports — replace:

```tsx
import {
	CardDragPreview,
	ShellDragPreview,
	cardBlockFieldCount,
} from "./drag-previews";
import { FieldShell } from "./field-shell";
import { resolveDropTarget } from "./resolve-drop-target";
```

with:

```tsx
import {
	CardDragPreview,
	ShellDragPreview,
	cardBlockFieldCount,
} from "./drag-previews";
import { DropIndicatorLine } from "./drop-indicator";
import { FieldShell } from "./field-shell";
import {
	type ResolvedDropTarget,
	resolveDropTarget,
} from "./resolve-drop-target";
```

2. `TabDropZone` — replace the whole component:

```tsx
/** Droppable wrapper for a tab-trigger row — a cross-section drag target. */
function TabDropZone({
	tabIndex,
	children,
}: {
	tabIndex: number;
	children: ReactNode;
}) {
	const { setNodeRef } = useDroppable({ id: `tabdrop-${tabIndex}` });
	return (
		<Box ref={setNodeRef} data-testid={`tabdrop-${tabIndex}`}>
			{children}
		</Box>
	);
}
TabDropZone.displayName = "TabDropZone";
```

with:

```tsx
/** Droppable wrapper for a tab-trigger row — a cross-section drag target.
 * `highlighted` marks the RESOLVED cross-tab drop target mid-drag
 * (drag-feedback spec, Decision 3: highlight, no line): a background wash
 * only — never a border, which is the selection channel (Decision 4). */
function TabDropZone({
	tabIndex,
	highlighted,
	children,
}: {
	tabIndex: number;
	highlighted?: boolean;
	children: ReactNode;
}) {
	const { setNodeRef } = useDroppable({ id: `tabdrop-${tabIndex}` });
	return (
		<Box
			ref={setNodeRef}
			data-testid={`tabdrop-${tabIndex}`}
			data-drop-target={highlighted ? "true" : undefined}
			bg={highlighted ? "primary.subtle" : undefined}
			borderRadius="md"
		>
			{children}
		</Box>
	);
}
TabDropZone.displayName = "TabDropZone";
```

3. State — replace:

```tsx
	// The dragged field's accessor while a drag is live — drives the overlay
	// preview clone (drag-feedback spec, Decision 1).
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
```

with:

```tsx
	// The dragged field's accessor while a drag is live — drives the overlay
	// preview clone (drag-feedback spec, Decision 1).
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	// The live drop resolution (Decision 3): refreshed on every dnd-kit over
	// change, cleared on drop/cancel. handleDragEnd resolves the SAME
	// function at release — line, tint, highlight, and the executed move can
	// never disagree.
	const [liveTarget, setLiveTarget] = useState<ResolvedDropTarget | null>(
		null,
	);
```

4. `handleDragOver` — replace:

```tsx
	// Hovering a tab-trigger drop zone while dragging activates that tab so
	// the user can see where the field will land before releasing.
	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		if (typeof overId !== "string" || !overId.startsWith("tabdrop-")) return;
		onActiveTabChange(Number(overId.slice("tabdrop-".length)));
	};
```

with:

```tsx
	// Hovering a tab-trigger drop zone while dragging activates that tab so
	// the user can see where the field will land before releasing. The
	// activation stays UNCONDITIONAL (not gated on resolveDropTarget):
	// hovering back onto the SOURCE tab's own trigger is a null target
	// (releasing there is a no-op) but must still switch the view back.
	// Highlight ≠ activation: only a non-null tab target highlights.
	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		if (typeof overId === "string" && overId.startsWith("tabdrop-")) {
			onActiveTabChange(Number(overId.slice("tabdrop-".length)));
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
```

5. Start/cancel/end clear the target — replace:

```tsx
	const handleDragStart = (event: DragStartEvent) => {
		setDragActive(true);
		setActiveDragId(String(event.active.id));
	};
	const handleDragCancel = () => {
		setDragActive(false);
		setActiveDragId(null);
	};
```

with:

```tsx
	const handleDragStart = (event: DragStartEvent) => {
		setDragActive(true);
		setActiveDragId(String(event.active.id));
		setLiveTarget(null);
	};
	const handleDragCancel = () => {
		setDragActive(false);
		setActiveDragId(null);
		setLiveTarget(null);
	};
```

then replace (in `handleDragEnd`):

```tsx
		setDragActive(false);
		setActiveDragId(null);
		const { active, over } = event;
```

with:

```tsx
		setDragActive(false);
		setActiveDragId(null);
		setLiveTarget(null);
		const { active, over } = event;
```

6. Kind splits — insert directly BEFORE `const renderFields = (fields: Field[], tabIndex: number) => {`:

```tsx
	// Split the live target by kind once — renderFields and the tab strip
	// read these (exactly one of the three is non-null during a drag with a
	// resolvable target; all null otherwise).
	const fieldTarget = liveTarget?.kind === "field" ? liveTarget : null;
	const cardBlockTarget =
		liveTarget?.kind === "card-block" ? liveTarget : null;
	const tabTarget = liveTarget?.kind === "tab" ? liveTarget : null;

```

7. Line above a shell — replace (inside `shellFor`):

```tsx
				<Box position="relative">
					{insertionBoundary(tabIndex, tabPosition, "overlay")}
					<FieldShell
```

with:

```tsx
				<Box position="relative">
					{insertionBoundary(tabIndex, tabPosition, "overlay")}
					{fieldTarget?.indicator?.tabIndex === tabIndex &&
						fieldTarget.indicator.position === tabPosition && (
							<DropIndicatorLine
								variant="above"
								position={`${tabIndex}:${tabPosition}`}
							/>
						)}
					<FieldShell
```

8. Card-less trailing slot — replace:

```tsx
					<Stack gap="5">
						{fields.map((field, i) => shellFor(field, i))}
						{insertionBoundary(
							tabIndex,
							fields.length,
							"flow",
							fields.length === 0, // empty tab: visible drop zone
						)}
					</Stack>
```

with:

```tsx
					<Stack gap="5">
						{fields.map((field, i) => shellFor(field, i))}
						{insertionBoundary(
							tabIndex,
							fields.length,
							"flow",
							fields.length === 0, // empty tab: visible drop zone
						)}
						{/* Mid-drag the ⊕ boundary above is display:none — this
						    same-height slot replaces it so the tab end doesn't
						    collapse (the list holds still), and it carries the
						    line when the tab-end slot is the resolved target. */}
						{dragActive && (
							<DropIndicatorLine
								variant="flow"
								active={
									fieldTarget?.indicator?.tabIndex === tabIndex &&
									fieldTarget.indicator.position === fields.length
								}
								position={`${tabIndex}:${fields.length}`}
							/>
						)}
					</Stack>
```

9. Card-body trailing slot — replace:

```tsx
						const body = (
							<Stack gap="5">
								{group.fields.map((field, j) => shellFor(field, bodyStart + j))}
								{insertionBoundary(
									tabIndex,
									bodyStart + group.fields.length,
									"flow",
									group.fields.length === 0, // empty card: visible drop zone
								)}
							</Stack>
						);
```

with:

```tsx
						const body = (
							<Stack gap="5">
								{group.fields.map((field, j) => shellFor(field, bodyStart + j))}
								{insertionBoundary(
									tabIndex,
									bodyStart + group.fields.length,
									"flow",
									group.fields.length === 0, // empty card: visible drop zone
								)}
								{/* Same-height flow slot mid-drag — see the card-less
								    branch. This is also where an EMPTY card's line
								    renders (its bodyStart slot). */}
								{dragActive && (
									<DropIndicatorLine
										variant="flow"
										active={
											fieldTarget?.indicator?.tabIndex === tabIndex &&
											fieldTarget.indicator.position ===
												bodyStart + group.fields.length
										}
										position={`${tabIndex}:${bodyStart + group.fields.length}`}
									/>
								)}
							</Stack>
						);
```

10. CardFrame feedback props — replace:

```tsx
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								menu={buildCardMenu(group.card)}
								labels={labels}
							>
```

with:

```tsx
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								menu={buildCardMenu(group.card)}
								labels={labels}
								dropTint={
									fieldTarget?.tintCardAccessor ===
									group.card.config.api_accessor
								}
								dropIndicator={
									cardBlockTarget?.targetCardAccessor ===
									group.card.config.api_accessor
										? cardBlockTarget.placement
										: null
								}
							>
```

11. TabDropZone highlight — `replace_all` (two call sites, byte-identical):

```tsx
										<TabDropZone key={key} tabIndex={i}>
```

with:

```tsx
										<TabDropZone
											key={key}
											tabIndex={i}
											highlighted={tabTarget?.tabIndex === i}
										>
```

- [ ] **Step 5: Implement — `card-frame.tsx` tint + between-frame lines**

1. Import — replace:

```tsx
import type { Field } from "../schema/types";
import type { EditorLabels } from "./spec-editor";
```

with:

```tsx
import type { Field } from "../schema/types";
import { DropIndicatorLine } from "./drop-indicator";
import type { EditorLabels } from "./spec-editor";
```

2. Props — replace:

```tsx
	/** The ⋯ menu node; the canvas builds it (it owns the delete flows). */
	menu?: ReactNode;
	labels: CardFrameLabels;
	children: ReactNode;
}
```

with:

```tsx
	/** The ⋯ menu node; the canvas builds it (it owns the delete flows). */
	menu?: ReactNode;
	labels: CardFrameLabels;
	children: ReactNode;
	/** Mid-drag: this frame's body contains the resolved drop slot — a soft
	 * accent BACKGROUND wash only (never the border: that channel stays
	 * selection's). Drag-feedback spec 2026-07-14, Decision 4. */
	dropTint?: boolean;
	/** Mid-drag: a card BLOCK drag resolved to before/after this frame —
	 * renders the insertion line in the gap between frames (Decision 3). */
	dropIndicator?: "before" | "after" | null;
}
```

3. Destructure — replace:

```tsx
export function CardFrame({
	card,
	selected,
	onSelect,
	menu,
	labels,
	children,
}: CardFrameProps) {
```

with:

```tsx
export function CardFrame({
	card,
	selected,
	onSelect,
	menu,
	labels,
	children,
	dropTint,
	dropIndicator,
}: CardFrameProps) {
```

4. Root Box — replace:

```tsx
			// Dimmed origin (drag-feedback spec, Decision 1) — see FieldShell.
			opacity={isDragging ? 0.35 : 1}
			data-drag-origin={isDragging ? "true" : undefined}
			bg="bg-surface"
			borderWidth="2px"
			borderStyle={isDragging ? "dashed" : "solid"}
			borderColor={selected ? "accent" : "border"}
			borderRadius="lg"
			boxShadow="sm"
			data-testid={`card-frame-${accessor}`}
		>
```

with:

```tsx
			// Dimmed origin (drag-feedback spec, Decision 1) — see FieldShell.
			opacity={isDragging ? 0.35 : 1}
			data-drag-origin={isDragging ? "true" : undefined}
			// Drop-target tint (Decision 4): background wash only. anker has no
			// accent-subtle token; primary.subtle IS the accent palette's
			// semantic subtle step (light/dark aware). The header keeps its own
			// bg-subtle — the wash shows in the body, where fields land.
			bg={dropTint ? "primary.subtle" : "bg-surface"}
			data-drop-target={dropTint ? "true" : undefined}
			position="relative"
			borderWidth="2px"
			borderStyle={isDragging ? "dashed" : "solid"}
			borderColor={selected ? "accent" : "border"}
			borderRadius="lg"
			boxShadow="sm"
			data-testid={`card-frame-${accessor}`}
		>
			{/* Block-drag insertion line, in the Stack's 20px inter-frame gap
			    (Decision 3: card block-drags get a line between frames and
			    highlight nothing). */}
			{dropIndicator === "before" && (
				<DropIndicatorLine
					variant="above"
					position={`card:${accessor}:before`}
				/>
			)}
			{dropIndicator === "after" && (
				<DropIndicatorLine
					variant="below"
					position={`card:${accessor}:after`}
				/>
			)}
```

- [ ] **Step 6: Run tests to verify they pass, full gates + commit**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — the six feedback tests go green; the frozen net stays green (the feedback is render-only; `handleDragEnd` still resolves fresh at release).

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): drop indicator line, card tint, tab highlight"
```

---

### Task 4: Docs (mdx dnd rewrite, migration note, dnd-kit reference), stories, CLAUDE.md, 0.11.0 + runtime gate

**Files:**
- Modify: `src/editor/spec-editor.mdx` (Drag & drop rewrite, keyboard bullet, labels table, Migration to 0.11.0)
- Rewrite: `docs/dnd-kit-reference.md` (stale since the editor redesign)
- Modify: `src/editor/spec-editor.stories.tsx` (BuildWithCards note)
- Modify: `CLAUDE.md` (editor directory-layout entries)
- Modify: `package.json` (`"version": "0.10.1"` → `"0.11.0"`) + `package-lock.json` (via `npm install --package-lock-only`)
- Create (scratchpad, NOT committed): the runtime-gate probe `dnd-gate.mjs`

**Interfaces:** consumes everything above; produces a release-ready branch. Tag push / npm publish NOT in this plan.

- [ ] **Step 1: `spec-editor.mdx`**

1. Drag & drop section — replace:

```
### Drag & drop, including cross-tab

Fields reorder within a tab via the shell's always-visible grip (pointer or
keyboard — see
[Keyboard Support](#keyboard-support)). Dragging a field's row onto another
tab's *trigger* (not just reordering within the active tab) activates that
tab live, previewing the drop target, and releasing moves the field to the
end of that tab — the same operation the toolbar's "Move to section" menu
performs without any dragging at all. Dropping onto a field's own current
tab trigger is a no-op.
```

with:

```
### Drag & drop, including cross-tab

Fields reorder within a tab via the shell's always-visible grip (pointer or
keyboard — see [Keyboard Support](#keyboard-support)). Since 0.11.0 the
canvas gives full mid-drag feedback (the drag-feedback rework):

- **A fixed-size preview follows the pointer** — a dnd-kit `DragOverlay`
  clone, portaled to `document.body`. Field drags carry a clone of the
  shell; card block-drags carry the card's HEADER BAR only plus a
  "+ N fields" count hint (`cardDragFields`/`cardDragFieldsOne`). The
  in-list original stays in place, dimmed with a dashed outline.
- **The list holds still**: no other shell or frame moves, scales, or
  reflows during a drag. (Pre-0.11, dnd-kit's list strategy scaled the
  dragged node to the hovered slot's size and translated nested card
  frames independently of their children — both artifacts are structurally
  gone.)
- **A 3px accent insertion line with an end-dot marks the exact drop
  slot** — between shells, between card frames (block drags), at a card's
  top, or inside an empty card — and **the card that would receive the
  field washes with a soft accent background tint** (background only; the
  accent *border* remains the selection channel; card block-drags tint
  nothing). Line, tint, and the executed drop all derive from ONE
  resolution (`resolveDropTarget`), so the preview can never disagree with
  the result.
- Dragging a field's row onto another tab's *trigger* activates that tab
  live and **highlights the trigger** (no line); releasing moves the field
  to the end of that tab — the same operation the toolbar's "Move to
  section" menu performs without any dragging at all. Dropping onto a
  field's own current tab trigger is a no-op and shows no highlight (the
  hover still activates the tab).
- **Keyboard drags get the identical treatment**: the overlay glides to
  each announced slot with the same line, tint, and trigger highlight.
```

2. Keyboard support — replace:

```
- **Reordering**: the shell grip (always visible — no selection needed) is
  a `dnd-kit` `KeyboardSensor` target —
  focus it and press <kbd>Space</kbd> to lift, <kbd>↑</kbd>/<kbd>↓</kbd> to
  move, <kbd>Space</kbd> again to drop, <kbd>Escape</kbd> to cancel.
```

with:

```
- **Reordering**: the shell grip (always visible — no selection needed) is
  a `dnd-kit` `KeyboardSensor` target —
  focus it and press <kbd>Space</kbd> to lift, <kbd>↑</kbd>/<kbd>↓</kbd> to
  move, <kbd>Space</kbd> again to drop, <kbd>Escape</kbd> to cancel. Since
  0.11.0 keyboard drags render the identical feedback to pointer drags:
  the overlay preview glides to each announced slot, and the insertion
  line, card tint, and tab-trigger highlight track every move.
```

3. Labels table — replace:

```
| `dragCard` | `"Drag to move card"` | Card header drag-handle aria-label/tooltip (moves the whole card block) |
```

with:

```
| `dragCard` | `"Drag to move card"` | Card header drag-handle aria-label/tooltip (moves the whole card block) |
| `cardDragFields` | `"+ {count} fields"` | Count hint on the card block-drag overlay preview (`{count}` interpolated; 0.11.0) |
| `cardDragFieldsOne` | `"+ 1 field"` | Count hint on the card block-drag overlay preview at count 1 |
```

4. Migration note — replace:

```
## Migration to 0.10.1
```

with:

```
## Migration to 0.11.0

Visual-only rework of mid-drag feedback — **no API changes, no
drop-semantics changes** (every drop lands exactly where it did in 0.10):

- Dragging now shows a **fixed-size overlay preview** (a dnd-kit
  `DragOverlay`, portaled to `document.body`) instead of transforming the
  real shell; the origin stays in place, dimmed (opacity 0.35, dashed
  outline, `data-drag-origin`). The pre-0.11 scale artifact (a dragged
  shell stretching to the hovered slot's size) and frame escape (a card's
  child floating outside its frame) are gone at the root.
- **No list reflow during a drag**: other shells/frames no longer
  translate out of the way. The insertion point is announced by a 3px
  accent line with an end-dot (`data-testid="drop-indicator"`, slot
  identity in `data-position`), plus a soft background tint on the
  receiving card and a highlight on a hovered foreign tab trigger (both
  `data-drop-target="true"`).
- Two new label keys caption the card block-drag preview's count hint:
  `cardDragFields` (`"+ {count} fields"`) and `cardDragFieldsOne`
  (`"+ 1 field"`).
- Tests that asserted dnd-kit transforms on shells mid-drag
  (`translate3d`/`scaleY` inline styles) should assert the new feedback
  surfaces instead. jsdom keyboard-drag tests that mock
  `getBoundingClientRect` must give `[data-testid="drag-overlay-preview"]`
  the dragged item's initial rect — dnd-kit derives the keyboard collision
  rect from the overlay once it mounts (see `docs/dnd-kit-reference.md`).

## Migration to 0.10.1
```

- [ ] **Step 2: Rewrite `docs/dnd-kit-reference.md`**

Replace the ENTIRE file content with:

```md
# dnd-kit Reference for Fieldkit

How fieldkit uses `@dnd-kit/core` (6.3.1) and `@dnd-kit/sortable` (8.0.0)
for drag-and-drop in the spec editor. Read this before modifying editor
drag code. Rewritten for the 0.11.0 drag-feedback rework (overlay preview,
still list, `resolveDropTarget`) — design record:
`docs/superpowers/specs/2026-07-14-drag-feedback-design.md`.

## Scope

dnd-kit is used only by the **editor layer**:

| File | Role |
|---|---|
| `src/editor/editor-canvas.tsx` | `DndContext` (×2: sectionless + sectioned), sensors, both `SortableContext`s, all drag handlers, the portaled `DragOverlay`, live feedback state |
| `src/editor/field-shell.tsx` | `useSortable` per field shell; the persistent grip carries `attributes`/`listeners` |
| `src/editor/card-frame.tsx` | `useSortable` per card marker; the header grip block-moves the card |
| `src/editor/visible-collision.ts` | `visibleClosestCenter` — `closestCenter` filtered to visible (non-zero-rect) droppables |
| `src/editor/resolve-drop-target.ts` | Pure drop resolution shared by `handleDragEnd` and the live indicator/tint/highlight |
| `src/editor/drag-previews.tsx`, `src/editor/drop-indicator.tsx` | Presentational: overlay clones, insertion line |

No other layer (renderer, table, rich-text-spec, schema) uses dnd-kit.
`EditorSpecEditor` uses toggle checkboxes, not drag-and-drop.

## The 0.11.0 drag model (read this first)

Each tab is ONE flat sortable list — card markers AND fields — regardless
of how the DOM nests fields inside card frames. During a drag:

1. **The real nodes never move.** Both `SortableContext`s use a no-op
   strategy (`noopSortingStrategy = () => null`), so `useSortable` hands
   every item a `null` transform. With a mounted `DragOverlay`, dnd-kit
   also stops displacing the drag source (`shouldDisplaceDragSource ===
   false` once `dragOverlay.rect` measures), so the ACTIVE node stays
   untransformed too. This killed the two measured 0.10 artifacts: the
   scale artifact (the list strategy scaled the dragged node to the
   hovered slot's size — `scaleY 0.33–3.5` measured) and frame escape
   (flat-strategy translations moved a frame −301px while its child moved
   −151px).
2. **A `DragOverlay` clone follows the pointer** — portaled to
   `document.body` by fieldkit (dnd-kit does NOT portal it; it renders a
   `position: fixed` wrapper in place, which a transformed host ancestor
   would re-anchor). Field drags clone the shell interior
   (`ShellDragPreview`); card drags clone the header bar + a "+ N fields"
   hint (`CardDragPreview`, wrapper collapsed via `style={{height:
   "auto"}}`). The clone root carries
   `data-testid="drag-overlay-preview"`. The origin dims in place
   (`data-drag-origin`, opacity 0.35, dashed border).
3. **Feedback = `resolveDropTarget`.** `onDragOver` stores the resolved
   target; the insertion line (`drop-indicator` + `data-position`), the
   receiving card's `primary.subtle` tint, and the tab-trigger highlight
   (`data-drop-target`) render from it — and `handleDragEnd` resolves the
   SAME function at release. One source of truth; they cannot disagree.
4. **No settle transforms**: both `useSortable` calls pass
   `animateLayoutChanges: () => false` (the default re-transforms a moved
   node from its old rect, including a transient scale whenever its width
   changes); the overlay's default drop animation is the only settle.

## Imports used

### From `@dnd-kit/core`

| Import | Purpose |
|---|---|
| `DndContext` | Outermost boundary |
| `DragOverlay` | The drag clone (fieldkit portals it to `document.body`) |
| `closestCenter` | Base collision strategy (wrapped by `visibleClosestCenter`) |
| `PointerSensor` / `KeyboardSensor` + `useSensor`/`useSensors` | Input |
| `useDroppable` | Tab-trigger drop zones (`tabdrop-N`) |
| `DragStartEvent` / `DragOverEvent` / `DragEndEvent` (types) | Handlers |

### From `@dnd-kit/sortable`

| Import | Purpose |
|---|---|
| `SortableContext` | One per tab's flat list |
| `SortingStrategy` (type) | Types the no-op strategy |
| `useSortable` | Shells + card frames |
| `sortableKeyboardCoordinates` | Arrow-key coordinate getter |

### From `@dnd-kit/utilities`

| Import | Purpose |
|---|---|
| `CSS` | `CSS.Translate.toString(transform)` — translate-only serialization (belt: scale components can never reach a real node again) |

## Sensors and DndContext

Unchanged since 0.8: `PointerSensor` with `activationConstraint:
{ distance: 8 }` (click vs drag dead zone) + `KeyboardSensor` with
`sortableKeyboardCoordinates`; `collisionDetection={visibleClosestCenter}`
(hidden tabs stay mounted, so zero-rect droppables must be filtered). ALL
FIVE handlers are wired: `onDragStart` (drag flag + overlay id),
`onDragOver` (unconditional tabdrop hover-activation + live target),
`onDragEnd` (resolve + apply), `onDragCancel` (reset).

## Verified engine facts (checked against the installed sources)

- `SortableContext` detects an overlay via `dragOverlay.rect !== null`,
  set once the overlay node mounts and measures.
- **Keyboard collision rect:** once the overlay measures, dnd-kit derives
  `collisionRect` from `dragOverlay.rect ?? activeNodeRect`, and
  `sortableKeyboardCoordinates` direction-filters candidates against it.
  **Any jsdom test that fakes `getBoundingClientRect` for keyboard walks
  MUST give `[data-testid="drag-overlay-preview"]` the dragged item's
  initial rect** — see the mocks in `dnd.test.tsx`,
  `cards-canvas.test.tsx`, and `drag-feedback.test.tsx`.
- The overlay wrapper measures its single CHILD (`getMeasurableNode`), so
  the preview root's testid is the measured element. The testid must never
  start with `shell-` or `card-frame-` (document-level mocks and order
  queries key on those prefixes).
- Keyboard drags position the overlay with a built-in `transform 250ms
  ease` transition (pointer drags: none) — keyboard parity costs no code.
- The default drop animation reads `getComputedStyle(node).transform` and
  `parseTransform` only accepts `matrix()`/`matrix3d()` — jsdom never
  produces those, so it early-returns before `node.animate` (which jsdom
  lacks). The default `dropAnimation` is therefore test-safe; the post-drop
  clone unmount is async (assert absence with `waitFor`).

## When adding new drag-and-drop

1. `PointerSensor` `{ distance: 8 }` + `KeyboardSensor` with
   `sortableKeyboardCoordinates`.
2. `visibleClosestCenter` when hidden-but-mounted droppables exist;
   plain `closestCenter` otherwise.
3. For heterogeneous-height lists (or any nested-DOM rendering of a flat
   list): `DragOverlay` clone + no-op strategy. `verticalListSortingStrategy`
   only fits homogeneous flat lists where a reflow preview is wanted.
4. Keep state fully controlled; separate `setNodeRef` (container) from
   `listeners`/`attributes` (grip button). Lucide `GripVertical` for handles.
5. `CSS.Translate.toString()` for transform styles.
6. Route the live feedback AND the drop through one pure resolver function.

## What is NOT used

| Feature | Why |
|---|---|
| `modifiers` | No axis restriction or boundary clamping |
| `adjustScale` | Off (default) — the clone never scales |
| `MouseSensor` / `TouchSensor` | `PointerSensor` covers both |
| `arrayMove` | Drops splice via draft-ops (`moveField`/`moveCard`/`moveFieldToSection`) |
| Multiple nested `SortableContext`s | Cards stay in the tab's ONE flat list |
```

- [ ] **Step 3: Stories + CLAUDE.md**

1. `src/editor/spec-editor.stories.tsx` — replace:

```tsx
					The "General" tab groups its fields into two cards (one untitled —
					italic placeholder). Try the card header: drag its handle to move the
					whole card, click it to rename via the panel, or open ⋯ for the two
					delete flavors ("Delete card" merges fields into a neighbor; "Delete
					card and fields" confirms first). "+ Card" (in the toolbar) on a tab
					with loose fields auto-wraps them. Select <strong>Preview</strong> to
					see the rendered card layout as a real form.
```

with:

```tsx
					The "General" tab groups its fields into two cards (one untitled —
					italic placeholder). Try the card header: drag its handle to move the
					whole card — a header-bar clone with a "+ N fields" hint follows the
					pointer while an accent line marks the landing slot between frames
					(0.11.0 drag feedback; field drags likewise get a shell clone, an
					insertion line, and a soft tint on the receiving card). Click the
					header to rename via the panel, or open ⋯ for the two delete flavors
					("Delete card" merges fields into a neighbor; "Delete card and
					fields" confirms first). "+ Card" (in the toolbar) on a tab with
					loose fields auto-wraps them. Select <strong>Preview</strong> to see
					the rendered card layout as a real form.
```

2. `CLAUDE.md` — replace:

```
│   ├── editor-canvas.tsx# Build-mode canvas: tabs, shells, dnd, insertion boundaries
```

with:

```
│   ├── editor-canvas.tsx# Build-mode canvas: tabs, shells, dnd + overlay/live feedback, insertion boundaries
│   ├── resolve-drop-target.ts # Pure drop resolution — end handler + live feedback single source
│   ├── drag-previews.tsx# DragOverlay clones (shell interior / card header + field count)
│   ├── drop-indicator.tsx # Mid-drag insertion line (3px accent + end-dot)
```

- [ ] **Step 4: Version bump + lockfile**

In `package.json`, replace `"version": "0.10.1",` with `"version": "0.11.0",` then sync the lockfile:

```bash
npm install --package-lock-only
```

- [ ] **Step 5: Full gates + commit**

Run: `npm run test && npm run typecheck && npm run lint && npm run verify-exports && npm run build && npm run build:storybook`
Expected: all PASS (verify-exports: no public-surface change; build:storybook renders the updated note and mdx).

```bash
git add src/editor/spec-editor.mdx src/editor/spec-editor.stories.tsx docs/dnd-kit-reference.md CLAUDE.md package.json package-lock.json
git commit -m "docs(editor): drag feedback contract; chore: v0.11.0"
```

- [ ] **Step 6: Runtime gate — re-run the investigation probes (the controller's gate step)**

This is the definitive check the spec mandates: **`scaleX`/`scaleY` must measure exactly 1.0 on every canvas node in every drag scenario, and translation/displacement must measure 0** (the pre-rework probes measured `scaleY 0.332–0.767` and a −301px frame vs −151px child). Plus screenshots for the eyeball.

1. Start Storybook in the background: `npm run dev` (wait for `http://localhost:6007` to serve).
2. Write the probe to the session scratchpad (NOT the repo) — `/private/tmp/claude-501/-Users-jeskoiwanovski-repo-fieldkit/4738ce46-531c-41e1-b234-f69056efef88/scratchpad/dnd-gate.mjs` (the parent directory's `node_modules` provides `playwright-core`, exactly as the investigation probes `dnd-probe.mjs`/`dnd-probe2.mjs` there resolved it) — exactly:

```js
// Runtime gate for the drag-feedback rework (fieldkit 0.11.0):
// every canvas shell/frame must be UNTRANSFORMED (scale 1.0, displacement
// 0) in every drag scenario; only the overlay clone moves. Non-zero exit
// on any violation — the caller reads $?, never a piped summary.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const exe =
	"/Users/jeskoiwanovski/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
mkdirSync("shots-drag-feedback", { recursive: true });

let failures = 0;
const fail = (msg) => {
	failures++;
	console.error("GATE FAIL:", msg);
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await (
	await browser.newContext({ viewport: { width: 1400, height: 900 } })
).newPage();
await page.goto(
	"http://localhost:6007/iframe.html?id=editor-speceditor--build-with-cards&viewMode=story",
);
await page.waitForSelector('[data-testid^="card-frame-"]', { timeout: 45000 });

async function assertStill(label, { expectOverlay }) {
	const rows = await page.evaluate(() => {
		const out = [];
		for (const el of document.querySelectorAll(
			'[data-testid^="shell-"]:not([data-testid^="shell-toolbar"]), [data-testid^="card-frame-"]',
		)) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue; // hidden tab
			out.push({
				id: el.dataset.testid,
				transform: getComputedStyle(el).transform,
			});
		}
		return out;
	});
	for (const { id, transform } of rows) {
		if (transform === "none") continue;
		const m = transform.match(/^matrix\(([^)]+)\)$/);
		if (!m) {
			fail(`${label}: ${id} unparseable transform "${transform}"`);
			continue;
		}
		const [a, b, c, d, tx, ty] = m[1].split(",").map(Number);
		if (a !== 1 || d !== 1) fail(`${label}: ${id} scale ${a}/${d} (must be 1.0)`);
		if (b !== 0 || c !== 0) fail(`${label}: ${id} skew ${b}/${c} (must be 0)`);
		if (tx !== 0 || ty !== 0)
			fail(`${label}: ${id} displaced ${tx},${ty} (must be 0)`);
	}
	const overlay = await page.$('[data-testid="drag-overlay-preview"]');
	if (expectOverlay && !overlay) fail(`${label}: overlay preview missing`);
	if (!expectOverlay && overlay) fail(`${label}: overlay preview lingering`);
	const tints = await page.$$(
		'[data-testid^="card-frame-"][data-drop-target="true"]',
	);
	if (tints.length > 1) fail(`${label}: ${tints.length} tinted frames (max 1)`);
	console.log(`${label}: ${rows.length} nodes still, overlay=${!!overlay}`);
}

// Scenario A — field drag, deep over heterogeneous cards (probe-1 replay).
const grip = page.locator(
	'[data-testid="shell-title"] button[aria-label="Drag to reorder"]',
);
const box = await grip.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 10, box.y + 20, { steps: 4 });
await page.waitForTimeout(300);
await assertStill("A: field drag start (+20px)", { expectOverlay: true });
await page.screenshot({ path: "shots-drag-feedback/01-field-start.png" });
await page.mouse.move(box.x + 10, box.y + 180, { steps: 8 });
await page.waitForTimeout(350);
await assertStill("A: field mid drag (+180px)", { expectOverlay: true });
await page.screenshot({ path: "shots-drag-feedback/02-field-mid.png" });
await page.mouse.move(box.x + 10, box.y + 320, { steps: 8 });
await page.waitForTimeout(350);
await assertStill("A: field deep drag (+320px)", { expectOverlay: true });
if (!(await page.$('[data-testid="drop-indicator"]')))
	fail("A: no drop indicator at a resolvable slot");
await page.screenshot({ path: "shots-drag-feedback/03-field-deep.png" });
await page.mouse.up();
await page.waitForTimeout(600); // drop animation + settle window
await assertStill("A: after drop", { expectOverlay: false });
await page.screenshot({ path: "shots-drag-feedback/04-field-dropped.png" });

// Scenario B — card block drag (probe-2 replay).
await page.reload();
await page.waitForSelector('[data-testid^="card-frame-"]', { timeout: 45000 });
const cardGrip = page.locator(
	'[data-testid="card-header-card_basics"] button[aria-label="Drag to move card"]',
);
const cbox = await cardGrip.boundingBox();
await page.mouse.move(cbox.x + 5, cbox.y + 5);
await page.mouse.down();
await page.mouse.move(cbox.x + 5, cbox.y + 30, { steps: 4 });
await page.waitForTimeout(300);
await page.mouse.move(cbox.x + 5, cbox.y + 380, { steps: 10 });
await page.waitForTimeout(400);
await assertStill("B: card block drag (+380px)", { expectOverlay: true });
const cardTints = await page.$$('[data-drop-target="true"]');
if (cardTints.length !== 0)
	fail(`B: card drag must highlight nothing (got ${cardTints.length})`);
await page.screenshot({ path: "shots-drag-feedback/05-card-drag.png" });
await page.mouse.up();
await page.waitForTimeout(600);
await assertStill("B: after card drop", { expectOverlay: false });

// Scenario C — keyboard drag parity.
await page.reload();
await page.waitForSelector('[data-testid^="card-frame-"]', { timeout: 45000 });
await page.focus(
	'[data-testid="shell-title"] button[aria-label="Drag to reorder"]',
);
await page.keyboard.press("Space");
await page.waitForTimeout(150);
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(400); // overlay's 250ms keyboard glide
await assertStill("C: keyboard drag", { expectOverlay: true });
await page.screenshot({ path: "shots-drag-feedback/06-keyboard.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await assertStill("C: after keyboard cancel", { expectOverlay: false });

await browser.close();
if (failures > 0) {
	console.error(`${failures} gate failure(s)`);
	process.exit(1);
}
console.log("GATE PASS: scale 1.0 everywhere, displacement 0, overlay clean");
```

3. Run it FROM that scratchpad directory as its own command — the gate is the process exit code, nothing piped:

```bash
cd /private/tmp/claude-501/-Users-jeskoiwanovski-repo-fieldkit/4738ce46-531c-41e1-b234-f69056efef88/scratchpad && node dnd-gate.mjs
```

Expected: exit 0, `GATE PASS`, six screenshots in `shots-drag-feedback/` for the eyeball (overlay tilt/shadow, dashed dim origin, line + tint legibility in the shots). Any non-1.0 scale, non-0 displacement, lingering overlay, multi-tint, or missing indicator exits 1. Stop Storybook afterwards.

---

## Post-plan (not tasks)

- Final whole-branch review, then a manual Storybook pass (`npm run dev`):
  - `BuildWithCards`: pointer-drag a field slowly across both cards — clone follows with tilt/shadow, origin dims dashed, list rock-still, line + tint track the slot; drag a card header — header-bar clone + "+ N fields", line between frames, no tint.
  - `Build` (sectioned): drag a field over the other tab's trigger — trigger highlights + tab activates; back over its own trigger — activation without highlight.
  - Keyboard: focus a grip, Space/arrows — overlay glides, line + tint follow; Escape cancels cleanly.
  - Dark mode sanity: `primary.subtle` tint and accent line legible.
  - Then merge to main.
- Release: tag `v0.11.0` push **only after explicit user OK**.
- mediahub follow-up (separate repo, on release): bump fieldkit to 0.11.0 — no API changes; e2e tests that assert mid-drag transforms (if any) re-target `drag-overlay-preview`/`drop-indicator`/`data-drop-target`.
