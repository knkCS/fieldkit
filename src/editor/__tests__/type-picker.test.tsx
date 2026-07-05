// src/editor/__tests__/type-picker.test.tsx

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { TypePicker } from "../type-picker";

const noop = vi.fn();

const DummyIcon = () => <span data-testid="icon">icon</span>;

function makePlugin(
	overrides: Partial<FieldTypePlugin> & { id: string; name: string },
): FieldTypePlugin {
	return {
		description: `${overrides.name} description`,
		icon: DummyIcon,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => z.string(),
		...overrides,
	};
}

const textPlugin = makePlugin({ id: "text", name: "Text", category: "text" });
const numberPlugin = makePlugin({
	id: "number",
	name: "Number",
	category: "number",
});
const selectPlugin = makePlugin({
	id: "select",
	name: "Select",
	category: "selection",
});
const boolPlugin = makePlugin({
	id: "boolean",
	name: "Boolean",
	category: "boolean",
});

const allPlugins = [textPlugin, numberPlugin, selectPlugin, boolPlugin];

// Named distinctly from its category's Title-cased default heading ("Text")
// so the labels-focused tests below (which assert the heading itself) can't
// collide with a same-named plugin card — unlike textPlugin/numberPlugin/
// boolPlugin above, whose names happen to equal their own category's default
// label.
const plainTextPlugin = makePlugin({
	id: "plain-text",
	name: "PlainText",
	category: "text",
});
const plugins = [plainTextPlugin];

const maxOnePlugin = makePlugin({
	id: "max-one",
	name: "MaxOne",
	category: "text",
	maxPerSpec: 1,
});

/**
 * Finds the category-heading element carrying `text`, excluding any
 * type-option card — needed because a plugin's own name can coincide with
 * its category's Title-cased default heading (see plainTextPlugin's
 * comment above), which would otherwise make a plain screen.getByText(text)
 * ambiguous.
 */
function categoryHeading(text: string): HTMLElement {
	const match = screen
		.getAllByText(text)
		.find((el) => !el.closest('[data-testid^="type-option-"]'));
	if (!match) {
		throw new Error(`No category heading found for "${text}"`);
	}
	return match;
}

