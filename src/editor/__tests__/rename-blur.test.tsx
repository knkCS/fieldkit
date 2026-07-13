import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker's Menu/Dialog positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver — unimplemented in jsdom. Stub it locally,
// mirroring sections.test.tsx's rationale.
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

// Mirrors sections.test.tsx's selectMenuItem: the underlying menu machine
// only invokes a selected item's onSelect once `highlightedValue` is set —
// normally via real mouse hover (PointerEvent, unimplemented in jsdom).
// Driving the open menu via Home + Enter exercises the same "select" path.
async function selectRenameMenuItem() {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Home" }); // "Rename" is always first
	});
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

function renderEditor(schema: Schema) {
	return render(
		<EditorWrap>
			<SpecEditor schema={schema} onCommit={vi.fn()} plugins={testPlugins} />
		</EditorWrap>,
	);
}

describe("SpecEditor rename blur ordering (toolbar + Section)", () => {
	it("commits an in-progress rename before + Section acts (native blur ordering across the toolbar boundary)", async () => {
		const user = userEvent.setup();
		renderEditor([makeSection("s1", "SEO"), makeField("b")]);

		// Enter rename mode via the section menu (sections.test.tsx idiom).
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectRenameMenuItem();

		const input = await screen.findByDisplayValue("SEO");

		// Type a new name WITHOUT pressing Enter — the rename is only
		// committed on blur or Enter, and this leaves it in-progress.
		await user.clear(input);
		await user.type(input, "Renamed");

		// user.click moves real focus to the toolbar's "+ Section" button
		// first, which fires a native blur on the still-focused rename input
		// (inside the canvas) BEFORE the button's own click handler runs in
		// SpecEditor — fireEvent.click cannot emulate this focus traversal.
		// getByText: with the canvas's floating row deleted, exactly ONE
		// "+ Section" exists — this query doubles as a single-source pin.
		await user.click(screen.getByText("+ Section"));

		// The rename committed via blur BEFORE the new section was added.
		expect(screen.getByRole("tab", { name: /Renamed/ })).toBeInTheDocument();
		// And the new section (which itself enters rename mode via the pulse,
		// defaulting to "New section") exists too.
		expect(screen.getByDisplayValue("New section")).toBeInTheDocument();
	});
});
