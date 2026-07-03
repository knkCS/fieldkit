import { Provider } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
