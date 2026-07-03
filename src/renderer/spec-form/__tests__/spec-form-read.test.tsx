import { Provider } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, testPlugins } from "./helpers";

function renderRead(ui: React.ReactElement) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider plugins={testPlugins}>{ui}</FieldKitProvider>
		</Provider>,
	);
}

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm — read mode", () => {
	it("renders label/value rows without form controls", () => {
		renderRead(
			<SpecForm schema={schema} mode="read" values={{ title: "Hello" }} />,
		);
		expect(screen.getByText("Title")).toBeInTheDocument();
		expect(screen.getByText("Hello")).toBeInTheDocument();
		expect(screen.queryByTestId("field-title")).not.toBeInTheDocument();
	});

	it("renders an em dash for empty values", () => {
		renderRead(<SpecForm schema={schema} mode="read" values={{}} />);
		expect(screen.getAllByText("—").length).toBeGreaterThan(0);
	});

	it("keeps tabs in read mode", () => {
		renderRead(<SpecForm schema={schema} mode="read" values={{}} />);
		expect(screen.getAllByRole("tab")).toHaveLength(2);
	});

	it("renders a flat DescriptionList for sectionless schemas", () => {
		renderRead(
			<SpecForm
				schema={[makeField("a", "Alpha")]}
				mode="read"
				values={{ a: "1" }}
			/>,
		);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
	});

	it("renders group items as per-item rows, not the group's cell component", () => {
		// Mirrors production: the group plugin ships a cellComponent (GroupCell →
		// CountCell, "N items") for table density. Read mode must bypass it and
		// show the actual per-item rows instead.
		const groupPlugins = [
			...testPlugins,
			{
				id: "group",
				name: "Group",
				description: "",
				icon: () => null,
				category: "structural" as const,
				fieldComponent: () => null,
				cellComponent: ({ value }: { value: unknown }) => (
					<span>{Array.isArray(value) ? value.length : 0} items</span>
				),
				toZodType: () => z.array(z.record(z.unknown())),
			},
		];
		const hiddenChild = makeField("secret", "Secret");
		hiddenChild.config.hidden = true;
		const groupField: Field = {
			field_type: "group",
			config: {
				name: "Authors",
				api_accessor: "authors",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [makeField("name", "Name"), hiddenChild],
			system: false,
		};
		render(
			<Provider>
				<FieldKitProvider plugins={groupPlugins}>
					<SpecForm
						schema={[groupField]}
						mode="read"
						values={{
							authors: [
								{ name: "One", secret: "s1" },
								{ name: "Two", secret: "s2" },
							],
						}}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		// (a) per-item DescriptionLists: each item's child label + value appear.
		expect(screen.getAllByText("Name")).toHaveLength(2);
		expect(screen.getByText("One")).toBeInTheDocument();
		expect(screen.getByText("Two")).toBeInTheDocument();
		// (b) the group's cell component is bypassed.
		expect(screen.queryByText("2 items")).not.toBeInTheDocument();
		// (c) hidden children are excluded from per-item rows.
		expect(screen.queryByText("Secret")).not.toBeInTheDocument();
		expect(screen.queryByText("s1")).not.toBeInTheDocument();
	});

	it("uses the plugin cell component when available", () => {
		const pluginsWithCell = testPlugins.map((p) =>
			p.id === "text"
				? {
						...p,
						cellComponent: ({ value }: { value: unknown }) => (
							<span data-testid="cell">{String(value)}!</span>
						),
					}
				: p,
		);
		render(
			<Provider>
				<FieldKitProvider plugins={pluginsWithCell}>
					<SpecForm schema={schema} mode="read" values={{ title: "Hi" }} />
				</FieldKitProvider>
			</Provider>,
		);
		expect(screen.getByTestId("cell").textContent).toBe("Hi!");
	});
});
