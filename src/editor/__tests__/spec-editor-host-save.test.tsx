// src/editor/__tests__/spec-editor-host-save.test.tsx
//
// fieldkit#315: a host that saves every changed tab from ONE Save in its page
// header (blueprinthub#153) hides the editor's own Save, reads the draft and
// its validation, and says "committed" by passing the saved content back as
// `schema`.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import type { SpecValidationResult } from "../../schema/validate-spec";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";

vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

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

/** A host page: its own header Save, gated on the editor's validation,
 * persisting the draft it was handed, then passing it back as `schema`. */
function HostPage({
	initial,
	persist,
	onDirtyChange,
}: {
	initial: Schema;
	persist: (schema: Schema) => Promise<void>;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const [committed, setCommitted] = useState(initial);
	const [pending, setPending] = useState<Schema | null>(null);
	const [validation, setValidation] = useState<SpecValidationResult | null>(
		null,
	);
	return (
		<EditorWrap>
			<button
				type="button"
				disabled={pending == null || !validation?.valid}
				onClick={async () => {
					if (pending == null) return;
					await persist(pending);
					setCommitted(pending);
				}}
			>
				Header save
			</button>
			<SpecEditor
				schema={committed}
				hideSave
				onDraftChange={setPending}
				onValidationChange={setValidation}
				onDirtyChange={onDirtyChange}
				plugins={testPlugins}
			/>
		</EditorWrap>
	);
}

function renderHost(initial: Schema) {
	const persist = vi.fn().mockResolvedValue(undefined);
	const onDirtyChange = vi.fn();
	render(
		<HostPage
			initial={initial}
			persist={persist}
			onDirtyChange={onDirtyChange}
		/>,
	);
	return { persist, onDirtyChange };
}

describe("SpecEditor — a host-owned Save (fieldkit#315)", () => {
	it("draws no Save of its own under hideSave; Discard stays", () => {
		renderHost([makeField("title", "Title")]);
		expect(
			screen.queryByRole("button", { name: L.save }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: L.discard })).toBeInTheDocument();
	});

	it("still draws its Save by default", () => {
		render(
			<EditorWrap>
				<SpecEditor
					schema={[makeField("title")]}
					onCommit={vi.fn()}
					plugins={testPlugins}
				/>
			</EditorWrap>,
		);
		expect(screen.getByRole("button", { name: L.save })).toBeInTheDocument();
	});

	it("the host saves the draft it was handed, and the editor reads clean again", async () => {
		const { persist, onDirtyChange } = renderHost([
			makeField("title", "Title"),
		]);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Headline" },
		});
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Header save" }));
		});

		expect(persist).toHaveBeenCalledTimes(1);
		expect((persist.mock.calls[0][0] as Schema)[0].config.name).toBe(
			"Headline",
		);
		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
		expect(screen.getByRole("button", { name: L.discard })).toBeDisabled();
	});

	it("the host's Save refuses while the draft has errors", () => {
		renderHost([makeField("title", "Title")]);

		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "" },
		});

		expect(screen.getByRole("button", { name: "Header save" })).toBeDisabled();
	});

	it("the auto-slug latch re-arms once the host has committed a new field", async () => {
		renderHost([makeField("title", "Title")]);

		// A duplicate is new in the draft: its accessor follows its name.
		fireEvent.click(screen.getByTestId("shell-title"));
		fireEvent.click(screen.getByLabelText(L.duplicateField));
		fireEvent.click(screen.getByTestId("shell-title_copy"));
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Subtitle" },
		});
		expect(screen.getByTestId("shell-subtitle")).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Header save" }));
		});

		// Committed now: a rename must not re-slug it away from its data.
		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Strapline" },
		});
		expect(screen.getByTestId("shell-subtitle")).toBeInTheDocument();
		expect(screen.queryByTestId("shell-strapline")).not.toBeInTheDocument();
	});
});
