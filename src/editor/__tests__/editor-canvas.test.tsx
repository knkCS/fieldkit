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
import { describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

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

describe("EditorCanvas", () => {
	it("renders real field components inside shells, flat when sectionless", () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);
		expect(screen.getByTestId("shell-a")).toBeInTheDocument();
		expect(screen.getByTestId("field-a")).toBeInTheDocument();
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
	});

	it("renders tabs for sectioned schemas with mounted-hidden panels", () => {
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("b")]}
				/>
			</EditorWrap>,
		);
		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("General"),
				expect.stringContaining("SEO"),
			]),
		);
		expect(screen.getByTestId("shell-b")).toBeInTheDocument(); // mounted though inactive
	});

	it("click selects a shell; delete removes the field from the draft", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-a"));
		fireEvent.click(await screen.findByLabelText("Delete field"));
		expect(screen.queryByTestId("shell-a")).not.toBeInTheDocument();
		expect(screen.getByTestId("shell-b")).toBeInTheDocument();
	});

	it("duplicate inserts a copy right after with uniquified accessor and selects the copy", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a")]} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-a"));
		fireEvent.click(await screen.findByLabelText("Duplicate field"));

		const copyShell = screen.getByTestId("shell-a_copy");
		expect(copyShell).toBeInTheDocument();
		// The copy — not the original — is selected: its own toolbar is visible.
		expect(
			within(copyShell).getByLabelText("Delete field"),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("shell-a")).queryByLabelText("Delete field"),
		).not.toBeInTheDocument();
	});

	it("renders hidden fields as selectable muted rows", () => {
		const hidden = makeField("h");
		hidden.config.hidden = true;
		render(
			<EditorWrap>
				<Harness schema={[hidden]} />
			</EditorWrap>,
		);
		expect(screen.getByTestId("shell-h")).toBeInTheDocument();
		expect(screen.getByText(/Hidden field/)).toBeInTheDocument();
		expect(screen.queryByTestId("field-h")).not.toBeInTheDocument();
	});

	// The canvas is one of the two callers that claim the global "/" — it is
	// the only search on the screen it owns, so nothing can lose the race to
	// it there.
	it("claims '/' to focus the field search", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeSection("s1", "SEO"), makeField("meta")]}
				/>
			</EditorWrap>,
		);
		fireEvent.keyDown(document.body, { key: "/" });
		await waitFor(() => {
			expect(screen.getByPlaceholderText("Find field…")).toHaveFocus();
		});
	});

	it("field search jumps tabs and selects", async () => {
		render(
			<EditorWrap>
				<Harness
					schema={[
						makeField("a"),
						makeSection("s1", "SEO"),
						makeField("meta", "Meta description"),
					]}
				/>
			</EditorWrap>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		const option = await screen.findByRole("option");
		await act(async () => {
			fireEvent.click(option);
		});
		expect(
			screen.getByTestId("shell-meta").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});
});

describe("EditorCanvas — controlled active tab (lifted state)", () => {
	function ControlledHarness({
		schema,
		activeTabIndex,
		onActiveTabChange,
	}: {
		schema: Schema;
		activeTabIndex: number;
		onActiveTabChange: (index: number) => void;
	}) {
		const spec = useSpecDraft(schema, testPlugins, vi.fn());
		return (
			<ConfirmModalProvider>
				<EditorCanvas
					spec={spec}
					plugins={testPlugins}
					selectedAccessor={null}
					onSelect={vi.fn()}
					onEdit={vi.fn()}
					labels={LABELS}
					activeTabIndex={activeTabIndex}
					onActiveTabChange={onActiveTabChange}
				/>
			</ConfirmModalProvider>
		);
	}

	const sectioned: Schema = [
		makeField("a"),
		makeSection("s1", "SEO"),
		makeField("b"),
	];

	it("renders the tab given by activeTabIndex", () => {
		render(
			<EditorWrap>
				<ControlledHarness
					schema={sectioned}
					activeTabIndex={1}
					onActiveTabChange={vi.fn()}
				/>
			</EditorWrap>,
		);
		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("reports tab clicks through onActiveTabChange WITHOUT switching on its own (fully controlled)", async () => {
		const spy = vi.fn();
		render(
			<EditorWrap>
				<ControlledHarness
					schema={sectioned}
					activeTabIndex={0}
					onActiveTabChange={spy}
				/>
			</EditorWrap>,
		);
		// zag's Tabs machine transitions asynchronously — matches the
		// act-wrapping convention used for every other tab-click assertion in
		// this suite (sections/dnd/cards-canvas tests).
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		expect(spy).toHaveBeenCalledWith(1);
		// The parent ignored the report — a canvas with leftover INTERNAL tab
		// state would have switched anyway. This is the discriminating half.
		expect(screen.getByRole("tab", { name: /General/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});
