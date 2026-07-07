// src/editor/__tests__/validation-surfacing.test.tsx
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("validation surfacing", () => {
	it("duplicate accessors put a danger outline on both shells and a badge on their tab", () => {
		// Two fields sharing accessor "dup" — a consumer-provided schema can
		// arrive with this even though the panel gate prevents authoring it.
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("dup"),
			makeField("dup"),
			makeField("ok"),
		];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);

		const badge = screen.getByTestId("tab-errors-0");
		expect(Number(badge.textContent)).toBeGreaterThanOrEqual(1);
		// The two "dup" fields collapse into ONE duplicate_accessor
		// fieldError, so the badge's accessible name is the singular
		// `tabErrorsOne` default at count 1 — proves the `formatCount(...)`
		// wiring at this call site.
		expect(badge).toHaveAttribute("aria-label", "1 invalid field");

		// React-key fix: both fields sharing "dup" must still render as two
		// distinct shells rather than colliding into one (or crashing).
		const dupShells = screen.getAllByTestId("shell-dup");
		expect(dupShells).toHaveLength(2);

		// Danger outline: the invalid shells' border style differs from a
		// clean sibling's, and matches each other (both invalid, same style).
		const okShell = screen.getByTestId("shell-ok");
		const dupBorder = getComputedStyle(dupShells[0]).borderColor;
		const okBorder = getComputedStyle(okShell).borderColor;
		expect(dupBorder).not.toBe(okBorder);
		expect(getComputedStyle(dupShells[1]).borderColor).toBe(dupBorder);

		// data-invalid: a programmatic hook equivalent to the visual outline,
		// for consumers (and tests) that shouldn't need to assert on computed
		// CSS border colors.
		expect(dupShells[0]).toHaveAttribute("data-invalid", "true");
		expect(dupShells[1]).toHaveAttribute("data-invalid", "true");
		expect(okShell).not.toHaveAttribute("data-invalid");
	});

	it("cross-tab duplicate accessors badge every tab containing the accessor", () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("dup"),
			makeSection("s2", "SEO"),
			makeField("dup"),
		];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);

		expect(screen.getByTestId("tab-errors-0")).toBeInTheDocument();
		expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();
	});

	it("reordering fields preserves shell DOM nodes (stable keys)", () => {
		// Keys must not be position-dependent: a reorder that changes a
		// shell's key remounts it, tearing down the focused drag handle
		// mid-keyboard-drag (focus drops to document.body).
		const { rerender } = render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b"), makeField("c")]} />
			</EditorWrap>,
		);
		const before = screen.getByTestId("shell-a");

		// useSpecDraft adopts genuinely-new prop content into a clean draft,
		// so a rerender with the reordered schema drives the same re-render
		// path a drag reorder's apply() does.
		rerender(
			<EditorWrap>
				<Harness schema={[makeField("b"), makeField("a"), makeField("c")]} />
			</EditorWrap>,
		);

		// The reorder actually applied…
		const shells = screen.getAllByTestId(/^shell-/);
		expect(shells.map((el) => el.dataset.testid)).toEqual([
			"shell-b",
			"shell-a",
			"shell-c",
		]);
		// …and the moved shell kept its DOM node (no remount).
		expect(screen.getByTestId("shell-a")).toBe(before);
	});

	it("deleting the SECOND of two duplicate-accessor shells removes only that one (F2b, position-based delete)", () => {
		const schema: Schema = [
			makeField("dup", "Dup A"),
			makeField("dup", "Dup B"),
		];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);

		const shells = screen.getAllByTestId("shell-dup");
		expect(shells).toHaveLength(2);

		fireEvent.click(shells[1]); // select the SECOND duplicate
		fireEvent.click(
			shells[1].querySelector('[aria-label="Delete field"]') as Element,
		);

		const remainingShells = screen.getAllByTestId("shell-dup");
		expect(remainingShells).toHaveLength(1);
		expect(screen.getByTestId("field-dup")).toHaveAttribute(
			"aria-label",
			"Dup A",
		);
	});

	it("disables Duplicate on a shell whose accessor is duplicated in the draft (F2c)", () => {
		const schema: Schema = [
			makeField("dup", "Dup A"),
			makeField("dup", "Dup B"),
		];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);

		const shells = screen.getAllByTestId("shell-dup");
		// Both shells share accessor "dup", so accessor-keyed selection state
		// shows both as "selected" — scope the query to the clicked shell.
		fireEvent.click(shells[0]);
		expect(within(shells[0]).getByLabelText("Duplicate field")).toBeDisabled();
	});

	it("does not disable Duplicate for a non-duplicated field", () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("ok")]} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("shell-ok"));
		expect(screen.getByLabelText("Duplicate field")).not.toBeDisabled();
	});

	it("valid spec renders no badges", () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("a"),
			makeSection("s2", "SEO"),
			makeField("b"),
		];
		render(
			<EditorWrap>
				<Harness schema={schema} />
			</EditorWrap>,
		);
		expect(screen.queryAllByTestId(/tab-errors-/)).toHaveLength(0);
	});
});
