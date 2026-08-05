// src/editor/__tests__/spring-loaded-tabs.test.tsx
/**
 * What resting a drag on a tab trigger does to the CANVAS — the spring-loaded
 * sections spec's Decisions 1, 2, 3, 4, 5 and 6 (2026-07-14), driven through
 * the rendered editor with a real pointer drag.
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
 * would change how every test in the package branches. The small drag helpers
 * around it (`settleDrag`, `dwell`, `pressDuringDrag`) are copied from that file
 * for a plainer reason — `/renderer` imports nothing from `/editor`, so the two
 * layers' drag suites have never shared a fixture, and four lines each is not
 * the thing to mint a cross-layer test module for.
 *
 * **What this file can and cannot see.** jsdom lays nothing out, so which
 * trigger a pointer is "on" is decided by `springRectMock` below, not by a real
 * tab strip. Everything asserted here is therefore INTERACTION — a dwell
 * elapsing switches the section, a quicker crossing does not, a second rest
 * springs again, Escape unwinds the preview, a release before the dwell commits
 * and follows, a card block released after a spring lands between the sprung
 * tab's frames. Nothing here says the tab strip is reachable, that the triggers
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
	makeCard,
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
// which needs IntersectionObserver — unimplemented in jsdom, and (unlike
// ResizeObserver, which `src/test/setup.ts` now ships globally for exactly this
// reason) still every test file's own problem. A pointer lift puts the grip's
// Tooltip in reach of an autoUpdate tick, so this file needs it.
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

beforeEach(() => {
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

/** THREE_TABS with a SECOND field in SEO, so that a drop landing at a slot
 * *between* them is distinguishable from an append at the section's end. */
const SEO_WITH_TWO: Schema = [
	makeField("a"),
	makeField("x"),
	makeSection("s1", "SEO"),
	makeField("b1"),
	makeField("b2"),
	makeSection("s2", "Meta"),
	makeField("c"),
];

/** Two CARDED tabs, for the card-block leg.
 *
 * General holds the dragged card `cg` (two fields, so "the whole block" is a
 * claim about more than one) and a second card `cstay` that keeps the tab
 * populated — an emptied implicit tab collapses out of the partition and
 * shifts every later index down, which would let "the canvas stayed on SEO"
 * pass without any follow wiring (the fixture quirk THREE_TABS documents).
 *
 * SEO holds THREE frames so a drop resolved onto the MIDDLE one lands
 * between frames rather than at the tab's end — which is what tells a
 * `card-block` drop apart from the `tab` branch's append (Decision 2). */
const TWO_CARDED_TABS: Schema = [
	makeCard("cg", "Home"),
	makeField("g1"),
	makeField("g2"),
	makeCard("cstay", "Stay"),
	makeField("g3"),
	makeSection("s1", "SEO"),
	makeCard("cs1", "First"),
	makeField("b1"),
	makeCard("cs2", "Second"),
	makeField("b2"),
	makeCard("cs3", "Third"),
	makeField("b3"),
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
			{/* And the host's selection, for the same reason — plus one the
			    canvas cannot supply: a selected CARD's only rendered signal is
			    its frame's accent border, a Chakra token jsdom never resolves.
			    See `hostSelection()` below. */}
			<output data-testid="selected">{selected ?? ""}</output>
		</ConfirmModalProvider>
	);
}
Harness.displayName = "Harness";

