import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { useSpecDraft } from "../use-spec-draft";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker's Popover positions itself via @floating-ui/dom's autoUpdate, which
// requires ResizeObserver — unimplemented in jsdom. Stub it locally (rather
// than in the global test setup) since another suite intentionally exercises
// the "ResizeObserver unavailable" fallback path.
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
	plugins = testPlugins,
	onCommit = vi.fn(),
	onSelectSpy,
	onEditSpy,
}: {
	schema: Schema;
	plugins?: FieldTypePlugin[];
	onCommit?: (s: Schema) => void;
	onSelectSpy?: (accessor: string | null) => void;
	onEditSpy?: (accessor: string) => void;
}) {
	const spec = useSpecDraft(schema, testPlugins, onCommit);
	const [selected, setSelected] = useState<string | null>(null);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				selectedAccessor={selected}
				onSelect={(a) => {
					onSelectSpy?.(a);
					setSelected(a);
				}}
				onEdit={(a) => {
					onEditSpy?.(a);
					setSelected(a);
				}}
				labels={LABELS}
				plugins={plugins}
			/>
		</ConfirmModalProvider>
	);
}

describe("EditorCanvas insertion points", () => {
	it("empty spec shows an always-visible insertion point", () => {
		render(
			<EditorWrap>
				<Harness schema={[]} />
			</EditorWrap>,
		);
		expect(screen.getByLabelText("Add field")).toBeInTheDocument();
	});

	it("picking a type inserts at that position and calls onEdit (selects it AND focuses the label), not onSelect", async () => {
		const onSelectSpy = vi.fn();
		const onEditSpy = vi.fn();
		render(
			<EditorWrap>
				<Harness
					schema={[makeField("a"), makeField("b")]}
					onSelectSpy={onSelectSpy}
					onEditSpy={onEditSpy}
				/>
			</EditorWrap>,
		);
		// Insertion points: [0]=before a, [1]=between a and b, [2]=after b.
		const insertionTriggers = screen.getAllByLabelText("Add field");
		expect(insertionTriggers).toHaveLength(3);
		await act(async () => {
			fireEvent.click(insertionTriggers[1]);
		});
		const option = await screen.findByTestId("type-option-text");
		await act(async () => {
			fireEvent.click(option);
		});

		const shells = Array.from(
			document.querySelectorAll('[data-testid^="shell-"]'),
		).map((el) => el.getAttribute("data-testid"));
		expect(shells).toEqual(["shell-a", "shell-text", "shell-b"]);

		// Insertion goes through onEdit (focuses the panel's Label input), not
		// plain onSelect.
		expect(onEditSpy).toHaveBeenCalledWith("text");
		expect(onSelectSpy).not.toHaveBeenCalled();

		// The new field is selected — its toolbar is visible.
		expect(await screen.findByLabelText("Delete field")).toBeInTheDocument();
	});

	it("the insertion popover never offers the section type (use + Section instead)", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a")]} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getAllByLabelText("Add field")[0]);
		});
		expect(await screen.findByTestId("type-option-text")).toBeInTheDocument();
		expect(screen.queryByTestId("type-option-section")).not.toBeInTheDocument();
	});

	it("empty tab shows its insertion point", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeSection("s1", "SEO")]} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByText("SEO"));
		});
		expect(screen.getByLabelText("Add field")).toBeInTheDocument();
	});

	it("insertion rows become visible on keyboard focus (WCAG 2.4.7)", () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
			</EditorWrap>,
		);
		const trigger = screen.getAllByLabelText("Add field")[0];
		const row = trigger.closest("[role='group']") as HTMLElement;
		expect(row).not.toBeNull();

		// jsdom's getComputedStyle cannot resolve pseudo-class rules such as
		// :focus-within, so assert against the emitted stylesheet instead:
		// the row's emotion class must carry a focus-within rule restoring
		// opacity, so Tabbing onto the hidden ⊕ button reveals the row.
		const cssClass = Array.from(row.classList).find((c) =>
			c.startsWith("css-"),
		);
		expect(cssClass).toBeDefined();
		const styleText = Array.from(document.querySelectorAll("style"))
			.map((tag) => tag.textContent ?? "")
			.join("\n");
		const focusWithinRule = new RegExp(
			`\\.${cssClass}[^{]*focus-within[^{]*\\{[^}]*opacity:1`,
		);
		expect(styleText).toMatch(focusWithinRule);
	});

	it("empty plugin registry shows the no-matching message inside the popover", async () => {
		render(
			<EditorWrap>
				<Harness schema={[]} plugins={[]} />
			</EditorWrap>,
		);
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Add field"));
		});
		expect(
			await screen.findByText("No matching field types"),
		).toBeInTheDocument();
	});
});
