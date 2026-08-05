// src/editor/__tests__/spring-loaded-tabs.test.tsx
/**
 * What resting a drag on a tab trigger does to the CANVAS — the spring-loaded
 * sections spec's Decisions 1, 2, 3, 4 and 6 (2026-07-14), driven through the
 * rendered editor with a real pointer drag.
 *
 * `use-spring-loaded-tab.test.ts` covers the dwell timer in isolation — fires,
 * cancels, re-arms, stays quiet while disabled — and it stays: none of it
 * touches a canvas, and a hook that fires on schedule is not the same claim as
 * a drag that switches sections. This file covers that second seam.
 *
 * **A file of its own because it drives real pointer drags.** jsdom ships no
 * `PointerEvent`, so dnd-kit's `PointerSensor` — which activates from
 * `onPointerDown` and reads `isPrimary` off the native event — can never fire
 * in it, and the dwell is a pointer-only device (spec Decision 6). A four-line
 * subclass of `MouseEvent` is the whole of what is missing. Defining
 * `PointerEvent` is a GLOBAL change, though, and anker's zag-based components
 * branch on whether it exists — so it lives here, in the file that needs it,
 * rather than in `src/test/setup.ts`.
 * `src/renderer/fields/__tests__/reference-tree-folds.test.tsx` proved the
 * technique and carries the same four lines for the tree's dwell. **The
 * duplication is the decision, not an oversight**: a third pointer-driving file
 * should copy the shim again rather than promote it to shared setup, where it
 * would change how every test in the package branches.
 *
 * **What this file can and cannot see.** jsdom lays nothing out, so which
 * trigger a pointer is "on" is decided by `springRectMock` below, not by a real
 * tab strip. Everything asserted here is therefore INTERACTION — a dwell
 * elapsing switches the section, a quicker crossing does not, a second rest
 * springs again, Escape unwinds the preview, a release before the dwell commits
 * and follows. Nothing here says the tab strip is reachable, that the triggers
 * are where the mock puts them, or that any of this is hittable at real
 * geometry: that is the runtime gate's job (spec §Testing, "Runtime gate
 * (pointer legs)"). Read a failure here as "the interaction broke", never as
 * "the layout broke", and do not add an assertion that would read as layout.
 *
 * Scope: this ADDS the pointer path. The editor's existing keyboard-sensor
 * drag suites (`dnd.test.tsx`, `drag-feedback.test.tsx`, `cards-canvas.test.tsx`)
 * are untouched — auditing those is tracked separately.
 */
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import { SPRING_DWELL_MS } from "../use-spring-loaded-tab";
import {
	CANVAS_LABELS,
	EditorWrap,
	makeField,
	makeSection,
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
// which needs ResizeObserver and IntersectionObserver — neither implemented in
// jsdom. Stubbed locally, mirroring dnd.test.tsx: a pointer lift puts the
// grip's Tooltip in reach of an autoUpdate tick.
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

/** Three tabs: General holds `a` and `x`, SEO holds `b`, Meta holds `c`.
 * `x` stays behind so General never empties — an emptied implicit tab
 * collapses out of the partition and shifts every later index down, which
 * would let a follow assertion pass without any follow wiring (the fixture
 * quirk dnd.test.tsx documents). */
const THREE_TABS: Schema = [
	makeField("a"),
	makeField("x"),
	makeSection("s1", "SEO"),
	makeField("b"),
	makeSection("s2", "Meta"),
	makeField("c"),
];

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
				labels={CANVAS_LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
			/>
			{/* The draft itself, so "a spring writes nothing" is a claim about the
			    schema rather than about what happens to be on screen. */}
			<output data-testid="draft">
				{spec.draft.map((f) => f.config.api_accessor).join(",")}
			</output>
		</ConfirmModalProvider>
	);
}
Harness.displayName = "Harness";

/**
 * jsdom lays nothing out, so the canvas has to be told where it is: tab-trigger
 * drop zones in a row along y=0 at a 200px pitch, field shells stacked from
 * y=100 at a 60px pitch. `editorCollision` gives the trigger zones first claim
 * via `pointerWithin`, so a pointer inside a zone's box IS a hover of that
 * trigger — which is the only thing the geometry here is asked to express.
 *
 * `shellLeft` moves the shell column under a chosen trigger, which is how the
 * KEYBOARD leg steers: its coordinate getter walks the collision rect toward a
 * droppable rather than carrying a pointer (dnd.test.tsx's `mockSectionedRects`
 * idiom, same numbers). The DragOverlay preview is pinned to the dragged
 * shell's initial rect because dnd-kit derives the keyboard collision rect from
 * the overlay once it measures.
 */
