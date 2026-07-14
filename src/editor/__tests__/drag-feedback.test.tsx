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