/**
 * jsdom lays nothing out, so the canvas has to be told where it is: tab-trigger
 * drop zones in a row along y=0 at a 200px pitch, then card frames and field
 * shells stacked in ONE column from y=100 at a 60px pitch, in document (i.e.
 * flat schema) order. `editorCollision` gives the trigger zones first claim
 * via `pointerWithin`, so a pointer inside a zone's box IS a hover of that
 * trigger — which is the only thing the geometry here is asked to express.
 *
 * `shellLeft` moves the shell column under a chosen trigger, which is how the
 * KEYBOARD leg steers: its coordinate getter walks the collision rect toward a
 * droppable rather than carrying a pointer (dnd.test.tsx's `mockSectionedRects`
 * idiom, same numbers). The DragOverlay preview is pinned to the dragged
 * shell's initial rect because dnd-kit derives the keyboard collision rect from
 * the overlay once it measures.
 *
 * **What it deliberately does NOT model:** a hidden tab's panel really measures
 * 0x0, which is why `isVisibleDroppable` exists to filter it out of collisions
 * (`visible-collision.ts`, and `visible-collision.test.ts` covers that filter
 * directly). Here every shell AND every card frame gets a rect whether its
 * panel is open or not, matching the sectioned mocks in `dnd.test.tsx` and
 * `drag-feedback.test.tsx`. So a drop resolved here says "this is where the
 * collision landed", never "a hidden tab's shell could not have won it" — and
 * the card-block test below lands on a frame of the tab it just sprang because
 * the geometry aims there, not because the other tab's frames were unreachable.
 *
 * This is now the THIRD near-identical sectioned-canvas rect mock in
 * `src/editor/__tests__` (`mockSectionedRects` in dnd.test.tsx,
 * `tabdropRectMock` in drag-feedback.test.tsx). Consolidating into
 * `editor-helpers.tsx` means editing two passing test files, which this
 * ticket's scope forbids — it belongs with the keyboard-drag audit that will
 * touch them anyway.
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
			if (
				testId.startsWith("card-frame-") ||
				(testId.startsWith("shell-") && !testId.startsWith("shell-toolbar-"))
			) {
				// ONE column for card frames AND field shells, in document order —
				// which is the flat schema order, and matches the ONE flat sortable
				// list the canvas actually maintains per tab (markers included).
				// Card-less fixtures are unaffected: with no frames in the DOM this
				// query returns exactly the shells it always did, in the same order.
				//
				// The `:not(...)` matters: a SELECTED shell renders a
				// `shell-toolbar-*` child sharing the prefix, and counting it would
				// silently skew every rect below it in the column.
				const rows = Array.from(
					document.querySelectorAll(
						'[data-testid^="card-frame-"], [data-testid^="shell-"]:not([data-testid^="shell-toolbar-"])',
					),
				);
				return rect(100 + rows.indexOf(this) * 60, shellLeft, 200, 50);
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

/** The pointer position that parks the drag dead-centre on row `index` of the
 * mock's column (frames and shells together, top to bottom).
 *
 * Off the tab strip, dnd-kit ranks droppables by the distance between their
 * centre and the DRAGGED rect's centre — the pointer enters only as the
 * translation applied to that rect. So "a point on that frame" is a DELTA
 * from the lift at (10, 110), not the frame's own coordinates: the overlay
 * clone starts centred on row 0, and one row is 60px down. */
const onRow = (index: number) => ({ x: 10, y: 110 + index * 60 });

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

/** The accessors of everything matching `selector` inside the panel the canvas
 * has open, in order, with `prefix` stripped off each testid.
 *
 * `data-state` rather than the `hidden` attribute: zag keeps the OUTGOING
 * panel painted for a beat during a swap and flips `hidden` up to ~47 ms later
 * (the same lag `DragRemeasurer` polls around), so `hidden` lies mid-switch
 * while `data-state` is the component's own statement of which tab is open. */
function openPanelIds(selector: string, prefix: string): string[] {
	const panel = document.querySelector('[role="tabpanel"][data-state="open"]');
	return Array.from(panel?.querySelectorAll(selector) ?? []).map((el) =>
		(el.getAttribute("data-testid") ?? "").slice(prefix.length),
	);
}

/** The field shells inside the open panel. The `:not(...)` excludes the
 * selected shell's `shell-toolbar-*` child, which shares the prefix and would
 * otherwise appear as a phantom extra field in exactly the tests where a drop
 * selects what it moved. */
const openPanelShells = () =>
	openPanelIds(
		'[data-testid^="shell-"]:not([data-testid^="shell-toolbar-"])',
		"shell-",
	);

/** The card frames inside the open panel — the card-block sibling. */
const openPanelCards = () =>
	openPanelIds('[data-testid^="card-frame-"]', "card-frame-");

/** Which field the canvas has selected, if any. A selected shell — and only a
 * selected shell — grows its `shell-toolbar-*` row, which is how "the moved
 * item is selected" (Decision 3) is visible in the rendered output at all. */
