import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
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

function Harness({
	schema,
	onSelectSpy,
}: {
	schema: Schema;
	onSelectSpy?: (a: string | null) => void;
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
				onSelect={(a) => {
					onSelectSpy?.(a);
					setSelected(a);
				}}
				onEdit={(a) => setSelected(a)}
				labels={LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
			/>
		</ConfirmModalProvider>
	);
}

describe("EditorCanvas — cards", () => {
	it("clicking a card header selects the card", () => {
		const onSelectSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					schema={[makeCard("c1", "Basics"), makeField("a")]}
					onSelectSpy={onSelectSpy}
				/>
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("card-header-c1"));
		expect(onSelectSpy).toHaveBeenCalledWith("c1");
	});

	it("titled headers show the name; the ⊕ picker never offers the card type", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeCard("c1", "Basics"), makeField("a")]} />
			</EditorWrap>,
		);
		expect(
			within(screen.getByTestId("card-header-c1")).getByText("Basics"),
		).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getAllByLabelText("Add field")[0]);
		});
		expect(await screen.findByTestId("type-option-text")).toBeInTheDocument();
		expect(screen.queryByTestId("type-option-card")).not.toBeInTheDocument();
	});

	it("card header drag block-moves the marker WITH its contained fields", async () => {
		// jsdom lays out nothing — fake rects. Frames sit in a column at x=0;
		// shells are pushed far right (x=1000) so sortableKeyboardCoordinates
		// resolves ArrowDown from card c1 to card c2 (the closest droppable
		// below), not to a shell. (Even if it resolved to shell-b, the drop
		// handler maps it to its OWNING card c2 — same result.)
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 50,
						bottom: top + 50,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
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
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(60 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
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
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the next key.
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowDown" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// The whole block moved: c2's frame (with shell-b) now precedes c1's
		// (with shell-a). A marker-only move would strand shell-a under c2.
		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual([
			"card-frame-c2",
			"shell-b",
			"card-frame-c1",
			"shell-a",
		]);

		rectSpy.mockRestore();
	});

	it("releasing a card header over a tab trigger is a no-op", async () => {
		// Tab-trigger drop zones along the top row; frames/shells below —
		// lifting c1 and pressing ArrowUp resolves to tabdrop-0. Without the
		// guard, moveFieldToSection would relocate only the MARKER.
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 40,
						bottom: top + 40,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: pin the DragOverlay preview to dragged c1's initial rect.
				if (testId === "drag-overlay-preview") {
					return rect(100, 0);
				}
				if (testId.startsWith("tabdrop-")) {
					return rect(0, Number(testId.slice("tabdrop-".length)) * 200);
				}
				if (testId.startsWith("card-frame-")) {
					const frames = Array.from(
						document.querySelectorAll('[data-testid^="card-frame-"]'),
					);
					return rect(100 + frames.indexOf(this) * 300, 0);
				}
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(160 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "One"),
						makeField("a"),
						makeSection("s1", "SEO"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		const handle = screen.getByLabelText("Drag to move card");
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["card-frame-c1", "shell-a", "shell-b"]);

		rectSpy.mockRestore();
	});

	it("an empty card shows an always-visible insertion point scoped to its body", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeCard("c1", "Basics")]} />
			</EditorWrap>,
		);
		const frame = screen.getByTestId("card-frame-c1");
		expect(within(frame).getByLabelText("Add field")).toBeInTheDocument();
	});

	// INVERTED for 0.12.0 (spring-loaded sections): this pinned the OLD 0.8.0
	// same-tab card guard (v1 "no cross-tab card drag" — carried forward from
	// Task 5's review). moveCard mechanically permits a CROSS-TAB block move
	// — cardBlockRange/targetRange don't know about tabs at all — and that
	// guard has been deleted from resolveDropTarget's card branch: a visible
	// foreign card (or one of its fields) is now a LEGITIMATE card-block
	// target (all tabs stay mounted with the `hidden` attribute — zag-js's
	// Tabs — so dnd-kit's keyboard sensor, which enumerates every registered
	// droppable regardless of visibility, can and does resolve targets across
	// tab boundaries; the sprung-tab visibility is what makes the target
	// reachable in the first place). This test now proves the cross-tab MOVE
	// actually happens.
	it("card header drag DOES cross tab boundaries once resolved there (guard deleted)", async () => {
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 50,
						bottom: top + 50,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
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
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(60 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
			<EditorWrap>
				<Harness
					schema={[
						makeCard("c1", "One"),
						makeField("a"),
						makeSection("s1", "SEO"),
						makeCard("c2", "Two"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		// Both tabs are mounted simultaneously (General is active; SEO is
		// `hidden`) — card-frame-c1 renders before card-frame-c2 in DOM order,
		// so index 0 is unambiguously c1's handle.
		const handle = screen.getAllByLabelText("Drag to move card")[0];
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowDown" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// Guard deleted: c1's whole block (marker + field a) relocates into the
		// SEO tab, AFTER c2's whole block — landing at the end of the flat
		// schema (SEO becomes [c2, b, c1, a]; General is left empty).
		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual([
			"card-frame-c2",
			"shell-b",
			"card-frame-c1",
			"shell-a",
		]);

		rectSpy.mockRestore();
	});

	// Reviewer-mandated (final-review fix wave, Fix 1): the GENERIC field-drop
	// branch of handleDragEnd used a raw moveField(draft, fromIndex, toIndex)
	// — on an upward drag (fromIndex > toIndex) that lands the field BEFORE
	// the target marker instead of inside the card it was dropped onto. When
	// the target is the tab's FIRST card, "before the marker" means "before
	// every card in the tab" — a loose_field_in_carded_tab violation. This
	// pins the fixed behavior: dropping a field UP onto a card's frame must
	// snap the field INSIDE that card (at its top), not in front of it.
	it("dragging a field UP onto the tab's first card frame drops it INSIDE that card", async () => {
		// Single flat column (uniform 60px rows, all sharing x=0) covering BOTH
		// card frames and field shells — unlike the block-move tests above,
		// this drag must traverse markers AND fields one step at a time (m0 →
		// f1 → f2 → m3 → f4 in top order), so there's no reason to push shells
		// off to a separate column here.
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number) =>
					({
						top,
						left: 0,
						width: 100,
						height: 50,
						bottom: top + 50,
						right: 100,
						x: 0,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
				const testId = this.getAttribute("data-testid") ?? "";
				// 0.11.0: pin the DragOverlay preview to dragged f4's initial rect
				// (column index 4 × 60) — at the fallback rect(0) the four
				// ArrowUps would find no candidates above and the walk would be
				// vacuous.
				if (testId === "drag-overlay-preview") {
					return rect(240);
				}
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

		// Persistent grip (0.10.0): the handle lives on the unselected shell.
		const handle = within(screen.getByTestId("shell-f4")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		// Four steps up the flat column: f4 → m3 → f2 → f1 → m0.
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// f4 must land INSIDE m0's card frame (at its top), not loose in front
		// of the marker.
		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(within(frames[0]).getByTestId("shell-f4")).toBeInTheDocument();
		// A field stranded BEFORE the tab's first marker would violate
		// loose_field_in_carded_tab and outline invalid — confirm it's clean.
		expect(screen.getByTestId("shell-f4")).not.toHaveAttribute("data-invalid");

		rectSpy.mockRestore();
	});

	// Reviewer-mandated (final-review fix wave, Fix 5): the block-move tests
	// above only ever exercise tab 0 (the implicit General tab) — this pins
	// the identical drag working within a SECOND tab (schema with a section
	// marker), so a card block-move can't silently regress the moment a
	// schema has more than one tab.
	it("card header drag reorders within the SECOND tab", async () => {
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: Element) {
				const rect = (top: number, left: number) =>
					({
						top,
						left,
						width: 100,
						height: 50,
						bottom: top + 50,
						right: left + 100,
						x: left,
						y: top,
						toJSON() {
							return this;
						},
					}) as DOMRect;
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
				if (testId.startsWith("shell-")) {
					const shells = Array.from(
						document.querySelectorAll('[data-testid^="shell-"]'),
					);
					return rect(60 + shells.indexOf(this) * 300, 1000);
				}
				return rect(0, 0);
			});

		const { container } = render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("x"),
						makeSection("s1", "SEO"),
						makeCard("c1", "One"),
						makeField("a"),
						makeCard("c2", "Two"),
						makeField("b"),
					]}
				/>
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});

		// c1 is the only carded tab's first frame — index 0 among ALL
		// card-frame testids (the General tab has no cards of its own).
		const handle = screen.getAllByLabelText("Drag to move card")[0];
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowDown" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// c2's block (marker + shell-b) now precedes c1's — reordered WITHIN
		// the SEO tab — while the General tab's loose field is untouched.
		const order = Array.from(
			container.querySelectorAll(
				'[data-testid^="card-frame-"], [data-testid^="shell-"]',
			),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual([
			"shell-x",
			"card-frame-c2",
			"shell-b",
			"card-frame-c1",
			"shell-a",
		]);
		const seoPanel = screen
			.getByTestId("card-frame-c1")
			.closest("[role='tabpanel']");
		expect(
			screen.getByTestId("card-frame-c2").closest("[role='tabpanel']"),
		).toBe(seoPanel);
		expect(screen.getByTestId("shell-x").closest("[role='tabpanel']")).not.toBe(
			seoPanel,
		);

		rectSpy.mockRestore();
	});

	describe("card cross-section moves (0.12.0)", () => {
		it("card ⋯ menu moves the block to another section and follows it", async () => {
			const onSelectSpy = vi.fn();
			render(
				<EditorWrap>
					<Harness
						schema={[
							makeCard("c1", "One"),
							makeField("f1"),
							makeSection("s1", "SEO"),
							makeCard("c2", "Two"),
						]}
						onSelectSpy={onSelectSpy}
					/>
				</EditorWrap>,
			);
			// Open card c1's ⋯ menu (aria-label carries the card name).
			await act(async () => {
				fireEvent.click(screen.getByLabelText("Card menu: One"));
			});
			const menu = await screen.findByRole("menu");
			// Items: rename, delete-merge, delete-with-fields, then one move
			// target per OTHER section — here exactly one: "SEO".
			expect(within(menu).getByText("SEO")).toBeInTheDocument();
			expect(within(menu).getByText("Move to section")).toBeInTheDocument(); // group label from labels.moveToSection
			// fireEvent.click on a MenuItem does not fire the zag menu machine's
			// onSelect in jsdom (no PointerEvent → no highlightedValue) — same
			// limitation documented by dnd.test.tsx's/sections.test.tsx's
			// selectMenuItem helpers. The move target is the 4th interactive
			// item (index 3): rename(0), delete-merge(1), delete-with-fields(2),
			// move-to-SEO(3) — the "Move to section" group label is plain Text,
			// not a MenuItem, so it doesn't consume a roving-focus stop.
			await act(async () => {
				fireEvent.keyDown(menu, { key: "Home" });
			});
			await act(async () => {
				fireEvent.keyDown(menu, { key: "ArrowDown" });
			});
			await act(async () => {
				fireEvent.keyDown(menu, { key: "ArrowDown" });
			});
			await act(async () => {
				fireEvent.keyDown(menu, { key: "ArrowDown" });
			});
			await act(async () => {
				fireEvent.keyDown(menu, { key: "Enter" });
			});
			await waitFor(() => {
				// Block moved: c1+f1 now AFTER s1's existing content.
				const order = Array.from(
					document.querySelectorAll(
						'[data-testid^="shell-"], [data-testid^="card-header-"]',
					),
				).map((el) => el.getAttribute("data-testid"));
				expect(order).toEqual(["card-header-c2", "card-header-c1", "shell-f1"]);
			});
			// FOLLOW (Decision 3): the SEO panel is the visible one and the
			// moved card is selected. NOTE: this fixture's source ("General")
			// tab is IMPLICIT (no marker) and loses its only content (c1+f1) to
			// the move — partitionSchemaBySections drops an implicit tab with
			// no fields entirely, so SEO collapses from tab-1 to the SOLE
			// tab-0 rather than staying a second panel. Asserting via the tab
			// trigger's aria-selected (the drag-feedback.test.tsx/sections.
			// test.tsx idiom) sidesteps that index shift and pins the thing
			// that actually matters: SEO ends up the visible section.
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(
				screen.getByTestId("shell-f1").closest("[role='tabpanel']"),
			).not.toHaveAttribute("hidden");
			expect(onSelectSpy).toHaveBeenLastCalledWith("c1");
		});

		it("menu offers NO move targets on a single-tab spec", async () => {
			render(
				<EditorWrap>
					<Harness schema={[makeCard("c1", "One"), makeField("f1")]} />
				</EditorWrap>,
			);
			await act(async () => {
				fireEvent.click(screen.getByLabelText("Card menu: One"));
			});
			expect(screen.queryByText("Move to section")).not.toBeInTheDocument();
		});

		// Review Finding 1 (regression pin): moving the ONLY content out of an
		// IMPLICIT leading tab makes partitionSchemaBySections DROP that tab
		// entirely — every later tab index shifts down by one. The two-tab
		// fixture above can't discriminate this (its source tab collapsing
		// happens to land on the only remaining tab either way). A THREE-tab
		// fixture (General/A/B) does: moving c1+f1 (General's only content) to
		// B must land on B's NEW index (1 once General is gone), not B's
		// PRE-move index (2) — which the old code fed straight to
		// onActiveTabChange, tripping the tab-count-shrink guard back to tab 0
		// (A).
		it("follow-select survives a partition collapse (3-tab fixture, menu move)", async () => {
			// Finding 3: pin scroll-into-view coverage on this same test — the
			// jsdom idiom from spec-form-read-search.test.tsx (Element.prototype
			// has no native scrollIntoView; editor-canvas.tsx's
			// scrollShellIntoView calls it through `?.()`, so an unstubbed
			// jsdom silently no-ops and this call path stays uncovered).
			const originalScrollIntoView = Element.prototype.scrollIntoView;
			const scrollIntoViewMock = vi.fn();
			Element.prototype.scrollIntoView = scrollIntoViewMock;

			const onSelectSpy = vi.fn();
			render(
				<EditorWrap>
					<Harness
						schema={[
							makeCard("c1", "One"),
							makeField("f1"),
							makeSection("sa", "A"),
							makeField("fa"),
							makeSection("sb", "B"),
							makeField("fb"),
						]}
						onSelectSpy={onSelectSpy}
					/>
				</EditorWrap>,
			);

			await act(async () => {
				fireEvent.click(screen.getByLabelText("Card menu: One"));
			});
			const menu = await screen.findByRole("menu");
			// Two move targets now, in partition order: A (pre-move tabIndex 1),
			// then B (pre-move tabIndex 2). Items: rename(0), delete-merge(1),
			// delete-with-fields(2), move-to-A(3), move-to-B(4) — four
			// ArrowDowns from Home lands on move-to-B.
			await act(async () => {
				fireEvent.keyDown(menu, { key: "Home" });
			});
			for (let i = 0; i < 4; i++) {
				await act(async () => {
					fireEvent.keyDown(menu, { key: "ArrowDown" });
				});
			}
			await act(async () => {
				fireEvent.keyDown(menu, { key: "Enter" });
			});

			await waitFor(() => {
				// c1+f1 relocated to the END of B. General collapses out of
				// partition.tabs entirely (it had no other content), so the
				// full DOM order is exactly A's content then B's. #46: B was
				// uncarded, so the move first auto-wraps its loose field fb
				// into an untitled card ("card", insertCard's idiom) — the
				// arrival never produces loose_field_in_carded_tab.
				const order = Array.from(
					document.querySelectorAll(
						'[data-testid^="shell-"], [data-testid^="card-header-"]',
					),
				).map((el) => el.getAttribute("data-testid"));
				expect(order).toEqual([
					"shell-fa",
					"card-header-card",
					"shell-fb",
					"card-header-c1",
					"shell-f1",
				]);
			});
			// (a) B — NOT A, NOT clamped back to tab 0 — is the visible/selected
			// tab. Regex name match: B now carries a "loose_field_in_carded_tab"
			// error badge (fb precedes card c1 in a now-carded tab), which
			// extends its accessible name beyond the bare "B" text.
			expect(screen.getByRole("tab", { name: /^B/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(screen.getByRole("tab", { name: /^A/ })).toHaveAttribute(
				"aria-selected",
				"false",
			);
			// (b) the moved card is selected.
			expect(onSelectSpy).toHaveBeenLastCalledWith("c1");
			// Finding 3: the scroll-into-view continuation actually ran.
			expect(scrollIntoViewMock).toHaveBeenCalled();

			Element.prototype.scrollIntoView = originalScrollIntoView;
		});
	});
});
