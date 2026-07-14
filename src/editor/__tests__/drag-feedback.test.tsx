// src/editor/__tests__/drag-feedback.test.tsx
// Mid-drag feedback pins for the 0.11.0 drag-feedback rework (spec
// 2026-07-14): still list, overlay preview + dimmed origin, indicator line,
// card tint, tab-trigger highlight. End-state drop semantics stay pinned by
// dnd.test.tsx / cards-canvas.test.tsx — those suites are FROZEN.
// Every drag here is keyboard-driven, so keyboard parity (Decision 5) is
// structural, not a separate test axis.
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		expect(document.querySelectorAll('[data-drop-target="true"]')).toHaveLength(
			0,
		);

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
		expect(document.querySelectorAll('[data-drop-target="true"]')).toHaveLength(
			0,
		);

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