function fieldOfType(fieldType: string): Field {
	return {
		field_type: fieldType,
		config: {
			name: "Existing",
			api_accessor: "existing",
			required: false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};
}

describe("TypePicker", () => {
	it("renders all plugin types grouped by category", () => {
		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={allPlugins} onSelect={onSelect} />
			</ChakraProvider>,
		);

		// Plugin names — scoped to each card by testid: the Title-cased category
		// headings below (spec-mandated) happen to read identically to three of
		// these plugins' own names ("Text", "Number", "Boolean" are each both a
		// plugin name and its own category's default heading), so an unscoped
		// screen.getByText would match both and throw on ambiguity.
		expect(screen.getByTestId("type-option-text")).toHaveTextContent("Text");
		expect(screen.getByTestId("type-option-number")).toHaveTextContent(
			"Number",
		);
		expect(screen.getByTestId("type-option-select")).toHaveTextContent(
			"Select",
		);
		expect(screen.getByTestId("type-option-boolean")).toHaveTextContent(
			"Boolean",
		);

		// Category headers — Title-cased defaults (spec-mandated), not the raw
		// lowercase FieldTypeCategory enum values.
		expect(categoryHeading("Text")).toBeInTheDocument();
		expect(categoryHeading("Number")).toBeInTheDocument();
		expect(categoryHeading("Selection")).toBeInTheDocument();
		expect(categoryHeading("Boolean")).toBeInTheDocument();
	});

	it("filters by search text", () => {
		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={allPlugins} onSelect={onSelect} />
			</ChakraProvider>,
		);

		const searchInput = screen.getByPlaceholderText("Search field types...");
		fireEvent.change(searchInput, { target: { value: "num" } });

		// Scoped to the card (see the note in the test above): the "Number"
		// category heading reads identically to the plugin's own name.
		expect(screen.getByTestId("type-option-number")).toHaveTextContent(
			"Number",
		);
		expect(screen.queryByText("Text")).not.toBeInTheDocument();
		expect(screen.queryByText("Select")).not.toBeInTheDocument();
	});

	it("calls onSelect when a type is clicked", () => {
		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={allPlugins} onSelect={onSelect} />
			</ChakraProvider>,
		);

		fireEvent.click(screen.getByTestId("type-option-text"));
		expect(onSelect).toHaveBeenCalledWith("text");

		fireEvent.click(screen.getByTestId("type-option-number"));
		expect(onSelect).toHaveBeenCalledWith("number");
	});

	it("filters plugins by context", () => {
		const blueprintOnly = makePlugin({
			id: "bp",
			name: "BlueprintOnly",
			category: "text",
			availableIn: ["blueprint"],
		});
		const taskOnly = makePlugin({
			id: "task",
			name: "TaskOnly",
			category: "text",
			availableIn: ["task"],
		});
		const noRestriction = makePlugin({
			id: "any",
			name: "AnyContext",
			category: "text",
		});

		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={[blueprintOnly, taskOnly, noRestriction]}
					context="blueprint"
					onSelect={onSelect}
				/>
			</ChakraProvider>,
		);

		expect(screen.getByText("BlueprintOnly")).toBeInTheDocument();
		expect(screen.getByText("AnyContext")).toBeInTheDocument();
		expect(screen.queryByText("TaskOnly")).not.toBeInTheDocument();
	});

	it("disables types at maxPerSpec limit", () => {
		const limitedPlugin = makePlugin({
			id: "limited",
			name: "Limited",
			category: "text",
			maxPerSpec: 1,
		});

		const currentSpec: Field[] = [
			{
				field_type: "limited",
				config: {
					name: "Existing",
					api_accessor: "existing",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		];

		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={[limitedPlugin]}
					currentSpec={currentSpec}
					onSelect={onSelect}
				/>
			</ChakraProvider>,
		);

		const btn = screen.getByTestId("type-option-limited");
		expect(btn).toBeDisabled();

		fireEvent.click(btn);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("shows no matching message when search has no results", () => {
		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={allPlugins} onSelect={onSelect} />
			</ChakraProvider>,
		);

		const searchInput = screen.getByPlaceholderText("Search field types...");
		fireEvent.change(searchInput, { target: { value: "zzzzzzz" } });

		expect(screen.getByText("No matching field types")).toBeInTheDocument();
	});
});

describe("TypePicker labels", () => {
	it("renders custom labels: placeholder, aria-label, empty state, category heading", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={plugins}
					onSelect={noop}
					labels={{
						searchPlaceholder: "Feldtyp suchen…",
						searchLabel: "Feldtypsuche",
						noMatches: "Keine Treffer",
						categories: { text: "Texte" },
					}}
				/>
			</ChakraProvider>,
		);
		expect(screen.getByPlaceholderText("Feldtyp suchen…")).toBeInTheDocument();
		expect(screen.getByLabelText("Feldtypsuche")).toBeInTheDocument();
		expect(screen.getByText("Texte")).toBeInTheDocument(); // translated heading
		fireEvent.change(screen.getByLabelText("Feldtypsuche"), {
			target: { value: "zzz" },
		});
		expect(screen.getByText("Keine Treffer")).toBeInTheDocument();
	});

	it("Title-cases category headings by default", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={plugins} onSelect={noop} />
			</ChakraProvider>,
		);
		expect(screen.getByText("Text")).toBeInTheDocument();
		expect(screen.queryByText("text")).not.toBeInTheDocument();
	});

	it("at-max cards carry the interpolated maxReached explanation", () => {
		// maxOnePlugin: a fixture with maxPerSpec: 1; currentSpec containing one instance
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={[maxOnePlugin]}
					currentSpec={[fieldOfType(maxOnePlugin.id)]}
					onSelect={noop}
				/>
			</ChakraProvider>,
		);
		const card = screen.getByTestId(`type-option-${maxOnePlugin.id}`);
		expect(card).toBeDisabled();
		expect(card).toHaveAttribute("title", "Limit reached (max 1)");
	});
});