function selectedField(): string | null {
	const toolbar = document.querySelector('[data-testid^="shell-toolbar-"]');
	return (
		toolbar?.getAttribute("data-testid")?.slice("shell-toolbar-".length) ?? null
	);
}

/** What the HOST holds selected, read off the harness — `selectedField()`'s
 * claim for the one item that cannot make it through the canvas: a selected
 * CARD grows no toolbar, only its frame's `borderColor="accent"`, and jsdom
 * resolves no Chakra token. Selection is the canvas's `onSelect` and the
 * host's state either way, so this reads it where it is legible.
 * (`cards-canvas.test.tsx` spies on `onSelect` instead; this file already
 * mirrors host state into the DOM for `draftOrder`, so it does the same.) */
function hostSelection(): string | null {
	return screen.getByTestId("selected").textContent || null;
}

/** The draft's accessors in flat order — the schema, as the canvas holds it. */
function draftOrder(): string {
	return screen.getByTestId("draft").textContent ?? "";
}

/** Whether a drag is still in flight (the overlay clone is mounted). */
function dragInFlight(): boolean {
	return screen.queryByTestId("drag-overlay-preview") !== null;
}

/** Lifts a grip with the pointer and gets the drag past the 8px activation
 * constraint. Two moves, not one: the move that SATISFIES the constraint
 * calls the sensor's `handleStart()` and returns without reporting
 * coordinates, so a drag needs one move to activate and another to travel.
 *
 * (10, 110) is the drag's origin for the whole file — `onRow` above is
 * expressed as a delta from it. */
async function liftGrip(grip: HTMLElement) {
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

/** Lifts a field's grip — a single-field drag. */
async function pointerLift(accessor: string) {
	await liftGrip(
		within(screen.getByTestId(`shell-${accessor}`)).getByLabelText(
			CANVAS_LABELS.dragField,
		),
	);
}

/** Lifts a card header's grip — a BLOCK drag: the marker and every field it
 * contains move as one (`moveCard`), and the overlay clone is the header bar
 * rather than a shell. */
async function pointerLiftCard(accessor: string) {
	await liftGrip(
		within(screen.getByTestId(`card-header-${accessor}`)).getByLabelText(
			CANVAS_LABELS.dragCard,
		),
	);
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

/**
 * The per-describe fixture every block in this file shares: the rect mock up
 * for the block's duration, and — BEFORE RTL unmounts anything — whatever drag
 * is still in flight put down, because it would otherwise keep the sensor's
 * click blocker on `document` and break the next test (see `settleDrag`).
 *
 * Called at describe scope, so its `beforeEach`/`afterEach` register on the
 * enclosing block exactly as inline ones would.
 */
function springFixture(shellLeft = 0) {
	let rects: ReturnType<typeof springRectMock>;
	beforeEach(() => {
		rects = springRectMock(shellLeft);
	});
	afterEach(async () => {
		await settleDrag();
		vi.useRealTimers();
		rects.mockRestore();
		vi.unstubAllGlobals();
	});
}

describe("a pointer drag resting on a tab trigger springs the canvas", () => {
	springFixture();

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

	it("stays on the sprung section when the drop commits there (Decision 4)", async () => {
		// Decision 4's other half. Every test above unwinds the preview; this one
		// COMMITS, which is the case the feature exists for — "resting the pointer
		// on a tab trigger's drop zone switches the visible section; the drag
		// continues uninterrupted and the existing feedback guides to the exact
		// slot" (Decision 1). A spring you cannot then drop into has switched
		// nothing worth switching.
		renderCanvas(SEO_WITH_TWO);
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLift("a");
		await pointerTo(onTrigger(1));
		await dwell();
		expect(openSection()).toBe("SEO");
		expect(openPanelShells()).toEqual(["b1", "b2"]);

		// Back down into the section that just appeared, onto its FIRST field
		// (row 2 of the column: a, x, b1 …), and release. Aiming BETWEEN its two
		// fields is what makes this a slot drop rather than an append — the
		// append (Decisions 2/3, tested below) would have put `a` last.
		await pointerTo(onRow(2));
		await pointerDrop();

		expect(draftOrder()).toBe("x,s1,b1,a,b2,s2,c");
		// And the canvas STAYS: "a successful drop stays on the sprung/target
		// tab". Restoring here instead would dump the author back in General the
		// instant they let go, having watched the field arrive somewhere else.
		expect(openSection()).toBe("SEO");
		expect(openPanelShells()).toEqual(["b1", "a", "b2"]);
		expect(selectedField()).toBe("a");
	});
});

describe("a quick drop on a trigger, before the dwell", () => {
	springFixture();

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
		// …and the third clause of Decision 3, "the moved item is selected":
		// arriving in the right section is only half of not losing the field.
		expect(selectedField()).toBe("a");
	});
});