function springRectMock(shellLeft = 0) {
	return vi
		.spyOn(Element.prototype, "getBoundingClientRect")
		.mockImplementation(function (this: Element) {
			const rect = (top: number, left: number, width: number, height: number) =>
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
			if (testId === "drag-overlay-preview")
				return rect(100, shellLeft, 200, 50);
			if (testId.startsWith("tabdrop-")) {
				return rect(0, Number(testId.slice("tabdrop-".length)) * 200, 100, 40);
			}
			if (testId.startsWith("shell-")) {
				const shells = Array.from(
					document.querySelectorAll('[data-testid^="shell-"]'),
				);
				return rect(100 + shells.indexOf(this) * 60, shellLeft, 200, 50);
			}
			return rect(0, 0, 0, 0);
		});
}

/** A point dead-centre on a tab trigger's drop zone, in the mock's coordinates. */
const onTrigger = (tabIndex: number) => ({ x: tabIndex * 200 + 50, y: 20 });
/** A point down among the field shells, clear of the tab strip.
 *
 * The strip's own gaps are NOT clear of it: a pointer between two triggers
 * misses `pointerWithin`, falls through to `visibleClosestCenter`, and that
 * ranks the trigger ZONES alongside the shells by centre distance — so a
 * pointer parked in the gap still resolves onto the nearer trigger and arms a
 * dwell against it. Leaving the strip means leaving its band. */
const IN_CANVAS = { x: 100, y: 200 };

function renderCanvas(schema: Schema = THREE_TABS) {
	return render(
		<EditorWrap>
			<Harness schema={schema} />
		</EditorWrap>,
	);
}

/** The section the canvas is showing, read off the tab strip. */
function openSection(): string {
	const selected = screen
		.getAllByRole("tab")
		.find((tab) => tab.getAttribute("aria-selected") === "true");
	return selected?.textContent?.trim() ?? "";
}

/** The field shells inside the panel the canvas has open, in order.
 * `data-state` rather than the `hidden` attribute: zag keeps the OUTGOING
 * panel painted for a beat during a swap and flips `hidden` up to ~47 ms later
 * (the same lag `DragRemeasurer` polls around), so `hidden` lies mid-switch
 * while `data-state` is the component's own statement of which tab is open. */
function openPanelShells(): string[] {
	const panel = document.querySelector('[role="tabpanel"][data-state="open"]');
	return Array.from(
		// `:not(...)` excludes the selected shell's `shell-toolbar-*` child, which
		// shares the prefix and would otherwise appear as a phantom extra field
		// in exactly the tests where a drop selects what it moved.
		panel?.querySelectorAll(
			'[data-testid^="shell-"]:not([data-testid^="shell-toolbar-"])',
		) ?? [],
	).map((el) => (el.getAttribute("data-testid") ?? "").slice("shell-".length));
}

/** The draft's accessors in flat order — the schema, as the canvas holds it. */
function draftOrder(): string {
	return screen.getByTestId("draft").textContent ?? "";
}

/** Whether a drag is still in flight (the overlay clone is mounted). */
function dragInFlight(): boolean {
	return screen.queryByTestId("drag-overlay-preview") !== null;
}

/** Lifts a field's grip with the pointer and gets the drag past the 8px
 * activation constraint. Two moves, not one: the move that SATISFIES the
 * constraint calls the sensor's `handleStart()` and returns without reporting
 * coordinates, so a drag needs one move to activate and another to travel. */
async function pointerLift(accessor: string) {
	const grip = within(screen.getByTestId(`shell-${accessor}`)).getByLabelText(
		CANVAS_LABELS.dragField,
	);
	await act(async () => {
		fireEvent.pointerDown(grip, {
			isPrimary: true,
			button: 0,
			clientX: 10,
			clientY: 110,
		});
	});
	await act(async () => {
		fireEvent.pointerMove(document, { clientX: 10, clientY: 130 });
	});
}

