// src/editor/__tests__/grip-click-vs-drag.test.tsx
/**
 * The dead zone between a CLICK on a drag grip and a DRAG from it — driven
 * through the rendered canvas with a real pointer.
 *
 * `field-shell.tsx` states the contract in prose beside the grip: *"A plain
 * click on the grip (under PointerSensor's 8px activation distance) bubbles to
 * the shell's onClick and selects — the card-header behavior."* Its converse —
 * a real drag must **not** also select — is what dnd-kit's capture-phase click
 * blocker exists for. Three production details carry that pair, and until this
 * file none of them was asserted anywhere in the package:
 *
 * 1. `activationConstraint: { distance: 8 }` on the canvas's `PointerSensor`
 *    (`editor-canvas.tsx`) — the dead zone itself;
 * 2. the grip's deliberate LACK of a click `stopPropagation` — the click has to
 *    reach the shell (or the card header) to select at all;
 * 3. the sensor's capture-phase `click` blocker on `document`, installed the
 *    moment the constraint is satisfied and released 50 ms after the sensor
 *    detaches (`AbstractPointerSensor.handleStart` / `.detach`, core 6.3.1).
 *
 * Every other drag test in the package lifts from the KEYBOARD, where there is
 * no activation constraint and no click blocker — so a `stopPropagation` added
 * to the grip, or a changed distance, reddened nothing.
 *
 * **A file of its own because it drives real pointer drags.** jsdom ships no
 * `PointerEvent`, so `PointerSensor` — which activates from `onPointerDown` and
 * reads `isPrimary` off the native event — can never fire in it. A four-line
 * subclass of `MouseEvent` is the whole of what is missing. Defining
 * `PointerEvent` is a GLOBAL change, though, and anker's zag-based components
 * branch on whether it exists — so it lives here, in the file that needs it,
 * rather than in `src/test/setup.ts`, and rather than in the existing
 * `field-shell.test.tsx`, where it would silently change how that file's other
 * fourteen tests behave. `src/editor/__tests__/spring-loaded-tabs.test.tsx` and
 * `src/renderer/fields/__tests__/reference-tree-folds.test.tsx` carry the same
 * four lines for the same reason; this is the third deliberate copy, per the
 * rule those files and `docs/dnd-kit-reference.md` both record.
 *
 * **What this file can and cannot see.** jsdom lays nothing out, so every rect
 * measures 0×0 and `visibleClosestCenter` filters every droppable out — the
 * drags below therefore resolve **no drop target** and commit no move. That is
 * deliberate: the 8px constraint is measured against the coordinates a test
 * FIRES, so the threshold is assertable without geometry, while *where* a drag
 * lands is not. Read a failure here as "the click/drag discrimination broke",
 * never as "the drop resolution broke" — that is `dnd.test.tsx`'s and
 * `drag-feedback.test.tsx`'s business, and they drive it from the keyboard with
 * mocked rects.
 *
 * Everything runs under fake timers, including the halves that do not need to
 * advance a clock: the sensor's blocker is released on a 50 ms `setTimeout`, so
 * a real-timer test cannot settle deterministically and would hand the NEXT
 * test a live capture-phase click blocker — which, in a file whose subject IS
 * that blocker, would be an especially confusing way to fail.
 */
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import {
	CANVAS_LABELS,
	EditorWrap,
	makeCard,
	makeField,
	testPlugins,
} from "./editor-helpers";

/**
 * The whole of what jsdom is missing for a `PointerSensor` drag: a
 * `PointerEvent` that is a `MouseEvent` with `isPrimary` on it. dnd-kit reads
 * `isPrimary`, `button` and `clientX`/`clientY`, all of which this carries.
 */
class TestPointerEvent extends MouseEvent {
	isPrimary: boolean;
	pointerId: number;
	pointerType: string;
	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.isPrimary = init.isPrimary ?? true;
		this.pointerId = init.pointerId ?? 1;
		this.pointerType = init.pointerType ?? "mouse";
	}
}
(globalThis as unknown as { PointerEvent: unknown }).PointerEvent =
	TestPointerEvent;

// anker's Menu/Tooltip positioning relies on @floating-ui/dom's autoUpdate,
// which needs IntersectionObserver — unimplemented in jsdom, and (unlike
// ResizeObserver, which `src/test/setup.ts` ships globally) still every test
// file's own problem. A pointer press puts the grip's Tooltip in reach of an
// autoUpdate tick, so this file needs it.
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

/** The canvas's `PointerSensor` distance constraint, restated so the deltas
 * below visibly bracket it. It is written inline at the `useSensor` call in
 * `editor-canvas.tsx` and is not exported — a mismatch is caught by the tests
 * failing, not by a type error. */
const ACTIVATION_DISTANCE_PX = 8;
/** A shaky click: enough travel to be a real human press, nowhere near the
 * constraint. `hasExceededDistance` compares `sqrt(dx² + dy²) > distance`. */
