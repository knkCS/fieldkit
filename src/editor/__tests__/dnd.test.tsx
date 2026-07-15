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
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker's Menu/Tooltip positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver and IntersectionObserver — both unimplemented
// in jsdom. Stub them locally, mirroring sections.test.tsx's rationale. The
// keyboard-reorder test yields a macrotask (to let dnd-kit's KeyboardSensor
// attach its listener), which is enough idle time for the selected shell's
// drag-handle Tooltip to run an autoUpdate tick and hit the missing global.
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

// The underlying menu machine only invokes a selected item's `onSelect` once
// `highlightedValue` is set — normally via real mouse hover, which relies on
// PointerEvent (unimplemented in jsdom). Driving the open menu via Home+Enter
// exercises the same "select" code path as a keyboard user; see
// sections.test.tsx for the established pattern.
async function selectMenuItem() {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Home" });
	});
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

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
};

function Harness({
	schema,
	onCommit = vi.fn(),
}: {
	schema: Schema;
	onCommit?: (s: Schema) => void;
}) {
	const spec = useSpecDraft(schema, testPlugins, onCommit);
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

/** Sectioned-canvas rect mock: tab-trigger drop zones sit in a row along
 * y=0, shells stack below at x=`shellLeft` — steering keyboard ArrowUp
 * toward tabdrop-0 (shellLeft=0, the default — shell-a's own tab) or
 * tabdrop-1 (shellLeft=200 — directly beneath the SEO tab's trigger).
 * Extracted from the "dropping a field on its OWN tab's trigger" test;
 * mirrors drag-feedback.test.tsx's tabdropRectMock idiom. */
function mockSectionedRects(shellLeft = 0) {
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
			// 0.11.0: pin the DragOverlay preview to dragged shell-a's initial
			// rect (see the keyboard-reorder test's rationale).
			if (testId === "drag-overlay-preview") {
				return rect(100, shellLeft, 200, 50);
			}
			if (testId.startsWith("tabdrop-")) {
				const index = Number(testId.slice("tabdrop-".length));
				return rect(0, index * 200, 100, 40);
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

describe("EditorCanvas drag & drop", () => {
	it("Move to section… relocates the field and follows it", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("shell-a"));
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Move to section"));
		});
		await selectMenuItem(); // only item is "SEO"

		// Review Finding 2 (deliberate behavioral update, not a frozen-semantics
		// violation — cross-section menu moves are exactly the surface this
		// feature changes, spec Decision 3): the field's "Move to section" menu
		// previously left the author on the source tab after the move, forcing
		// a manual tab click (the line this replaces). It now follows
		// automatically, same as the card menu and the drag-drop paths.
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		const panelA = screen.getByTestId("shell-a").closest("[role='tabpanel']");
		const panelB = screen.getByTestId("shell-b").closest("[role='tabpanel']");
		expect(panelA).toBe(panelB);
		expect(panelA).not.toHaveAttribute("hidden");
	});

	// The test above's fixture happens to pass this assertion EVEN WITHOUT the
	// follow wiring: moving "a" away leaves General with nothing, so its
	// implicit tab collapses out of partition.tabs entirely (same quirk as
	// cards-canvas.test.tsx's card-menu fixture) and SEO becomes the SOLE
	// remaining tab — trivially "active" at index 0, the index the canvas
	// was never asked to leave. This fixture keeps "x" behind in General so
	// it does NOT collapse: only the follow wiring can move the active tab
	// off General and onto SEO.
	it("Move to section… follows even when the source tab keeps other fields", async () => {
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

		fireEvent.click(screen.getByTestId("shell-a"));
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Move to section"));
		});
		await selectMenuItem(); // only item is "SEO"

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"false",
		);
		// "a" relocated into SEO, alongside "b"; "x" stayed behind in General.
		const panelA = screen.getByTestId("shell-a").closest("[role='tabpanel']");
		const panelB = screen.getByTestId("shell-b").closest("[role='tabpanel']");
		const panelX = screen.getByTestId("shell-x").closest("[role='tabpanel']");
		expect(panelA).toBe(panelB);
		expect(panelA).not.toBe(panelX);
		expect(panelA).not.toHaveAttribute("hidden");
	});

	it("keyboard reorder moves a field down", async () => {
		// jsdom lays out nothing — every element's getBoundingClientRect is all
		// zeroes, so dnd-kit's sortableKeyboardCoordinates (which filters
		// droppable containers by comparing rect.top) never finds a direction
		// to move in. Fake layout: each shell gets a distinct "top" based on
		// its current position in the DOM, so ArrowDown resolves to "the next
		// shell down".
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
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
				return {
					top,
					bottom: top + 50,
					left: 0,
					right: 200,
					width: 200,
					height: 50,
					x: 0,
					y: top,
					toJSON() {
						return this;
					},
				} as DOMRect;
			});

		const { container } = render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);

		// Persistent grip (0.10.0): the handle lives on the UNSELECTED shell —
		// no selection click. Discriminating against the old
		// selection-toolbar-only handle (#41).
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the next key.
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowDown" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		const order = Array.from(
			container.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["shell-b", "shell-a"]);

		rectSpy.mockRestore();
	});

	it("dropping a field on its OWN tab's trigger does not reorder it", async () => {
		// Fake layout for a sectioned canvas: tab-trigger drop zones sit in a
		// row along the top (y=0, spread horizontally), shells stack below.
		// Lifting shell-a and pressing ArrowUp therefore resolves to the
		// nearest drop zone above it — tabdrop-0, shell-a's OWN tab.
		const rectSpy = mockSectionedRects();

		const { container } = render(
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

		// Persistent grip (0.10.0): the handle lives on the UNSELECTED shell —
		// no selection click. Discriminating against the old
		// selection-toolbar-only handle (#41).
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the next key.
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });

		// Releasing over the field's own tab must be a no-op — without the
		// guard, moveFieldToSection would append shell-a to its tab's END.
		const order = Array.from(
			container.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["shell-a", "shell-x", "shell-b"]);

		rectSpy.mockRestore();
	});

	it("Escape after a keyboard zone-landing restores the drag-start tab", async () => {
		// shellLeft=200 puts shell-a directly beneath tabdrop-1 (the SEO
		// tab's trigger) — mirrors drag-feedback.test.tsx's
		// "cross-tab drag: the hovered FOREIGN trigger highlights" test,
		// which proves a single ArrowUp reliably lands on tabdrop-1 under
		// this exact mock shape.
		const rectSpy = mockSectionedRects(200);
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		// ArrowUp resolves the nearest zone above — tabdrop-1, the SEO tab —
		// and landing on it switches the visible tab IMMEDIATELY for
		// keyboard drags (Decision 6).
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		});
		// Assert the mid-drag switch actually happened BEFORE Escape — else
		// the restore assertion below would pass vacuously. Asserted via the
		// TRIGGER's aria-selected (not the panel's `hidden` attribute — under
		// jsdom the anker Tabs' presence/animation bookkeeping for `hidden`
		// can lag by a render or two once a SECOND EditorCanvas mounts in the
		// same test file; aria-selected flips synchronously with the
		// underlying activeTabIndex regardless).
		expect(screen.getByRole("tab", { name: "SEO" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? handle, { code: "Escape" });
		});
		// Restore: tab 0 (General) is selected again, schema unchanged.
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tab", { name: "SEO" })).toHaveAttribute(
			"aria-selected",
			"false",
		);
		const order = Array.from(
			document.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["shell-a", "shell-b"]);
		rectSpy.mockRestore();
	});

	it("a drop that resolves to nothing restores the drag-start tab", async () => {
		// Same landing as the Escape-restore test above (ArrowUp → tabdrop-1,
		// a visible mid-drag switch to the foreign SEO tab), but instead of
		// Escape we arrow back down onto shell-a's OWN position — a
		// self-drop, which resolveDropTarget treats as a no-op (null target)
		// — and then drop there. Landing on a FIELD id (not a tabdrop-*)
		// never triggers handleDragOver's tab-follow, so the view is still
		// stuck on the SEO tab right up to the drop; only handleDragEnd's
		// restore-on-no-op path can bring it back.
		const rectSpy = mockSectionedRects(200);
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowUp" });
		});
		// Confirm the mid-drag switch happened (same guard as the Escape test;
		// see its comment on why aria-selected is the robust signal here).
		expect(screen.getByRole("tab", { name: "SEO" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? handle, {
				code: "ArrowDown",
			});
		});
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? handle, { code: "Space" });
		});
		// Restore: tab 0 (General) is selected again, schema unchanged.
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tab", { name: "SEO" })).toHaveAttribute(
			"aria-selected",
			"false",
		);
		const order = Array.from(
			document.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(order).toEqual(["shell-a", "shell-b"]);
		rectSpy.mockRestore();
	});

	it("insertion boundaries leave the a11y tree during a drag and return after cancel", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);

		// Before the drag: 3 boundaries (above a, above b, trailing). Their
		// hover-hidden opacity does not remove them from the a11y tree.
		expect(screen.getAllByRole("button", { name: "Add field" })).toHaveLength(
			3,
		);

		// Persistent grip (0.10.0): the handle lives on the UNSELECTED shell —
		// no selection click. Discriminating against the old
		// selection-toolbar-only handle (#41).
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { code: "Space" });
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the next key.
		await new Promise((resolve) => setTimeout(resolve, 0));

		// During the drag every boundary is display:none — insert affordances
		// must not intercept or overpaint transforming shells (stacking-context
		// inversion), so they leave the a11y tree entirely.
		expect(screen.queryAllByRole("button", { name: "Add field" })).toHaveLength(
			0,
		);

		// Escape cancels the drag; the boundaries return.
		fireEvent.keyDown(document.activeElement ?? handle, { code: "Escape" });
		expect(screen.getAllByRole("button", { name: "Add field" })).toHaveLength(
			3,
		);
	});

	it("hides the Move to section trigger when only one tab exists", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeSection("s1", "SEO"), makeField("b")]} />
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("shell-b"));
		// Toolbar is up (duplicate button proves it), but with a single tab
		// there is nowhere to move to — the menu trigger must not render.
		expect(screen.getByLabelText("Duplicate field")).toBeInTheDocument();
		expect(screen.queryByLabelText("Move to section")).not.toBeInTheDocument();
	});
});
