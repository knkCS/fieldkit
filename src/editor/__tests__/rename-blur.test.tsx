import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
	addSection: "+ Section",
	newSectionName: "New section",
	sectionNameInput: "Section name",
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

describe("EditorCanvas rename blur ordering", () => {
	it("commits an in-progress rename before + Section acts (native blur ordering)", async () => {
		const user = userEvent.setup();
		render(
			<EditorWrap>
				<Harness schema={[makeSection("s1", "SEO"), makeField("b")]} />
			</EditorWrap>,
		);

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

		// user.click moves real focus to the "+ Section" button first, which
		// fires a native blur on the still-focused rename input BEFORE the
		// button's own click handler runs — fireEvent.click cannot emulate
		// this focus traversal, only userEvent can.
		await user.click(screen.getByText("+ Section"));

		// The rename committed via blur BEFORE the new section was added.
		expect(screen.getByRole("tab", { name: /Renamed/ })).toBeInTheDocument();
		// And the new section (which itself enters rename mode, defaulting
		// to "New section") exists too.
		expect(screen.getByDisplayValue("New section")).toBeInTheDocument();
	});
});
