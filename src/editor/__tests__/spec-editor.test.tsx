// src/editor/__tests__/spec-editor.test.tsx
import { toaster } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// Mock only the `toaster` export — SpecEditor (via SpecForm/EditorCanvas)
// imports other members (Tabs, Tooltip, Toaster) from the same module, so
// those must pass through untouched via importOriginal.
vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

// anker's Popover positions itself via @floating-ui/dom's autoUpdate, which
// requires ResizeObserver — unimplemented in jsdom (needed for the ⊕
// insertion popover test below).
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

		// zag's SegmentGroup (radio-group) machine transitions asynchronously —
		// same rationale as the Tabs.Root clicks elsewhere in this suite — so
		// each mode-switching click is wrapped in `act(async …)` to flush it
		// before the next assertion/click depends on the settled mode.
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		});
		const input = screen.getByTestId("field-title");
		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");

		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.build }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		});

		expect(screen.getByTestId("field-title")).toHaveValue("");
	});

	it("the Preview segment is disabled when the draft is invalid (a Tooltip explains why)", () => {
		renderEditor([makeField("dup"), makeField("dup")]);
		expect(screen.getByRole("radio", { name: L.tryIt })).toBeDisabled();
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

	it("the dirty dot appears with the labels-provided aria-label once dirty", () => {
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("title", "Title")]}
					onCommit={vi.fn()}
					plugins={testPlugins}
					labels={{ dirty: "You have unsaved edits" }}
				/>
			</EditorWrap>,
		);

		// Clean draft: DirtyDot renders nothing at all (active=false).
		expect(screen.queryByLabelText("You have unsaved edits")).toBeNull();

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		expect(screen.getByLabelText("You have unsaved edits")).toBeInTheDocument();
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
			description: "api down",
			type: "error",
		});
		expect(screen.getByRole("button", { name: L.save })).not.toBeDisabled();
	});

	it("saveFailed toast carries the Error message as description by default (#36)", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("Server said no"));
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
			description: "Server said no",
			type: "error",
		});
	});

	it("stringifies non-Error rejections", async () => {
		const onCommit = vi.fn().mockRejectedValue("quota exceeded");
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
			description: "quota exceeded",
			type: "error",
		});
	});

	it("formatSaveError overrides the default formatter", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("raw"));
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("title", "Title")]}
					onCommit={onCommit}
					plugins={testPlugins}
					formatSaveError={() => "translated"}
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: L.save }));
		});

		expect(toaster.create).toHaveBeenCalledWith({
			title: L.saveFailed,
			description: "translated",
			type: "error",
		});
	});

	it("formatSaveError returning null suppresses the description", async () => {
		const onCommit = vi.fn().mockRejectedValue(new Error("raw server text"));
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("title", "Title")]}
					onCommit={onCommit}
					plugins={testPlugins}
					formatSaveError={() => null}
				/>
			</EditorWrap>,
		);

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
	});

	it("Try-it passes label overrides through to SpecForm (e.g. a translated default tab)", () => {
		render(
			<EditorWrap>
				<SpecEditor
					schema={[
						makeField("a"),
						{
							field_type: "section",
							config: {
								name: "SEO",
								api_accessor: "s1",
								required: false,
								instructions: "",
							},
							settings: {},
							system: false,
						},
						makeField("b"),
					]}
					onCommit={vi.fn()}
					plugins={testPlugins}
					labels={{ defaultTab: "Allgemein" }}
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));

		expect(screen.getByText("Allgemein")).toBeInTheDocument();
	});

	it("shows a conflict toast when the schema prop changes in the background while the draft is dirty", () => {
		const { rerender } = renderEditor([makeField("title", "Title")]);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});

		rerender(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("title", "Changed elsewhere")]}
					onCommit={vi.fn()}
					plugins={testPlugins}
				/>
			</EditorWrap>,
		);

		expect(toaster.create).toHaveBeenCalledWith({
			title: L.baselineConflict,
			type: "warning",
		});
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

		// Exclude `shell-toolbar-*` (persistent-grip refinement, #41): undo
		// restores selection too (see the next test), so the restored
		// field's toolbar mounts under the same "shell-" testid prefix.
		const shells = screen.getAllByTestId(/^shell-(?!toolbar-)/);
		expect(shells.map((el) => el.dataset.testid)).toEqual([
			"shell-a",
			"shell-b",
			"shell-c",
		]);
	});

	it("undo restores the deleted field AND its panel selection", () => {
		renderEditor([makeField("title", "Title"), makeField("body", "Body")]);

		fireEvent.click(screen.getByTestId("shell-body"));
		fireEvent.click(screen.getByLabelText(L.deleteField));

		expect(screen.queryByTestId("shell-body")).not.toBeInTheDocument();
		// Deleting destroys the panel's selection context along with the field.
		expect(screen.queryByTestId("field-config-panel")).not.toBeInTheDocument();

		// `.at(-1)`, not `.find(title === …)`: this mocked `toaster.create` is
		// never reset between tests in this file, so an earlier delete-undo
		// test's call would otherwise still be the FIRST "fieldDeleted" match.
		const call = vi.mocked(toaster.create).mock.calls.at(-1)?.[0];
		act(() => {
			call?.action?.onClick?.();
		});

		// The restored field is selected: its config panel shows its name.
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Body");
	});

	it("discard while in Try-it resets scratch values (nonce bump)", async () => {
		renderEditor([makeField("title", "Title")]);

		// Dirty the draft via a rename, then enter Try-it.
		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Title2" },
		});
		// See the round-trip test above: the SegmentedControl's underlying
		// zag radio-group machine settles asynchronously.
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		});

		const input = screen.getByLabelText(/Title/);
		fireEvent.change(input, { target: { value: "scratch" } });
		expect(input).toHaveValue("scratch");

		// The header's Discard button stays available while in Try-it.
		fireEvent.click(screen.getByRole("button", { name: L.discard }));

		await waitFor(() => {
			expect(screen.getByLabelText(/Title/)).toHaveValue("");
		});
	});

	it("inserting a field via the ⊕ selects it and focuses the panel's Name input", async () => {
		// This test exercises the REAL anker Popover (zag-js) around the ⊕
		// trigger, whose own close transition schedules a single
		// `requestAnimationFrame` to restore focus to the trigger button
		// (@zag-js/popover's setFinalFocus). The panel's rising-edge autofocus
		// effect now waits two animation frames before focusing the Name
		// input (see field-config-panel.tsx) specifically so it outlasts that
		// restore in a real browser — verified live in Storybook via
		// Playwright, where a synchronous/single-rAF focus lost the race and
		// left focus on the "Add field" trigger button.
		//
		// jsdom has no real animation-frame timing, so the two independent
		// `requestAnimationFrame` chains (ours and zag's) don't reliably
		// interleave the same way a real browser's frame batching would.
		// Stubbing rAF as a macrotask and draining it with fake timers makes
		// the ordering deterministic: `vi.runAllTimers()` executes every
		// pending timer in registration order, including ones newly
		// scheduled while draining — which is exactly what guarantees our
		// SECOND frame (the actual focus() call) runs after zag's single
		// frame (its restore), regardless of which of the two frame chains
		// was registered first. This doesn't reproduce the real race itself
		// (jsdom timing isn't real frame timing); it verifies the double-rAF
		// ordering guarantee the fix depends on.
		//
		// The stub is only switched in right before the option click below —
		// opening the popover still runs on real timers/rAF (floating-ui
		// positioning relies on it), and only the CLOSE transition (which
		// races zag's focus restore against our autofocus effect) needs the
		// deterministic fake-timer drain.
		renderEditor([makeField("a")]);

		await act(async () => {
			fireEvent.click(screen.getAllByLabelText(L.addField)[0]);
		});
		const option = await screen.findByTestId("type-option-text");

		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			(cb: FrameRequestCallback) =>
				setTimeout(() => cb(0), 0) as unknown as number,
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

		await act(async () => {
			fireEvent.click(option);
		});
		act(() => {
			vi.runAllTimers();
		});

		expect(screen.getByTestId("panel-name-input")).toHaveFocus();

		// rAF/cAF stubs are cleared by the file's afterEach (vi.unstubAllGlobals()).
		vi.useRealTimers();
	});

	it("owns the canvas's active tab: clicking a tab shows that tab's panel (lifted-state wiring)", async () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);

		// zag's Tabs machine transitions asynchronously — every other
		// tab-click assertion in this suite (sections/dnd/cards-canvas tests)
		// wraps the click in `await act(async () => …)` for the same reason;
		// a plain fireEvent.click leaves aria-selected stale even pre-migration.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});

		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByTestId("shell-b").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});

	it("every shell carries its own grip; selecting adds none (the toolbar grip is gone)", () => {
		renderEditor([makeField("a"), makeField("b")]);
		// Unselected shells already expose their handles (#41).
		expect(screen.getAllByLabelText(L.dragField)).toHaveLength(2);

		fireEvent.click(screen.getByTestId("shell-a"));
		// The selection toolbar is up (Edit proves it) but contributed NO
		// grip — pre-0.10 this whole screen had exactly ONE handle, the
		// selected toolbar's.
		expect(screen.getByLabelText(L.editField)).toBeInTheDocument();
		expect(screen.getAllByLabelText(L.dragField)).toHaveLength(2);
	});
});