describe("a card block dropped into a foreign tab after a spring", () => {
	springFixture();

	// The route Decision 5 opened: cards cross sections only via a tab trigger
	// (quick drop = block append) or "between-frames slots of the CURRENTLY
	// VISIBLE tab after a spring". This is that second leg, end to end — the
	// one the spec's §Testing asked for as "after a spring, a card block drops
	// between the foreign tab's frames (end-state schema pin)".
	//
	// It is the only test in the suite where a card-block drop's target tab
	// differs from the drag's START tab, which is what makes handleDragEnd's
	// `follow(activeTabIndex, next)` do anything at all: without a spring the
	// two are equal and the call is a no-op. Note what that means for the
	// assertions below — after a spring the canvas is ALREADY on SEO, so
	// "stayed on the sprung tab" would hold even unwired; `hostSelection()` is
	// the clause that discriminates.
	//
	// What it does NOT re-assert: that a card over a foreign card resolves to
	// a `card-block` target. That is resolve-drop-target.test.ts's, tested on
	// the pure function where placement and boundaries can be enumerated.
	// Here the question is only whether the rendered canvas, driven by a real
	// pointer, ends up in the state that resolution implies.
	it("moves the whole block between the sprung tab's frames, and follows it there", async () => {
		renderCanvas(TWO_CARDED_TABS);
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await pointerLiftCard("cg");
		await pointerTo(onTrigger(1));
		await dwell();

		// Sprung: SEO's three frames are on screen and reachable, which is the
		// precondition the whole gesture rests on — before the spring they were
		// in a hidden panel, where `isVisibleDroppable` filters them out.
		expect(openSection()).toBe("SEO");
		expect(openPanelCards()).toEqual(["cs1", "cs2", "cs3"]);
		expect(dragInFlight()).toBe(true);
		expect(draftOrder()).toBe(
			"cg,g1,g2,cstay,g3,s1,cs1,b1,cs2,b2,cs3,b3", // still a preview
		);

		// Down onto SEO's MIDDLE frame (row 7 of the column: cg, g1, g2, cstay,
		// g3, cs1, b1, cs2 …) and release. Aiming between frames is what makes
		// this a block drop rather than the trigger's append — an append would
		// have put the block after cs3.
		await pointerTo(onRow(7));
		await pointerDrop();

		// The whole block relocated: the marker AND both of its fields, in
		// order, between cs2's block and cs3's. A marker-only move would strand
		// g1/g2 in General; a reordered one would interleave them.
		expect(draftOrder()).toBe("cstay,g3,s1,cs1,b1,cs2,b2,cg,g1,g2,cs3,b3");
		expect(openPanelCards()).toEqual(["cs1", "cs2", "cg", "cs3"]);
		expect(openPanelShells()).toEqual(["b1", "b2", "g1", "g2", "b3"]);
		// Decision 4's "a successful drop stays on the sprung tab", and
		// Decision 3's "the moved item is selected" — for a card, reached by no
		// other DRAG in the suite (cards-canvas.test.tsx pins it for the ⋯
		// menu's move, which never goes through handleDragEnd).
		expect(openSection()).toBe("SEO");
		expect(hostSelection()).toBe("cg");
		// And General kept its other card, so SEO is still tab 1 rather than a
		// tab-0 the partition collapse handed it.
		expect(screen.getAllByRole("tab")).toHaveLength(2);
	});
});