const UNDER_THRESHOLD_PX = 3;
/** An unambiguous drag — comfortably past the constraint in one step. */
const OVER_THRESHOLD_PX = 20;
/** dnd-kit releases the capture-phase click blocker on a `setTimeout` this long
 * after the sensor detaches (`AbstractPointerSensor.detach`, core 6.3.1). */
const CLICK_BLOCKER_MS = 50;

function Harness({
	schema,
	onSelectSpy,
}: {
	schema: Schema;
	onSelectSpy: (accessor: string) => void;
}) {
	const spec = useSpecDraft(schema, testPlugins, vi.fn());
	const [selected, setSelected] = useState<string | null>(null);
	const [activeTabIndex, setActiveTabIndex] = useState(0);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={testPlugins}
				selectedAccessor={selected}
				// The spy AND the state: the assertions read the spy (it counts
				// calls, which "is it selected?" cannot), but the canvas still has
				// to behave like a selected shell — the toolbar it grows is what
				// makes a stray second selection visible at all.
				onSelect={(a) => {
					onSelectSpy(a);
					setSelected(a);
				}}
				onEdit={(a) => setSelected(a)}
				labels={CANVAS_LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
			/>
		</ConfirmModalProvider>
	);
}
Harness.displayName = "Harness";

/** Two plain fields, no sections — the sectionless `DndContext`, which has no
 * tab-trigger drop zones to complicate the collision. */
const TWO_FIELDS: Schema = [makeField("a"), makeField("b")];
/** One card holding one field, for the header-grip half. */
const ONE_CARD: Schema = [makeCard("c1", "Basics"), makeField("a")];

function renderCanvas(schema: Schema, onSelectSpy: (a: string) => void) {
	return render(
		<EditorWrap>
			<Harness schema={schema} onSelectSpy={onSelectSpy} />
		</EditorWrap>,
	);
}

/** The grip inside a field shell. */
function shellGrip(accessor: string): HTMLElement {
	return within(screen.getByTestId(`shell-${accessor}`)).getByLabelText(
		CANVAS_LABELS.dragField,
	);
}

/** The grip inside a card's header bar. */
function cardGrip(accessor: string): HTMLElement {
	return within(screen.getByTestId(`card-header-${accessor}`)).getByLabelText(
		CANVAS_LABELS.dragCard,
	);
}

/** Where every press below starts. Any point does — the constraint is measured
 * as a DELTA from the pointerdown, not against a layout. */
const PRESS_AT = { x: 100, y: 100 };

async function pressGrip(grip: HTMLElement) {
	await act(async () => {
		fireEvent.pointerDown(grip, {
			isPrimary: true,
			button: 0,
			clientX: PRESS_AT.x,
			clientY: PRESS_AT.y,
		});
	});
}

/** Moves the pointer to `PRESS_AT + (0, dy)`. The sensor listens on the owner
 * DOCUMENT, not the grip. */
async function pointerBy(dy: number) {
	await act(async () => {
		fireEvent.pointerMove(document, {
			clientX: PRESS_AT.x,
			clientY: PRESS_AT.y + dy,
		});
	});
}

async function release() {
	await act(async () => {
		fireEvent.pointerUp(document);
	});
}

/** A real DOM click, so the sensor's capture-phase blocker on `document` gets
 * its say before React's root listener ever sees the event. */
async function click(el: HTMLElement) {
	await act(async () => {
		fireEvent.click(el);
	});
}

async function advance(ms: number) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
	});
}

/** Whether a drag is in flight — the overlay clone is mounted only while
 * `activeDragId` is set, which only `onDragStart` sets. */
function dragInFlight(): boolean {
	return screen.queryByTestId("drag-overlay-preview") !== null;
}

/**
 * Puts down whatever drag is still in flight and waits out the sensor's own
 * teardown.
 *
 * A `PointerSensor` holds a capture-phase `click` blocker on `document` for the
 * length of a drag and lets go of it 50 ms after it detaches. A test that ends
 * with a drag still running leaves that blocker in place, where it swallows the
 * NEXT test's clicks before React ever sees them. Every test here ends through
 * this. Escape first, then the release: the canvas COMMITS a drop, and Escape
 * on a drag that already ended is a no-op (dnd-kit has cleared its active ref).
 */
async function settleDrag() {
	await act(async () => {
		fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
	});
	await release();
	await advance(CLICK_BLOCKER_MS * 2);
}

/** Press, then ONE move that crosses the constraint. Kept separate from
 * {@link travel} because the drag must be in flight after this single move for
 * the tests to bracket the constant at all — see the assertion between them. */
async function crossThreshold(grip: HTMLElement) {
	await pressGrip(grip);
	await pointerBy(OVER_THRESHOLD_PX);
}

/** The second move. Two are needed, not one: the move that SATISFIES the
 * constraint calls the sensor's `handleStart()` and returns without reporting
 * coordinates, so a drag needs one move to activate and another to travel
 * (`docs/dnd-kit-reference.md`). Nothing this file asserts depends on the
 * travel — with every rect 0×0 there is nowhere to travel TO — but a drag that
 * never moved after activating is not the gesture under test. */
