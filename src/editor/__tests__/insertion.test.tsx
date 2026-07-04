import { act, fireEvent, render, screen } from "@testing-library/react";
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
		<EditorCanvas
			spec={spec}
			selectedAccessor={selected}
			onSelect={setSelected}
			onEdit={setSelected}
			labels={LABELS}
			plugins={testPlugins}
		/>
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

	it("picking a type inserts at that position and selects it", async () => {
		render(
			<EditorWrap>
				<Harness schema={[makeField("a"), makeField("b")]} />
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

		// The new field is selected — its toolbar is visible.
		expect(await screen.findByLabelText("Delete field")).toBeInTheDocument();
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
});
