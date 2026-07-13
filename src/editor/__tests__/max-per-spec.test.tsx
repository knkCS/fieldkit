// src/editor/__tests__/max-per-spec.test.tsx
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { useSpecDraft } from "../use-spec-draft";
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";

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
	sectionNameInput: "Section name",
};

function CanvasHarness({
	schema,
	plugins,
}: {
	schema: Schema;
	plugins: FieldTypePlugin[];
}) {
	const spec = useSpecDraft(schema, plugins, vi.fn());
	const [selected, setSelected] = useState<string | null>(null);
	const [activeTabIndex, setActiveTabIndex] = useState(0);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={plugins}
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

const L = DEFAULT_EDITOR_LABELS;

describe("maxPerSpec surfacing (F4)", () => {
	it("F4a: disables Duplicate once the field's type has reached maxPerSpec", () => {
		const limitedText: FieldTypePlugin = { ...testPlugins[0], maxPerSpec: 1 };
		const plugins = [limitedText, testPlugins[1]];
		render(
			<EditorWrap>
				<CanvasHarness schema={[makeField("a")]} plugins={plugins} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-a"));
		expect(screen.getByLabelText("Duplicate field")).toBeDisabled();
	});

	it("F4a: does not disable Duplicate below the limit", () => {
		const roomyText: FieldTypePlugin = { ...testPlugins[0], maxPerSpec: 2 };
		const plugins = [roomyText, testPlugins[1]];
		render(
			<EditorWrap>
				<CanvasHarness schema={[makeField("a")]} plugins={plugins} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-a"));
		expect(screen.getByLabelText("Duplicate field")).not.toBeDisabled();
	});

	it("F4b: shows a warning alert strip for a maxPerSpec violation, distinct from fieldErrors", () => {
		const limitedText: FieldTypePlugin = { ...testPlugins[0], maxPerSpec: 1 };
		const plugins = [limitedText, testPlugins[1]];
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("a"), makeField("b")]}
					onCommit={vi.fn()}
					plugins={plugins}
				/>
			</EditorWrap>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent(/text/i);
		expect(screen.getByRole("alert")).toHaveTextContent(/limited to 1/i);
		// Save must also stay disabled — the draft IS invalid, only invisible
		// before this fix.
		expect(screen.getByRole("button", { name: L.save })).toBeDisabled();
	});

	it("F4b: shows no alert strip for a valid spec", () => {
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("a"), makeField("b")]}
					onCommit={vi.fn()}
					plugins={testPlugins}
				/>
			</EditorWrap>,
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
