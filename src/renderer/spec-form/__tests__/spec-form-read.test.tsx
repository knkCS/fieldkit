import { Provider } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldsetPlugin } from "../../../schema/field-types/fieldset";
import { groupPlugin } from "../../../schema/field-types/group";
import { listPlugin } from "../../../schema/field-types/list";
import type { FieldTypePlugin } from "../../../schema/plugin";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import type { SpecFormLabels } from "../spec-form";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, testPlugins, Wrapper } from "./helpers";

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

const fieldset: Field = {
	field_type: "fieldset",
	config: {
		name: "Address",
		api_accessor: "address",
		required: false,
		instructions: "",
	},
	settings: { blueprint: "address_bp" },
	children: null,
	system: false,
};

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
		// The real plugin, not a stub: read mode's bypass now travels with the
		// plugin as its `readComponent` (ADR-0007) rather than being a
		// `field_type === "group"` branch in shared machinery, so a stub
		// registered under the id would prove nothing about production. The
		// group plugin ships a cellComponent (GroupCell → CountCell, "N items")
		// for table density; read mode must show the per-item rows instead.
		const groupPlugins = [...testPlugins, groupPlugin];
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

	it("renders a list's entries through the real list plugin", () => {
		// The whole built-in plugin, not a stub: this is the only place the
		// "renders in read mode" half of #49 is observable end to end.
		const listField: Field = {
			field_type: "list",
			config: {
				name: "Keywords",
				api_accessor: "keywords",
				required: false,
				instructions: "",
			},
			settings: {},
			children: null,
			system: false,
		};
		render(
			<Provider>
				<FieldKitProvider plugins={[...testPlugins, listPlugin]}>
					<SpecForm
						schema={[listField]}
						mode="read"
						values={{ keywords: ["typography", "bookbinding"] }}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		expect(screen.getByText("Keywords")).toBeInTheDocument();
		expect(screen.getByText("typography, bookbinding")).toBeInTheDocument();
	});

	it("renders an empty list as the empty dash", () => {
		const listField: Field = {
			field_type: "list",
			config: {
				name: "Keywords",
				api_accessor: "keywords",
				required: false,
				instructions: "",
			},
			settings: {},
			children: null,
			system: false,
		};
		render(
			<Provider>
				<FieldKitProvider plugins={[...testPlugins, listPlugin]}>
					<SpecForm
						schema={[listField]}
						mode="read"
						values={{ keywords: [] }}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders a fieldset's record through the real fieldset plugin", () => {
		// As with the list above: the whole built-in plugin, because read mode
		// is the other half of #50's "renders something meaningful" — and it
		// runs with no blueprint adapter in sight, since read mode reads the
		// stored value rather than resolving the blueprint.
		render(
			<Provider>
				<FieldKitProvider plugins={[...testPlugins, fieldsetPlugin]}>
					<SpecForm
						schema={[fieldset]}
						mode="read"
						values={{ address: { street: "12 Bridge Lane", city: "Ely" } }}
					/>
				</FieldKitProvider>
			</Provider>,
		);
		expect(screen.getByText("Address")).toBeInTheDocument();
		expect(screen.getByText("12 Bridge Lane, Ely")).toBeInTheDocument();
	});

	it("renders an empty fieldset record as the empty dash", () => {
		render(
			<Provider>
				<FieldKitProvider plugins={[...testPlugins, fieldsetPlugin]}>
					<SpecForm schema={[fieldset]} mode="read" values={{ address: {} }} />
				</FieldKitProvider>
			</Provider>,
		);
		expect(screen.getByText("—")).toBeInTheDocument();
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

// A plugin with NO cellComponent: read mode must fall back to
// type-aware formatting, not raw String(value).
const rawPlugin: FieldTypePlugin = {
	id: "raw",
	name: "Raw",
	description: "",
	icon: () => null,
	category: "text",
	fieldComponent: () => null,
	toZodType: () => z.unknown(),
};

function rawField(accessor: string): Field {
	return {
		field_type: "raw",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

describe("read mode — cell-less fallback formatting", () => {
	function renderRaw(value: unknown, labels?: SpecFormLabels) {
		render(
			<Wrapper extraPlugins={[rawPlugin]}>
				<SpecForm
					schema={[rawField("x")]}
					mode="read"
					values={{ x: value }}
					labels={labels}
				/>
			</Wrapper>,
		);
	}

	it("renders booleans via the translatable labels", () => {
		renderRaw(true);
		expect(screen.getByText("Yes")).toBeInTheDocument();
	});

	it("boolean false renders No (not the empty dash, not 'false')", () => {
		renderRaw(false);
		expect(screen.getByText("No")).toBeInTheDocument();
		expect(screen.queryByText("false")).toBeNull();
	});

	it("labels override the boolean strings", () => {
		renderRaw(true, { booleanYes: "Ja", booleanNo: "Nein" });
		expect(screen.getByText("Ja")).toBeInTheDocument();
	});

	it("labels override the false branch too", () => {
		renderRaw(false, { booleanYes: "Ja", booleanNo: "Nein" });
		expect(screen.getByText("Nein")).toBeInTheDocument();
	});

	it("joins primitive arrays with a comma separator", () => {
		renderRaw(["a", 2, true]);
		expect(screen.getByText("a, 2, Yes")).toBeInTheDocument();
	});

	it("renders objects and object-arrays as the empty dash", () => {
		renderRaw({ nested: 1 });
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders an ARRAY of objects as the empty dash (non-primitive branch)", () => {
		renderRaw([{ a: 1 }]);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("passes strings and numbers through unchanged", () => {
		renderRaw("plain");
		expect(screen.getByText("plain")).toBeInTheDocument();
	});
});
