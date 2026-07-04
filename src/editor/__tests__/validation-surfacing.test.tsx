// src/editor/__tests__/validation-surfacing.test.tsx
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { render, screen } from "@testing-library/react";
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