describe("a keyboard drag bypasses the dwell", () => {
	// shellLeft=200 stacks the shell column directly under tabdrop-1, so a
	// single ArrowUp from shell-a resolves onto the SEO tab's zone.
	springFixture(200);

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

describe("a pointer drag wandering far outside the canvas", () => {
	springFixture();

	/** Two points far outside the canvas. `springRectMock`'s visible droppables
	 * span (0,0)→(500,330) — three trigger zones along the top, four shells
	 * stacked below — so both sit thousands of px past the nearest edge, far
	 * beyond `OUTSIDE_CANVAS_SLACK_PX`.
	 *
	 * **Two, because one point cannot discriminate both feedback channels.** A
	 * tab target draws a highlight and never a line; a field target draws a line
	 * and never a highlight (drag-feedback spec, Decision 3, "highlight, no
	 * line"). So whichever candidate a far-outside point would WRONGLY resolve
	 * to decides which of "no line" and "no highlight" that point can pin — the
	 * other assertion then holds with the guard and without it, proving nothing.
	 * `closestCenter` ranks by centre distance from the dragged rect and the tab
	 * strip lies along the top, so travelling out diagonally reaches a trigger
	 * first and travelling straight DOWN reaches the bottom shell first:
	 *
	 * - `FAR_CORNER` — nearest candidate `tabdrop-2`, Meta's trigger. Pins "no
	 *   drop target marked".
	 * - `FAR_BELOW` — nearest candidate `shell-c`, past the foot of the column.
	 *   Pins "no drop indicator".
	 *
	 * Both established by mutation, not by reasoning — see the `it` below.
	 *
	 * The slack's VALUE is not this block's claim, and no assertion here should
	 * be read as pinning it: `visible-collision.test.ts` pins it against
	 * `editorCollision` directly, where a coordinate is a function argument
	 * rather than a fired event, and where the edge cases (just-outside-but-
	 * within-slack, hidden zero-rects, the keyboard bypass) can be enumerated
	 * cheaply. The only question below is whether that function's `[]` survives
	 * the trip through dnd-kit to `handleDragEnd`. */
	const FAR_CORNER = { x: 3000, y: 3000 };
	const FAR_BELOW = { x: 10, y: 3000 };

	/** No insertion line drawn anywhere, and no drop target marked anywhere.
	 * `data-drop-target` is the attribute behind BOTH the tab-trigger highlight
	 * and a card frame's receiving tint, so one query covers both channels —
	 * though THREE_TABS renders no cards, so it is the trigger highlight this
	 * fixture actually exercises. The line is queried across the whole document,
	 * hidden panels included: a target resolved into a tab the canvas is not
	 * showing still draws one, and "nothing resolved" has to mean nowhere. */
	const expectNoDropFeedback = () => {
		expect(screen.queryByTestId("drop-indicator")).toBeNull();
		expect(document.querySelectorAll("[data-drop-target]")).toHaveLength(0);
	};

	/**
	 * The #45 leg the 0.12.0 runtime gate failed and the suite could not see —
	 * `visible-collision.ts` records it as "a post-spring drag to the page
	 * corner still committed a drop". `closestCenter` has no distance cutoff, so
	 * it always names SOME nearest droppable however far away the drag has gone;
	 * `editorCollision` cuts a far-outside POINTER off before that fallback, and
	 * this is the test that the cut-off reaches `handleDragEnd` as `over == null`
	 * and takes its restore branch.
	 *
	 * Reached by the pointer route, which is the only route that exists: the
	 * guard reads `args.pointerCoordinates`, and a keyboard drag carries none.
	 * `dnd.test.tsx`'s "a drop that resolves to nothing restores the drag-start
	 * tab" arrives at the same branch from the opposite side — `over` non-null, a
	 * self-drop that `resolveDropTarget` declines, driven by the keyboard — so it
	 * says nothing about whether a null `over` ever arrives at all.
	 *
	 * **Discrimination, checked by mutation rather than by reading.** With
	 * `pointerOutsideCanvas`'s early return taken out of `editorCollision`, the
	 * fallback hands over `tabdrop-2` at FAR_CORNER — the highlight returns — and
	 * `shell-c` at FAR_BELOW — a line returns, at the end of Meta's list. Released
	 * there, the draft becomes `x,s1,b,s2,c,a` and the canvas follows `a` out of
	 * General, which is the original report's shape. Separately, deleting
	 * `restoreDragStartTab()` from `handleDragEnd`'s null-target branch reddens
	 * the "General" assertion on its own. Each was run.
	 *
	 * **A first version of this test probed only the corner, and its "no drop
	 * indicator" assertion could not fail** — a tab target never draws a line, so
	 * the line was absent with the guard and without it. The `not.toBeNull()`
	 * guard at `onRow(2)` bracketed that assertion but did not pin it, and
	 * bracketing is not pinning. FAR_BELOW is the repair, and the reason there
	 * are two points at all.
	 *
	 * What the mutations do NOT establish is the slack constant's VALUE, and this
	 * test should never be read as pinning it: widening the slack to 400 leaves
	 * this green (both points are still well outside), and only a slack wide
	 * enough to swallow them — ~2670 at this fixture's geometry — reddens it.
	 * Both measured. Deliberately so: this kills "the guard is gone", which is the
	 * wiring claim; `visible-collision.test.ts` kills "the guard moved".
	 *
	 * **What it cannot see.** jsdom lays nothing out, so `springRectMock` decides
	 * where the union of droppables is and the fired event decides where the
	 * pointer is — both stipulated, neither measured. Nothing here says a real
	 * editor's canvas is any particular size, that 3000px is off-screen for a
	 * real author, or that the shipped slack is the right amount of it. Read a
	 * failure as "the far-outside no-op broke", never as "the canvas moved".
	 */
	it("resolves nothing on the way out, commits nothing on release, and restores the drag-start section", async () => {
		renderCanvas();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const before = draftOrder();
		expect(before).toBe("a,x,s1,b,s2,c");

		await pointerLift("a");

		// Spring to SEO first. Without it the drag-start tab IS the open one and
		// "the drag-start section is restored" would hold with no restore wiring
		// whatsoever — the spring is what gives the restore something to undo.
		// The highlight it draws on the way is also channel one of two, shown
		// working before its absence is ever asserted.
		await pointerTo(onTrigger(1));
		expect(screen.getByTestId("tabdrop-1")).toHaveAttribute(
			"data-drop-target",
			"true",
		);
		await dwell();
		expect(openSection()).toBe("SEO");

		// Down into the section that just appeared, onto its field: channel two,
		// the insertion line. Both kinds of feedback are now known to be live in
		// this drag, so neither absence below can pass on a drag that was drawing
		// nothing anyway.
		await pointerTo(onRow(2));
		expect(screen.queryByTestId("drop-indicator")).not.toBeNull();

		// Out past the corner, where the wrong answer would be Meta's trigger…
		await pointerTo(FAR_CORNER);
		expectNoDropFeedback();

		// …and straight down past the foot of the column, where the wrong answer
		// would be `shell-c` — a line rather than a highlight. One drag, no
		// release in between: leaving the canvas has to keep resolving nothing,
		// not merely resolve nothing at the first point it reaches.
		await pointerTo(FAR_BELOW);
		expectNoDropFeedback();

		// The drag is still live through both — a pointer off the canvas resolves
		// nothing, it does not cancel. (A cancel would restore the tab here, and
		// the release assertions below would be measuring the wrong mechanism.)
		expect(dragInFlight()).toBe(true);
		expect(openSection()).toBe("SEO");
		// Still nothing written, either — leaving the canvas is not a commit.
		expect(draftOrder()).toBe(before);

		await pointerDrop();

		// Byte-identical: not one splice ran.
		expect(draftOrder()).toBe(before);
		// Decision 4's restore, on the null-target path and after a spring.
		expect(openSection()).toBe("General");
		expect(openPanelShells()).toEqual(["a", "x"]);
		// Cheap belt, not load-bearing for the criteria above: selection is
		// `follow`'s doing and it starts null here, so this can only catch a
		// null-target branch that wrongly selects something on its way out.
		expect(hostSelection()).toBeNull();
	});
});
