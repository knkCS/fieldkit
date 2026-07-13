// src/editor/__tests__/editor-toolbar.test.tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker Menu/Tooltip/Popover positioning needs ResizeObserver and
// IntersectionObserver — both unimplemented in jsdom (cards-editor.test.tsx
// rationale; the panel opens after "+ Card").
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const L = DEFAULT_EDITOR_LABELS;

function renderEditor(schema: Schema, title?: ReactNode) {
	return render(
		<EditorWrap>
			<SpecEditor
				schema={schema}
				onCommit={vi.fn()}
				plugins={testPlugins}
				title={title}
			/>
		</EditorWrap>,
	);
}

/** Queries scoped to the bar — the toolbar is the single insertion source,
 * pinned by tests that verify exact button counts document-wide. */
function toolbar() {
	return within(screen.getByTestId("editor-toolbar"));
}

describe("SpecEditor — unified toolbar (A2)", () => {
	it("renders ONE bar: inserts left; dirty-dot, mode control, Discard, Save right", () => {
		renderEditor([makeField("a")]);
		const bar = toolbar();
		expect(bar.getByRole("button", { name: L.addCard })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.addSection })).toBeInTheDocument();
		expect(bar.getByRole("radio", { name: L.build })).toBeChecked();
		expect(bar.getByRole("radio", { name: L.tryIt })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.discard })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.save })).toBeInTheDocument();
	});

	it('the Preview segment uses the renamed DEFAULT string (key still "tryIt")', () => {
		renderEditor([makeField("a")]);
		expect(L.tryIt).toBe("Preview");
		expect(
			toolbar().getByRole("radio", { name: "Preview" }),
		).toBeInTheDocument();
	});

	it("Preview mode DISABLES the insert buttons without hiding them (bar keeps its shape)", async () => {
		renderEditor([makeField("a")]);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		});
		const bar = toolbar();
		expect(bar.getByRole("button", { name: L.addCard })).toBeDisabled();
		expect(bar.getByRole("button", { name: L.addSection })).toBeDisabled();

		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.build }));
		});
		expect(bar.getByRole("button", { name: L.addCard })).not.toBeDisabled();
		expect(bar.getByRole("button", { name: L.addSection })).not.toBeDisabled();
	});

	it("empty spec: + Card is disabled (tooltip-wrapped) while + Section stays enabled", () => {
		renderEditor([]);
		expect(toolbar().getByRole("button", { name: L.addCard })).toBeDisabled();
		expect(
			toolbar().getByRole("button", { name: L.addSection }),
		).not.toBeDisabled();
	});

	it("+ Card inserts into the ACTIVE NON-FIRST tab (pins the lifted tab state)", async () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addCard }));
		});

		// Auto-wrap for "b" + the new empty card — BOTH inside the SEO panel.
		// A toolbar hard-coding tab 0 would have carded "a" instead: this is
		// the failure the spec's Testing section demands be discriminating.
		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2);
		const seoPanel = screen.getByTestId("shell-b").closest("[role='tabpanel']");
		for (const frame of frames) {
			expect(frame.closest("[role='tabpanel']")).toBe(seoPanel);
		}
		expect(
			screen.getByTestId("shell-a").closest("[data-testid^='card-frame-']"),
		).toBeNull();
	});

	it("+ Card auto-wraps loose fields, appends an empty card, and opens it in the panel", async () => {
		renderEditor([makeField("a"), makeField("b")]);
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addCard }));
		});

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2);
		expect(within(frames[0]).getByTestId("shell-a")).toBeInTheDocument();
		expect(within(frames[0]).getByTestId("shell-b")).toBeInTheDocument();
		expect(within(frames[1]).queryAllByTestId(/^shell-/)).toEqual([]);
		// Both markers untitled → italic placeholder in each frame header.
		// Scoped to the frames themselves (rather than a document-wide
		// getAllByText) because the config panel — open on the new card,
		// asserted below — renders that SAME placeholder a third time as its
		// own heading; that's correct, not a frame-header duplicate.
		for (const frame of frames) {
			expect(within(frame).getByText(L.cardUntitled)).toBeInTheDocument();
		}
		// The NEW card (not the wrap) is selected: the panel opens on its
		// (empty) Name input — insertCard's last-marker contract via onEdit.
		const nameInput = screen.getByTestId("panel-card-name-input");
		expect(nameInput).toHaveValue("");
		// Discriminate which card is selected by typing a distinctive title.
		// If the wrap card were selected, this would land on the first frame;
		// we assert it lands on the last frame instead.
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: "New One" } });
		});
		expect(within(frames[0]).getByText(L.cardUntitled)).toBeInTheDocument();
		expect(within(frames[1]).getByText("New One")).toBeInTheDocument();
	});

	it("+ Section appends a tab and opens its inline rename input (pulse across the toolbar boundary)", async () => {
		renderEditor([makeField("a")]);
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addSection }));
		});

		const input = screen.getByDisplayValue(L.newSectionName);
		fireEvent.change(input, { target: { value: "Details" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByRole("tab", { name: /Details/ })).toBeInTheDocument();
	});

	it("title renders on its own line ABOVE the toolbar, never inside it", () => {
		renderEditor([makeField("a")], <h2>Article spec</h2>);
		const heading = screen.getByRole("heading", { name: "Article spec" });
		const bar = screen.getByTestId("editor-toolbar");
		expect(bar.contains(heading)).toBe(false);
		expect(
			heading.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("the old floating canvas row is GONE: inserts render only in the toolbar", () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);
		const bar = screen.getByTestId("editor-toolbar");
		for (const label of [L.addCard, L.addSection]) {
			const hits = screen.getAllByText(label);
			expect(hits).toHaveLength(1);
			expect(bar.contains(hits[0])).toBe(true);
		}
	});

	it("sectionless schema: inserts exist exactly once DOCUMENT-WIDE, inside the toolbar", () => {
		// Screen-level counts (not bar-scoped) — a reintroduced floating row in
		// the sectionless canvas branch must fail this; same idiom as the
		// sectioned depth-pin above.
		renderEditor([makeField("a"), makeField("b")]);
		const bar = screen.getByTestId("editor-toolbar");
		for (const label of [L.addCard, L.addSection]) {
			const hits = screen.getAllByText(label);
			expect(hits).toHaveLength(1);
			expect(bar.contains(hits[0])).toBe(true);
		}
	});

	it("empty spec: exactly ONE + Section anywhere (the empty-state ghost button is gone too) and it works", async () => {
		renderEditor([]);
		// getByText throws on >1 match — fails while the canvas empty state
		// still renders its own "+ Section".
		await act(async () => {
			fireEvent.click(screen.getByText(L.addSection));
		});
		expect(screen.getByDisplayValue(L.newSectionName)).toBeInTheDocument();
	});
});
