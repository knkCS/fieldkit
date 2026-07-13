import { Provider } from "@knkcs/anker/primitives";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { partitionSchemaBySections } from "../../../schema/partition";
import { FieldKitProvider } from "../../provider";
import { buildSearchIndex } from "../search-index";
import { SpecForm } from "../spec-form";
import { makeCard, makeField, makeSection, testPlugins } from "./helpers";

function renderRead(ui: React.ReactElement) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider plugins={testPlugins}>{ui}</FieldKitProvider>
		</Provider>,
	);
}

const cardedSchema = [
	makeCard("c1", "Basics"),
	makeField("title", "Title"),
	makeCard("c2"), // untitled
	makeField("notes", "Notes"),
];

describe("SpecForm — carded read mode", () => {
	it("renders the same card boxes with description-list rows inside", () => {
		renderRead(
			<SpecForm
				schema={cardedSchema}
				mode="read"
				values={{ title: "Hello", notes: "World" }}
			/>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(
			within(surfaces[0]).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(surfaces[0]).getByText("Title")).toBeInTheDocument();
		expect(within(surfaces[0]).getByText("Hello")).toBeInTheDocument();
		expect(within(surfaces[1]).getByText("World")).toBeInTheDocument();
		expect(within(surfaces[1]).queryByRole("heading")).not.toBeInTheDocument();
	});

	// Final-review fix wave (Fix 2): same trim gap as edit mode's CardedFields
	// — assert on textContent since getByRole's accessible-name computation
	// normalizes whitespace and would mask an untrimmed heading.
	it("renders a whitespace-padded card title trimmed", () => {
		renderRead(
			<SpecForm
				schema={[makeCard("c1", "  Basics  "), makeField("a")]}
				mode="read"
				values={{}}
			/>,
		);
		const heading = screen.getByRole("heading", { name: "Basics" });
		expect(heading.textContent).toBe("Basics");
	});

	it("card markers add no label/value row of their own", () => {
		renderRead(<SpecForm schema={cardedSchema} mode="read" values={{}} />);
		// "Basics" appears exactly once: as the card heading, never as a row
		// label with an em-dash value.
		expect(screen.getAllByText("Basics")).toHaveLength(1);
		// Only the two real fields render empty-value em dashes.
		expect(screen.getAllByText("—")).toHaveLength(2);
	});

	it("degrades gracefully in read mode: leading loose fields render in an implicit card", () => {
		renderRead(
			<SpecForm
				schema={[
					makeField("loose", "Loose"),
					makeCard("c1", "Extra"),
					makeField("b", "B"),
				]}
				mode="read"
				values={{ loose: "kept" }}
			/>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(within(surfaces[0]).getByText("kept")).toBeInTheDocument();
		expect(within(surfaces[0]).queryByRole("heading")).not.toBeInTheDocument();
	});

	it("card-less read schemas render exactly as today", () => {
		renderRead(
			<SpecForm
				schema={[makeField("a", "Alpha")]}
				mode="read"
				values={{ a: "1" }}
			/>,
		);
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
	});

	it("keeps tabs + cards together in read mode without a FormProvider", () => {
		renderRead(
			<SpecForm
				schema={[
					makeField("a", "Alpha"),
					makeSection("s1", "SEO"),
					...cardedSchema,
				]}
				mode="read"
				values={{}}
			/>,
		);
		expect(screen.getAllByRole("tab")).toHaveLength(2);
		expect(screen.getAllByTestId("card-surface")).toHaveLength(2);
	});
});

describe("buildSearchIndex — card markers", () => {
	it("never surfaces card markers as search results", () => {
		const tabs = partitionSchemaBySections([
			makeCard("c1", "Basics"),
			makeField("a", "Alpha"),
			makeSection("s1", "SEO"),
			makeCard("c2", "Meta"),
			makeField("b", "Beta"),
		]).tabs;
		const index = buildSearchIndex(tabs, "General");
		expect(index.map((r) => r.accessor)).toEqual(["a", "b"]);
		// The editor's includeHidden variant excludes them too.
		const editorIndex = buildSearchIndex(tabs, "General", {
			includeHidden: true,
		});
		expect(editorIndex.map((r) => r.accessor)).toEqual(["a", "b"]);
	});
});