/** Moves the pointer. The sensor listens on the owner DOCUMENT, not the grip. */
async function pointerTo({ x, y }: { x: number; y: number }) {
	await act(async () => {
		fireEvent.pointerMove(document, { clientX: x, clientY: y });
	});
}

/** Releases where the pointer currently is — `pointerup` carries no
 * coordinates of its own, so the drop resolves against the last move. */
async function pointerDrop() {
	await act(async () => {
		fireEvent.pointerUp(document);
	});
}

/** Lifts a field's grip from the keyboard and leaves the drag in flight. */
async function keyboardLift(accessor: string) {
	const grip = within(screen.getByTestId(`shell-${accessor}`)).getByLabelText(
		CANVAS_LABELS.dragField,
	);
	grip.focus();
	fireEvent.keyDown(grip, { code: "Space" });
	// The KeyboardSensor attaches its document listener in a setTimeout after
	// activation — yield a macrotask before the first key. Under fake timers
	// this advances the clock by ZERO, which is what makes the Decision 6 test
	// below able to say "no dwell elapsed".
	await act(async () => {
		if (vi.isFakeTimers()) {
			await vi.advanceTimersByTimeAsync(0);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function pressDuringDrag(code: string) {
	await act(async () => {
		fireEvent.keyDown(document.activeElement ?? document.body, { code });
	});
}

/** Lets a dwell elapse while the drag stays in flight. */
async function dwell(ms = SPRING_DWELL_MS) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
	});
}

/**
 * Puts down whatever drag is still in flight, and waits out the sensor's own
 * teardown.
 *
 * A `PointerSensor` holds a **capture-phase click blocker on `document`** for
 * the length of a drag and lets go of it 50 ms after it detaches. A test that
 * ends with a drag still running therefore leaves that blocker in place, where
 * it swallows the NEXT test's clicks before React ever sees them — a menu that
 * silently never opens, presenting as a failure nowhere near its cause. Every
 * test here ends through this.
 *
 * Escape before the release, unlike the renderer's `settleDrag`: this canvas
 * COMMITS a drop, so putting the drag down with `pointerup` alone would splice
 * the schema on the way out of tests that are asserting a preview. Escape on a
 * drag that already ended is a no-op — dnd-kit has cleared its active ref, so
 * no cancel handler fires.
 */
async function settleDrag() {
	await act(async () => {
		fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
	});
	await act(async () => {
		fireEvent.pointerUp(document);
	});
	if (vi.isFakeTimers()) {
		await act(async () => {
			vi.advanceTimersByTime(100);
		});
	}
}

describe("a pointer drag resting on a tab trigger springs the canvas", () => {
	let rects: ReturnType<typeof springRectMock>;
	beforeEach(() => {
		rects = springRectMock();
	});
	afterEach(async () => {
		// Before RTL unmounts anything: a drag left in flight keeps the sensor's
		// click blocker on `document` (see `settleDrag`).
		await settleDrag();
		vi.useRealTimers();
		rects.mockRestore();
		vi.unstubAllGlobals();
	});

	it("switches to the rested-on section once the dwell elapses (Decision 1)", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		await pointerTo(onTrigger(1));

		// Resolved as the drop target the moment the pointer arrives — but the
		// canvas has NOT moved. This is the assertion the hook test cannot make:
		// arming is not switching.
		expect(screen.getByTestId("tabdrop-1")).toHaveAttribute(
			"data-drop-target",
			"true",
		);
		expect(openSection()).toBe("General");

		await dwell();

		expect(openSection()).toBe("SEO");
		expect(openPanelShells()).toEqual(["b"]);
		// The drag continues uninterrupted — the whole point of a spring is that
		// the author can now aim at a slot inside the section that just appeared.
		expect(dragInFlight()).toBe(true);
		// And a spring is a preview: nothing has been written (Decision 4).
		expect(draftOrder()).toBe("a,x,s1,b,s2,c");
	});

	it("does not spring for a drag that crosses the strip faster than the dwell", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		// Onto the SEO trigger, and off it before its dwell is up…
		await pointerTo(onTrigger(1));
		await dwell(SPRING_DWELL_MS - 50);
		// …straight on to the Meta trigger, and off THAT before its dwell is up…
		await pointerTo(onTrigger(2));
		await dwell(SPRING_DWELL_MS - 50);
		// …and back down into the canvas, then wait far longer than a dwell.
		//
		// Nearly TWO dwells have now elapsed since the drag reached the strip,
		// and neither tab sprang: the dwell is measured per trigger, not
		// accumulated over the strip, and leaving one re-arms nothing.
		await pointerTo(IN_CANVAS);
		await dwell(SPRING_DWELL_MS * 2);

		expect(openSection()).toBe("General");
		expect(openPanelShells()).toEqual(["a", "x"]);
		expect(draftOrder()).toBe("a,x,s1,b,s2,c");
	});

	it("springs again on a second trigger later in the same drag (chained)", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		await pointerTo(onTrigger(1));
		await dwell();
		expect(openSection()).toBe("SEO");

		// One drag, no release in between: the second rest has to re-arm on its
		// own or the author is stranded in the first section they paused over.
		await pointerTo(onTrigger(2));
		expect(openSection()).toBe("SEO"); // not yet — the dwell starts over
		await dwell();

		expect(openSection()).toBe("Meta");
		expect(openPanelShells()).toEqual(["c"]);
		expect(dragInFlight()).toBe(true);
		expect(draftOrder()).toBe("a,x,s1,b,s2,c");
	});

	it("Escape restores the section that was active at the lift, and writes nothing (Decision 4)", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		await pointerTo(onTrigger(1));
		await dwell();
		// Guard: without this the restore below could pass vacuously.
		expect(openSection()).toBe("SEO");

		await act(async () => {
			fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
		});

		expect(openSection()).toBe("General");
		expect(openPanelShells()).toEqual(["a", "x"]);
		// The schema never moved — a spring was only ever a preview.
		expect(draftOrder()).toBe("a,x,s1,b,s2,c");
	});
});

