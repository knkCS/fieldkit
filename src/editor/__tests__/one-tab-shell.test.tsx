// One tab shell lays out the Tabs for the form, read mode and the Blueprint
// editor's canvas (ADR-0030, fieldkit#416). Everything here goes through the
// public components: SpecEditor (canvas and "Try it") and SpecForm.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wrapper } from "../../renderer/spec-form/__tests__/helpers";
import { SpecForm } from "../../renderer/spec-form/spec-form";
import type { Field, Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";

function makeSection(
	accessor: string,
	name: string,
	orientation?: "horizontal" | "vertical",
): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: orientation ? { orientation } : {},
		system: false,
	};
}

const vertical: Schema = [
	makeSection("s1", "General", "vertical"),
	makeField("a", "Alpha"),
	makeSection("s2", "Details"),
	makeField("b", "Beta"),
];

const horizontal: Schema = [
	makeSection("s1", "General"),
	makeField("a", "Alpha"),
	makeSection("s2", "Details"),
	makeField("b", "Beta"),
];

function renderEditor(schema: Schema) {
	return render(
		<EditorWrap>
			<SpecEditor schema={schema} onCommit={vi.fn()} plugins={testPlugins} />
		</EditorWrap>,
	);
}

const search = () => screen.getByRole("combobox");
const tablist = () => screen.getByRole("tablist");
const precedes = (a: Element, b: Element) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
/** Chakra's Tabs.Root, the element the Tab list must sit in directly. */
const tabsRoot = (el: Element) =>
	el.closest('[data-scope="tabs"][data-part="root"]');

describe("one tab shell — the Blueprint editor's canvas", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("puts the field search above a vertical Tab list aligned to the top", () => {
		renderEditor(vertical);

		const list = tablist();
		expect(list).toHaveAttribute("aria-orientation", "vertical");
		expect(precedes(search(), list)).toBe(true);
		// The search spans the column above the Tabs, not a row item beside
		// them inside the vertical (row-flex) Tabs.Root.
		expect(tabsRoot(search())).toBeNull();
		// The list is a direct child of Tabs.Root — a column beside the Tab's
		// fields, not squeezed into a centered header row.
		expect(list.parentElement).toBe(tabsRoot(list));
	});

	it("keeps a horizontal Spec's Tab list across the top, the search at its end", () => {
		renderEditor(horizontal);

		const list = tablist();
		expect(list).toHaveAttribute("aria-orientation", "horizontal");
		expect(precedes(list, search())).toBe(true);
		expect(tabsRoot(search())).toBe(tabsRoot(list));
	});

	it("falls back to horizontal in a container too narrow for vertical", () => {
		let report:
			| ((entries: { contentRect: { width: number } }[]) => void)
			| null = null;
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(cb: typeof report) {
					report = cb;
				}
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		renderEditor(vertical);
		expect(tablist()).toHaveAttribute("aria-orientation", "vertical");

		act(() => report?.([{ contentRect: { width: 400 } }]));
		expect(tablist()).toHaveAttribute("aria-orientation", "horizontal");
	});

	it("still offers the Section menu and the drop zones through the shell", async () => {
		renderEditor(vertical);
		const list = tablist();
		expect(
			list.querySelector('[aria-label="Section menu: General"]'),
		).not.toBeNull();
		expect(list.querySelectorAll('[data-testid^="tabdrop-"]').length).toBe(2);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /Details/ }));
		});
		expect(screen.getByRole("tab", { name: /Details/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});

describe("one tab shell — every surface", () => {
	it("renders the canvas through the shared shell", () => {
		renderEditor(vertical);
		expect(screen.getByTestId("tab-shell")).toContainElement(tablist());
	});

	it('renders "Try it" through the shared shell', async () => {
		renderEditor(vertical);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
		});
		const list = tablist();
		expect(list).toHaveAttribute("aria-orientation", "vertical");
		expect(screen.getByTestId("tab-shell")).toContainElement(list);
	});

	it("renders the form and read mode through the shared shell", () => {
		const { unmount } = render(
			<Wrapper>
				<SpecForm schema={vertical} />
			</Wrapper>,
		);
		expect(screen.getByTestId("tab-shell")).toContainElement(tablist());
		unmount();

		render(
			<EditorWrap>
				<SpecForm schema={vertical} mode="read" values={{ a: "x" }} />
			</EditorWrap>,
		);
		expect(screen.getByTestId("tab-shell")).toContainElement(tablist());
	});
});
