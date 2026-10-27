// src/editor/__tests__/blueprint-purposes.test.tsx
//
// ADR-0027, amended: the `blueprint` Adapter declares the purposes it serves,
// and what it does not serve is hidden at purpose granularity — a type, or a
// setting inside a type. Driven through SpecEditor with the real plugins and
// the Adapter taskhub registers (`purposes: ["reference_target"]`): reference
// types with targets and an embedded Reference Spec only, no Fieldset, a
// Virtual Table with an embedded Row Spec only. A stored setting of a hidden
// purpose stays readable. An Adapter declaring no `purposes` is covered by
// unservable-types.test.tsx and blueprint-picker.test.tsx, unchanged.
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
	BlueprintPurpose,
	FieldKitAdapters,
} from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field, Schema } from "../../schema/types";
import {
	createFakePickerSource,
	fakeBlueprintAdapter,
} from "../../test/fake-picker-adapters";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";

const L = DEFAULT_EDITOR_LABELS;
const plugins = builtInFieldTypes;

function scopedAdapters(purposes: readonly BlueprintPurpose[]) {
	const source = createFakePickerSource({
		choices: [
			{ id: "bp_article", name: "Article" },
			{ id: "bp_person", name: "Person" },
		],
	});
	const adapters: FieldKitAdapters = {
		blueprint: { ...fakeBlueprintAdapter(source), purposes },
	};
	return { source, adapters };
}

function config(name: string, api_accessor: string): Field["config"] {
	return { name, api_accessor, required: false, instructions: "" };
}

const textField: Field = {
	field_type: "text",
	config: config("Title", "title"),
	settings: null,
	system: false,
};

function renderEditor(schema: Schema, adapters: FieldKitAdapters) {
	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={plugins} adapters={adapters}>
				<SpecEditor schema={schema} onCommit={vi.fn()} plugins={plugins} />
			</FieldKitProvider>
		</ChakraProvider>,
	);
}

async function openTypeSettings(accessor: string) {
	const user = userEvent.setup();
	await user.click(screen.getByTestId(`shell-${accessor}`));
	await user.click(screen.getByText(L.panelTabType));
	return user;
}

const offered = (id: string) => screen.queryByTestId(`type-option-${id}`);

function referenceField(
	type: "reference" | "single_reference",
	entry: { blueprint: string; spec_blueprint?: string },
): Field {
	return {
		field_type: type,
		config: config("Related", "related"),
		settings: { blueprints: [entry], pin_mode: "none" },
		children: null,
		system: false,
	};
}

describe("purposes: ['reference_target'] — the type picker", () => {
	it("offers the reference types and a Virtual Table, never a Fieldset", async () => {
		renderEditor([textField], scopedAdapters(["reference_target"]).adapters);
		await act(async () => {
			fireEvent.click(screen.getAllByLabelText(L.addField)[0]);
		});
		await screen.findByTestId("type-option-text");

		expect(offered("reference")).not.toBeNull();
		expect(offered("single_reference")).not.toBeNull();
		expect(offered("virtual_table")).not.toBeNull();
		expect(offered("fieldset")).toBeNull();
	});

	it("hides the reference types where reference targets are not served", async () => {
		renderEditor(
			[textField],
			scopedAdapters(["fieldset", "row_spec"]).adapters,
		);
		await act(async () => {
			fireEvent.click(screen.getAllByLabelText(L.addField)[0]);
		});
		await screen.findByTestId("type-option-text");

		expect(offered("reference")).toBeNull();
		expect(offered("single_reference")).toBeNull();
		expect(offered("fieldset")).not.toBeNull();
	});
});

describe.each([
	["reference", "reference-blueprints"],
	["single_reference", "single-reference-blueprints"],
] as const)("purposes: ['reference_target'] — a %s's settings", (type, testId) => {
	it("offers the targets picker and the embedded Reference Spec, no linked one", async () => {
		const { adapters, source } = scopedAdapters(["reference_target"]);
		renderEditor([referenceField(type, { blueprint: "bp_article" })], adapters);
		const user = await openTypeSettings("related");

		expect(screen.getByTestId(testId)).toBeInTheDocument();
		expect(screen.getByTestId("reference-spec-editor")).toBeInTheDocument();
		// Hidden, not "no source": the setting is not there at all.
		expect(screen.queryByTestId(`${testId}-spec-bp_article`)).toBeNull();
		expect(
			screen.queryByTestId(`${testId}-spec-bp_article-unavailable`),
		).toBeNull();
		expect(screen.queryByLabelText("Reference Spec for bp_article")).toBeNull();

		await user.click(screen.getByLabelText("Blueprints"));
		await screen.findByText("Person");
		// The Adapter is never asked for a purpose it declined.
		expect(source.search.mock.calls.map(([q]) => q.purpose)).toEqual([
			"reference_target",
		]);
	});

	it("keeps a stored linked Reference Spec readable, never editable", async () => {
		const { adapters } = scopedAdapters(["reference_target"]);
		renderEditor(
			[
				referenceField(type, {
					blueprint: "bp_article",
					spec_blueprint: "rel_teaser",
				}),
			],
			adapters,
		);
		await openTypeSettings("related");

		const note = screen.getByTestId(`${testId}-spec-bp_article-unavailable`);
		expect(note).toHaveTextContent(/has no source for/);
		expect(note).toHaveTextContent("rel_teaser");
	});
});

describe("purposes: ['reference_target'] — a Virtual Table", () => {
	function table(settings: Field["settings"]): Field {
		return {
			field_type: "virtual_table",
			config: config("Lines", "lines"),
			settings,
			children: null,
			system: false,
		};
	}

	it("offers an embedded Row Spec only, and does not ask for an adapter", async () => {
		renderEditor([table({})], scopedAdapters(["reference_target"]).adapters);
		await openTypeSettings("lines");

		expect(screen.queryByLabelText("A linked blueprint")).toBeNull();
		expect(screen.getByLabelText("Declared in this field")).toBeChecked();
		expect(screen.getByText("Row fields")).toBeInTheDocument();
		// The Consumer has a blueprint adapter; the setting is hidden by
		// purpose, so there is nothing to tell the Author to register.
		expect(
			screen.queryByText("Linking a blueprint needs a blueprint adapter."),
		).toBeNull();
	});

	it("offers the linked Row Spec where row_spec is served", async () => {
		renderEditor(
			[table({})],
			scopedAdapters(["reference_target", "row_spec"]).adapters,
		);
		await openTypeSettings("lines");

		expect(screen.getByLabelText("A linked blueprint")).toBeInTheDocument();
	});

	it("keeps a stored linked Row Spec readable", async () => {
		renderEditor(
			[table({ blueprint: "rel_line" })],
			scopedAdapters(["reference_target"]).adapters,
		);
		await openTypeSettings("lines");

		expect(screen.getByLabelText("A linked blueprint")).toBeChecked();
		const note = screen.getByTestId("virtual-table-blueprint-unavailable");
		expect(note).toHaveTextContent("rel_line");
	});
});

describe("purposes: ['reference_target'] — a stored Fieldset", () => {
	it("renders, and its Blueprint stays readable", async () => {
		renderEditor(
			[
				{
					field_type: "fieldset",
					config: config("Address", "address"),
					settings: { collapsible: false, blueprint: "rel_address" },
					system: false,
				},
			],
			scopedAdapters(["reference_target"]).adapters,
		);
		await openTypeSettings("address");

		const note = screen.getByTestId("fieldset-blueprint-unavailable");
		expect(note).toHaveTextContent("rel_address");
	});
});