async function travel() {
	await pointerBy(OVER_THRESHOLD_PX * 2);
}

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(async () => {
	// Before RTL unmounts anything: a drag left in flight keeps the sensor's
	// click blocker on `document` (see `settleDrag`).
	await settleDrag();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("a field grip under the activation distance is a click", () => {
	it(`selects the field and starts no drag (${UNDER_THRESHOLD_PX}px < ${ACTIVATION_DISTANCE_PX}px)`, async () => {
		const onSelect = vi.fn();
		renderCanvas(TWO_FIELDS, onSelect);

		await pressGrip(shellGrip("a"));
		await pointerBy(UNDER_THRESHOLD_PX);
		// The constraint is unsatisfied, so the sensor is still PENDING: no
		// activation, so no overlay clone and no dimmed origin. If `{ distance }`
		// were lowered under 3, this is the assertion that would go first.
		expect(dragInFlight()).toBe(false);
		expect(screen.getByTestId("shell-a")).not.toHaveAttribute(
			"data-drag-origin",
		);

		await release();
		expect(dragInFlight()).toBe(false);

		// The browser's own click, which follows the release. Nothing installed a
		// blocker (only `handleStart` does), and the grip stops nothing of its
		// own, so it bubbles to the shell's onClick.
		await click(shellGrip("a"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith("a");
		// …and still no drag, on the way out.
		expect(dragInFlight()).toBe(false);
	});
});

describe("a field grip past the activation distance is a drag", () => {
	it(`starts a drag and does not select (${OVER_THRESHOLD_PX}px > ${ACTIVATION_DISTANCE_PX}px)`, async () => {
		const onSelect = vi.fn();
		renderCanvas(TWO_FIELDS, onSelect);

		await crossThreshold(shellGrip("a"));

		// A real drag, off ONE move — and that "one" is load-bearing. This is the
		// assertion that pins the constraint's UPPER bound: raise `{ distance }`
		// above 20 and the press is still pending here. (Asserting only after the
		// second move would not, because a 40px move satisfies a much larger
		// constraint too — measured: this test passed unchanged at
		// `{ distance: 30 }` before the assertion was moved here.)
		expect(dragInFlight()).toBe(true);
		expect(screen.getByTestId("shell-a")).toHaveAttribute(
			"data-drag-origin",
			"true",
		);
		expect(onSelect).not.toHaveBeenCalled();

		// Where it would LAND is not visible here — every rect is 0×0, so
		// `visibleClosestCenter` filters them all out and `over` stays null.
		await travel();
		expect(dragInFlight()).toBe(true);
		expect(onSelect).not.toHaveBeenCalled();

		await release();
		expect(dragInFlight()).toBe(false);

		// The click the browser fires after the release. The sensor's
		// capture-phase blocker is still on `document` (it is removed 50 ms after
		// detach), so it never reaches the shell.
		await click(shellGrip("a"));

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("blocks the post-drop click for a window, not forever", async () => {
		// Without this, the test above could pass because clicks on this canvas
		// never select at all — a test that cannot distinguish "blocked" from
		// "broken" is the one someone trusts wrongly. Here the SAME click is
		// swallowed inside the window and lands outside it, which is only true if
		// the blocker is real and time-bounded.
		const onSelect = vi.fn();
		renderCanvas(TWO_FIELDS, onSelect);

		await crossThreshold(shellGrip("a"));
		expect(dragInFlight()).toBe(true);
		await travel();
		await release();

		await advance(CLICK_BLOCKER_MS - 10);
		await click(shellGrip("a"));
		expect(onSelect).not.toHaveBeenCalled();

		await advance(20); // now past the 50 ms teardown
		await click(shellGrip("a"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith("a");
	});
});

describe("the card header grip discriminates the same way", () => {
	// CardFrame's header carries the identical shape — an `onClick` that selects
	// on the header row, a grip inside it holding the sortable listeners and
	// stopping nothing — so it has the identical exposure, and
	// `cards-canvas.test.tsx`'s "clicking a card header selects the card" clicks
	// the HEADER, never the grip.

	it(`selects the card under the activation distance (${UNDER_THRESHOLD_PX}px)`, async () => {
		const onSelect = vi.fn();
		renderCanvas(ONE_CARD, onSelect);

		await pressGrip(cardGrip("c1"));
		await pointerBy(UNDER_THRESHOLD_PX);
		expect(dragInFlight()).toBe(false);

		await release();
		await click(cardGrip("c1"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith("c1");
	});

	it(`block-drags the card past it, and does not select (${OVER_THRESHOLD_PX}px)`, async () => {
		const onSelect = vi.fn();
		renderCanvas(ONE_CARD, onSelect);

		await crossThreshold(cardGrip("c1"));

		// One move, as above — the same upper bound on the same shared sensor.
		expect(dragInFlight()).toBe(true);
		expect(screen.getByTestId("card-frame-c1")).toHaveAttribute(
			"data-drag-origin",
			"true",
		);
		expect(onSelect).not.toHaveBeenCalled();

		await travel();
		await release();
		await click(cardGrip("c1"));

		expect(onSelect).not.toHaveBeenCalled();
	});
});
