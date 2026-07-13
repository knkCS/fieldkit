import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import { EditorWrap, makeCard, makeField, testPlugins } from "./editor-helpers";

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

// Menu items select via keyboard (Home/End/arrows + Enter) — jsdom has no
// PointerEvent hover; see sections.test.tsx for the established pattern.
// Card menu order is fixed: Rename, Delete card, Delete card and fields.
async function selectCardMenuItem(item: "rename" | "merge" | "with-fields") {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: item === "with-fields" ? "End" : "Home" });
	});
	if (item === "merge") {
		await act(async () => {
			fireEvent.keyDown(menu, { key: "ArrowDown" });
		});
	}
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

function renderEditor(schema: Schema) {
	return render(
		<EditorWrap>
			<SpecEditor schema={schema} onCommit={vi.fn()} plugins={testPlugins} />
		</EditorWrap>,
	);
}

describe("SpecEditor — card menu, panel, validation surfacing", () => {
	it("header select opens the panel on the card's Name; typing renames the header live", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a")]);

		await act(async () => {
			fireEvent.click(screen.getByTestId("card-header-c1"));
		});

		const panel = screen.getByTestId("field-config-panel");
		const nameInput = within(panel).getByTestId("panel-card-name-input");
		expect(nameInput).toHaveValue("Basics");
		// A card's ONLY setting is its name: no accessor/validation controls.
		expect(
			within(panel).queryByTestId("panel-accessor-input"),
		).not.toBeInTheDocument();

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: "Meta" } });
		});
		expect(
			within(screen.getByTestId("card-header-c1")).getByText("Meta"),
		).toBeInTheDocument();
	});

	it("⋯ Rename opens the panel's Name input", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a")]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Basics"));
		});
		await selectCardMenuItem("rename");

		expect(
			within(screen.getByTestId("field-config-panel")).getByTestId(
				"panel-card-name-input",
			),
		).toHaveValue("Basics");
	});

	it("Delete card merges its fields into the previous card", async () => {
		renderEditor([
			makeCard("c1", "One"),
			makeField("a"),
			makeCard("c2", "Two"),
			makeField("b"),
		]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Two"));
		});
		await selectCardMenuItem("merge");

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(1);
		expect(within(frames[0]).getByTestId("shell-a")).toBeInTheDocument();
		expect(within(frames[0]).getByTestId("shell-b")).toBeInTheDocument();
	});

	it("Delete card and fields destroys the block after the confirm dialog", async () => {
		renderEditor([
			makeCard("c1", "One"),
			makeField("a"),
			makeCard("c2", "Two"),
			makeField("b"),
		]);

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Card menu: Two"));
		});
		await selectCardMenuItem("with-fields");

		const confirmButton = await screen.findByRole("button", {
			name: "Confirm",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		expect(screen.queryByTestId("shell-b")).not.toBeInTheDocument();
		expect(screen.getByTestId("shell-a")).toBeInTheDocument();
		expect(screen.getAllByTestId(/^card-frame-/)).toHaveLength(1);
	});

	it("hand-written loose fields in a carded tab outline invalid and disable Preview", () => {
		renderEditor([makeField("a"), makeCard("c1", "One"), makeField("b")]);

		expect(screen.getByTestId("shell-a")).toHaveAttribute(
			"data-invalid",
			"true",
		);
		expect(screen.getByRole("radio", { name: "Preview" })).toBeDisabled();
	});

	it("Try-it smoke: a carded draft renders as a real form with card headings", async () => {
		renderEditor([makeCard("c1", "Basics"), makeField("a", "Alpha")]);

		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
		});

		const form = screen.getByTestId("try-it-form");
		expect(
			within(form).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(form).getByTestId("field-a")).toBeInTheDocument();
	});
});
