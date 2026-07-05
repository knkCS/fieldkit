import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
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

// anker's Menu/Dialog positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver — unimplemented in jsdom. Stub it locally,
// mirroring insertion.test.tsx's rationale for the popover-based picker.
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// The underlying menu machine only invokes a selected item's `onSelect` once
// `highlightedValue` is set — normally via real mouse hover, which relies on
// PointerEvent (unimplemented in jsdom) or roving keyboard focus. Driving the
// open menu via Home/End + Enter exercises the same "select" code path as a
// keyboard user, and is the reliable way to select an item in this environment.
async function selectMenuItem(edge: "first" | "last") {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: edge === "first" ? "Home" : "End" });
	});
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

// "Move right" is always the third item (index 2): Rename, Move left, Move
// right, [Orientation], Delete.
async function selectMoveRight() {
	const menu = await screen.findByRole("menu");
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
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

// The orientation item, when present, is always the one just before Delete.
async function selectOrientationMenuItem() {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: "End" });
	});
	await act(async () => {
		fireEvent.keyDown(menu, { key: "ArrowUp" });
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
	shell: {
		drag: "Drag to reorder",
		edit: "Edit field",
		duplicate: "Duplicate field",
		delete: "Delete field",
		systemLocked: "System field",
	},
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
	addSection: "+ Section",
	newSectionName: "New section",
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
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={testPlugins}
				selectedAccessor={selected}
				onSelect={setSelected}
				onEdit={setSelected}
				labels={LABELS}
			/>
		</ConfirmModalProvider>
	);
}

describe("EditorCanvas section strip editing", () => {
	it("+ Section appends a tab and enters rename mode", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a")]} />
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByText("+ Section"));
		});

		const input = screen.getByDisplayValue("New section");
		expect(input).toBeInTheDocument();

		fireEvent.change(input, { target: { value: "Details" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByRole("tab", { name: /Details/ })).toBeInTheDocument();
	});

	it("rename via menu commits on Enter", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeSection("s1", "SEO"), makeField("b")]} />
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectMenuItem("first"); // "Rename" is always the first item

		const input = await screen.findByDisplayValue("SEO");
		fireEvent.change(input, { target: { value: "Meta" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByRole("tab", { name: /Meta/ })).toBeInTheDocument();
	});

	it("delete section merges fields after confirm", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectMenuItem("last"); // "Delete section" is always the last item

		const confirmButton = await screen.findByRole("button", {
			name: "Confirm",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
		expect(screen.getByTestId("shell-b")).toBeInTheDocument();
	});

	it("deleting the ACTIVE section lands on the tab that received its fields", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeSection("s1", "SEO"),
						makeField("b"),
						makeSection("s2", "Meta"),
						makeField("c"),
					]}
				/>
			</EditorWrap>,
		);

		// Activate the SEO tab (tab-1), then delete it via its menu.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectMenuItem("last"); // "Delete section" is always the last item
		const confirmButton = await screen.findByRole("button", {
			name: "Confirm",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		// SEO's fields merged into the PREVIOUS tab (General) — the view must
		// follow them there, not slide onto Meta (whose index shifted down).
		expect(screen.getByRole("tab", { name: /General/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByTestId("shell-b").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});

	it("blur commits a rename after a previous Escape-cancelled rename", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeSection("s1", "SEO"), makeField("b")]} />
			</EditorWrap>,
		);

		// First session: enter rename mode, cancel with Escape.
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectMenuItem("first");
		const first = await screen.findByDisplayValue("SEO");
		fireEvent.keyDown(first, { key: "Escape" });
		expect(screen.getByRole("tab", { name: /SEO/ })).toBeInTheDocument();

		// Second session: the blur-suppression flag set by Escape must not
		// leak into this session (its input unmounted without firing blur) —
		// committing via blur has to still work.
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectMenuItem("first");
		const second = await screen.findByDisplayValue("SEO");
		fireEvent.change(second, { target: { value: "Meta" } });
		fireEvent.blur(second);

		expect(screen.getByRole("tab", { name: /Meta/ })).toBeInTheDocument();
	});

	it("orientation toggle only on the first section's menu", async () => {
		const schema = [
			makeSection("s1"),
			makeField("a"),
			makeSection("s2"),
			makeField("b"),
		];

		// Each phase below renders fresh and opens exactly one section menu:
		// menu content stays mounted-but-hidden after close in jsdom (there's
		// no CSS transitionend to drive Ark UI's unmount-on-exit), so reusing
		// one render across multiple opened-then-closed menus risks matching
		// a stale node instead of the one under test.
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: s1"));
		});
		expect(await screen.findByText("Vertical tabs")).toBeInTheDocument();
		cleanup();

		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: s2"));
		});
		await screen.findByRole("menu");
		expect(screen.queryByText("Vertical tabs")).not.toBeInTheDocument();
		cleanup();

		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: s1"));
		});
		await selectOrientationMenuItem();

		expect(screen.getByRole("tablist")).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
	});

	it("moving the ACTIVE section right keeps it visible at its new tab index (F9)", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"), // implicit tab-0
						makeSection("s1", "One"),
						makeField("b"),
						makeSection("s2", "Two"),
						makeField("c"),
					]}
				/>
			</EditorWrap>,
		);

		// View "One" (tab-1).
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /One/ }));
		});
		expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: One"));
		});
		await selectMoveRight();

		// "One"'s fields survive the move (they always did) — the view must
		// follow them to the tab's NEW index instead of showing whatever
		// section slid into the old one.
		expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByTestId("shell-b").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});

	it("moving a section right, while viewing the section it swaps with, follows the swap (F9)", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeSection("s1", "One"),
						makeField("b"),
						makeSection("s2", "Two"),
						makeField("c"),
					]}
				/>
			</EditorWrap>,
		);

		// View "Two" (tab-2) — the section "One" is about to swap places with.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /Two/ }));
		});

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: One"));
		});
		await selectMoveRight();

		// "Two" is now at tab-1 (swapped down one) — the view must follow it
		// there, not keep showing the stale numeric index.
		expect(screen.getByRole("tab", { name: /Two/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByTestId("shell-c").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});
});
