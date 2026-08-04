import { Provider } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import { createReferencePlugin } from "../../../schema/field-types/reference";
import type { Field } from "../../../schema/types";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
} from "../../../test/fake-reference-adapter";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const attribute = (accessor: string, name: string): Field => ({
	field_type: "text",
	config: { name, api_accessor: accessor, required: false, instructions: "" },
	settings: null,
	children: null,
	system: false,
});

/** A Field that declares one Attribute — the case most of these tests want. */
const WITH_PAGE: ReferenceSettings = {
	blueprints: ["article"],
	attributes: [attribute("page", "Page")],
};

function referenceField(
	settings: ReferenceSettings = WITH_PAGE,
	fieldType = "reference",
): Field<ReferenceSettings> {
	return {
		field_type: fieldType,
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: false,
			instructions: "",
		},
		settings,
		children: null,
		system: false,
	};
}

function renderRead(
	values: Record<string, unknown>,
	field: Field<ReferenceSettings> = referenceField(),
	adapter: FakeReferenceAdapter = createFakeReferenceAdapter(),
	plugins = builtInFieldTypes,
) {
	// No FormProvider on purpose: read mode must not require a form.
	return render(
		<Provider>
			<FieldKitProvider plugins={plugins} adapters={{ reference: adapter }}>
				<SpecForm schema={[field as Field]} mode="read" values={values} />
			</FieldKitProvider>
		</Provider>,
	);
}

describe("SpecForm — read mode, reference tree", () => {
	it("bypasses the count cell and renders the tree", async () => {
		renderRead({ related: [{ id: "article-1" }, { id: "article-2" }] });

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Dogs of the world")).toBeInTheDocument();
		// The table cell's answer — a count — must not be what read mode shows.
		expect(screen.queryByText("2 references")).not.toBeInTheDocument();
	});

	it("resolves each Content's current name through the Adapter", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-1", "Cats of the whole world");

		renderRead({ related: [{ id: "article-1" }] }, referenceField(), adapter);

		expect(
			await screen.findByText("Cats of the whole world"),
		).toBeInTheDocument();
	});

	it("keeps the id of a Content it cannot resolve on screen", async () => {
		renderRead({ related: [{ id: "deleted-42" }] });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
	});

	it("makes the nesting visible", async () => {
		renderRead({
			related: [
				{
					id: "article-1",
					children: [{ id: "article-2", children: [{ id: "article-3" }] }],
				},
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows.map((row) => row.getAttribute("data-depth"))).toEqual([
			"0",
			"1",
			"2",
		]);
	});

	it("shows every Reference in the tree, nested ones included", async () => {
		renderRead({
			related: [{ id: "article-1", children: [{ id: "author-1" }] }],
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	});

	it("shows each Reference's Attribute values against it", async () => {
		renderRead({
			related: [
				{ id: "article-1", attributes: { page: "12" } },
				{ id: "article-2", attributes: { page: "88" } },
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[0]).toHaveTextContent("Page");
		expect(rows[0]).toHaveTextContent("12");
		expect(rows[1]).toHaveTextContent("88");
		// Each value sits under the Reference it belongs to, not pooled.
		expect(rows[0]).not.toHaveTextContent("88");
	});

	it("shows a nested Reference's Attributes on the nested Reference", async () => {
		renderRead({
			related: [
				{
					id: "article-1",
					attributes: { page: "12" },
					children: [{ id: "article-2", attributes: { page: "88" } }],
				},
			],
		});

		await screen.findByText("Cats of the world");
		const rows = screen.getAllByTestId("reference-read-row");
		expect(rows[1]).toHaveTextContent("Dogs of the world");
		expect(rows[1]).toHaveTextContent("88");
	});

	it("renders an em dash for an Attribute nobody filled in", async () => {
		renderRead({ related: [{ id: "article-1" }] });

		await screen.findByText("Cats of the world");
		expect(screen.getByTestId("reference-read-row")).toHaveTextContent("—");
	});

	it("renders no Attribute rows when the Field declares none", async () => {
		renderRead(
			{ related: [{ id: "article-1", attributes: { page: "12" } }] },
			referenceField({ blueprints: ["article"] }),
		);

		await screen.findByText("Cats of the world");
		expect(screen.queryByText("Page")).not.toBeInTheDocument();
		expect(screen.queryByText("12")).not.toBeInTheDocument();
	});

	it("renders an em dash for an empty tree", () => {
		renderRead({ related: [] });

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders an em dash for a value that is not a Reference Tree", () => {
		renderRead({ related: "article-1" });

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("gives a Consumer's own reference-shaped type the same read mode", async () => {
		// The read component travels with the plugin, so a type minted by
		// `createReferencePlugin` cannot drift from `reference` — which a
		// `field_type === "reference"` check in shared machinery could never
		// have managed (ADR-0010).
		const tocReference = createReferencePlugin({
			id: "toc_reference",
			name: "TOC Reference",
		});

		renderRead(
			{ related: [{ id: "article-1" }] },
			referenceField({ blueprints: ["article"] }, "toc_reference"),
			createFakeReferenceAdapter(),
			[...builtInFieldTypes, tocReference],
		);

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByText("1 reference")).not.toBeInTheDocument();
	});
});

describe("SpecForm — read mode, reference tree with Attributes", () => {
	it("labels each Attribute with its Field's name", async () => {
		renderRead(
			{ related: [{ id: "article-1", attributes: { role: "Author" } }] },
			referenceField({
				blueprints: ["article"],
				attributes: [attribute("role", "Role")],
			}),
		);

		await screen.findByText("Cats of the world");
		expect(screen.getByText("Role")).toBeInTheDocument();
		expect(screen.getByText("Author")).toBeInTheDocument();
	});
});
