// src/editor/__tests__/spec-editor.test.tsx
import { toaster } from "@knkcs/anker/primitives";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";

// Mock only the `toaster` export — SpecEditor (via SpecForm/EditorCanvas)
// imports other members (Tabs, Tooltip, Toaster) from the same module, so
// those must pass through untouched via importOriginal.
vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

const L = DEFAULT_EDITOR_LABELS;

function renderEditor(
	schema: Schema,
	onCommit: (s: Schema) => void | Promise<void> = vi.fn(),
	onDirtyChange: (dirty: boolean) => void = vi.fn(),
) {
	return render(
		<EditorWrap>
			<SpecEditor
				schema={schema}
				onCommit={onCommit}
				onDirtyChange={onDirtyChange}
				plugins={testPlugins}
			/>
		</EditorWrap>,
	);
}

describe("SpecEditor", () => {
	it("has displayName set", () => {
		expect(SpecEditor.displayName).toBe("SpecEditor");
	});

	it("renders canvas fields from the schema", () => {
		renderEditor([makeField("title", "Title"), makeField("body", "Body")]);
		expect(screen.getByTestId("shell-title")).toBeInTheDocument();
		expect(screen.getByTestId("shell-body")).toBeInTheDocument();
	});

	it("Save is disabled when the draft is clean", () => {
		renderEditor([makeField("title", "Title")]);
		expect(screen.getByRole("button", { name: L.save })).toBeDisabled();
	});

	it("editing via the panel updates the canvas and makes the draft dirty", () => {
		renderEditor([makeField("title", "Title")]);

		fireEvent.click(screen.getByTestId("shell-title"));
		expect(screen.getByTestId("field-config-panel")).toBeInTheDocument();

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		// Canvas shell re-renders with the edited field: the accessor is
		// committed already, so the auto-slug latch is inactive and the
		// accessor (and thus the shell's testid) stays "title".
		expect(screen.getByTestId("field-title")).toHaveAttribute(
			"aria-label",
			"Headline",
		);
		expect(screen.getByRole("button", { name: L.save })).not.toBeDisabled();
	});

	it("Save calls onCommit once with the edited schema and disables again", async () => {
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderEditor([makeField("title", "Title")], onCommit);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: L.save }));
		});

		expect(onCommit).toHaveBeenCalledTimes(1);
		const committed = onCommit.mock.calls[0][0] as Schema;
		expect(committed[0].config.name).toBe("Headline");
		expect(screen.getByRole("button", { name: L.save })).toBeDisabled();
	});

	it("Discard reverts the canvas to the last committed schema", () => {
		renderEditor([makeField("title", "Title")]);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});
		expect(screen.getByTestId("field-title")).toHaveAttribute(
			"aria-label",
			"Headline",
		);

		fireEvent.click(screen.getByRole("button", { name: L.discard }));

		expect(screen.getByTestId("field-title")).toHaveAttribute(
			"aria-label",
			"Title",
		);
		expect(screen.getByRole("button", { name: L.save })).toBeDisabled();
	});

	it("Try-it renders typable inputs; re-entering after a Build round trip loses the typed value", async () => {
		renderEditor([makeField("title", "Title")]);

		fireEvent.click(screen.getByRole("button", { name: L.tryIt }));
		const input = screen.getByTestId("field-title");
		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");

		fireEvent.click(screen.getByRole("button", { name: L.build }));
		fireEvent.click(screen.getByRole("button", { name: L.tryIt }));

		expect(screen.getByTestId("field-title")).toHaveValue("");
	});

	it("Try-it is disabled when the draft is invalid (a Tooltip explains why)", () => {
		renderEditor([makeField("dup"), makeField("dup")]);
		expect(screen.getByRole("button", { name: L.tryIt })).toBeDisabled();
	});

	it("Escape clears the selection and closes the panel", () => {
		renderEditor([makeField("title", "Title")]);

		fireEvent.click(screen.getByTestId("shell-title"));
		expect(screen.getByTestId("field-config-panel")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });

		expect(screen.queryByTestId("field-config-panel")).not.toBeInTheDocument();
	});

	it("notifies onDirtyChange as the draft becomes dirty", () => {
		const onDirtyChange = vi.fn();
		renderEditor([makeField("title", "Title")], vi.fn(), onDirtyChange);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		expect(onDirtyChange).toHaveBeenLastCalledWith(true);
	});

	it("an async onCommit rejection keeps Save enabled and dirty, and shows an error toast", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("api down"));
		renderEditor([makeField("title", "Title")], onCommit);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: L.save }));
		});

		expect(toaster.create).toHaveBeenCalledWith({
			title: L.saveFailed,
			type: "error",
		});
		expect(screen.getByRole("button", { name: L.save })).not.toBeDisabled();
	});

	it("deleting a field shows an undo toast, and Undo restores it at its position", () => {
		renderEditor([makeField("a"), makeField("b"), makeField("c")]);

		fireEvent.click(screen.getByTestId("shell-b"));
		fireEvent.click(screen.getByLabelText(L.deleteField));

		expect(screen.queryByTestId("shell-b")).not.toBeInTheDocument();
		expect(toaster.create).toHaveBeenCalledWith(
			expect.objectContaining({
				title: L.fieldDeleted,
				action: expect.objectContaining({ label: L.undo }),
			}),
		);

		const call = vi
			.mocked(toaster.create)
			.mock.calls.find((c) => c[0].title === L.fieldDeleted);

		act(() => {
			call?.[0].action?.onClick();
		});

		const shells = screen.getAllByTestId(/^shell-/);
		expect(shells.map((el) => el.dataset.testid)).toEqual([
			"shell-a",
			"shell-b",
			"shell-c",
		]);
	});
});
