import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
	shell: {
		drag: "Drag to reorder",
		edit: "Edit field",
		duplicate: "Duplicate field",
		delete: "Delete field",
		systemLocked: "System field",
	},
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

	it("duplicate inserts a copy right after with uniquified accessor", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a")]} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-a"));
		fireEvent.click(await screen.findByLabelText("Duplicate field"));
		expect(screen.getByTestId("shell-a_copy")).toBeInTheDocument();
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