describe("a quick drop on a trigger, before the dwell", () => {
	let rects: ReturnType<typeof springRectMock>;
	beforeEach(() => {
		rects = springRectMock();
	});
	afterEach(async () => {
		await settleDrag();
		vi.useRealTimers();
		rects.mockRestore();
		vi.unstubAllGlobals();
	});

	it("appends at the end of that section and the canvas follows (Decisions 2 & 3)", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		await pointerTo(onTrigger(1));
		await dwell(SPRING_DWELL_MS - 50);
		// Released while the canvas is still on the source tab: this is the
		// pre-spring path, not a drop into an already-sprung section.
		expect(openSection()).toBe("General");

		await pointerDrop();

		// Decision 2 — today's semantics kept: appended AFTER the tab's last
		// field, not inserted at a slot.
		expect(draftOrder()).toBe("x,s1,b,a,s2,c");
		// Decision 3 — the drop ends in the target section, with the moved field
		// there to see. Without the follow, the author would be left staring at
		// General while `a` vanished, which is the field report this feature came
		// from.
		expect(openSection()).toBe("SEO");
		expect(openPanelShells()).toEqual(["b", "a"]);
	});
});

describe("a keyboard drag bypasses the dwell", () => {
	let rects: ReturnType<typeof springRectMock>;
	beforeEach(() => {
		// shellLeft=200 stacks the shell column directly under tabdrop-1, so a
		// single ArrowUp from shell-a resolves onto the SEO tab's zone.
		rects = springRectMock(200);
	});
	afterEach(async () => {
		await settleDrag();
		vi.useRealTimers();
		rects.mockRestore();
		vi.unstubAllGlobals();
	});

	it("switches the moment the drag lands on the zone, with no dwell elapsed (Decision 6)", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await keyboardLift("a");
		await pressDuringDrag("ArrowUp");

		// NOT ONE MILLISECOND has been advanced past the lift — `keyboardLift`
		// yields with `advanceTimersByTimeAsync(0)` precisely so this can be
		// said. The pointer leg at this exact point is still on General (first
		// test in this file); the keyboard leg is already across, because a
		// dwell is a pointer-safety device against drive-by springs and arrowing
		// onto a zone is already deliberate.
		expect(openSection()).toBe("SEO");
		expect(openPanelShells()).toEqual(["b"]);
		// Still a preview, on this path too: nothing is written until a release.
		expect(draftOrder()).toBe("a,x,s1,b,s2,c");
		expect(dragInFlight()).toBe(true);
	});
});
