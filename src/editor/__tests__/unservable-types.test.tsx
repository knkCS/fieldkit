// src/editor/__tests__/unservable-types.test.tsx
//
// ADR-0027: a Field Type a Consumer cannot serve is hidden, never degraded.
// Each type declares the Adapter capabilities its settings need; SpecEditor's
// type picker offers it only where the Consumer's Adapters meet them, a
// Virtual Table offers its linked Row Spec only with a Blueprint search, and
// a Field of a hidden type that is already stored still renders, reads, and
// saves exactly as it was — hiding narrows a picker, it never invalidates a
// stored Spec (ADR-0022).
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { TypePicker } from "../type-picker";

const L = DEFAULT_EDITOR_LABELS;
const plugins = builtInFieldTypes;

const page = vi.fn().mockResolvedValue({ items: [] });

/** A Blueprint Adapter that can resolve a Spec but not search: what a
 * Consumer registered before ADR-0027, and not a source for any picker. */
const blueprintWithoutSearch = (): NonNullable<
	FieldKitAdapters["blueprint"]
> => ({
	getSchema: vi.fn().mockResolvedValue([]),
	getData: vi.fn(),
});

const ADAPTERS = {
	none: (): FieldKitAdapters => ({}),
	blueprintWithoutSearch: (): FieldKitAdapters => ({
		blueprint: blueprintWithoutSearch(),
	}),
	blueprintSearch: (): FieldKitAdapters => ({
		blueprint: { ...blueprintWithoutSearch(), search: page },
	}),
	textTypeWithoutSearch: (): FieldKitAdapters => ({
		textType: { get: vi.fn() },
	}),
	textTypeSearch: (): FieldKitAdapters => ({
		textType: { get: vi.fn(), search: page },
	}),
	both: (): FieldKitAdapters => ({
		blueprint: { ...blueprintWithoutSearch(), search: page },
		textType: { get: vi.fn(), search: page },
	}),
};

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
	const onCommit = vi.fn();
	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={plugins} adapters={adapters}>
				<SpecEditor schema={schema} onCommit={onCommit} plugins={plugins} />
			</FieldKitProvider>
		</ChakraProvider>,
	);
	return { onCommit };
}

/** Opens SpecEditor's own type picker — the canvas's ⊕ — and waits for it. */
async function openTypePicker() {
	await act(async () => {
		fireEvent.click(screen.getAllByLabelText(L.addField)[0]);
	});
	await screen.findByTestId("type-option-text");
}

const offered = (id: string) => screen.queryByTestId(`type-option-${id}`);

interface TypeCase {
	type: string;
	/** Adapters that do NOT meet the type's requirement. */
	unmet: (keyof typeof ADAPTERS)[];
	/** Adapters that do. */
	met: keyof typeof ADAPTERS;
}

const TYPES: TypeCase[] = [
	{
		type: "reference",
		unmet: ["none", "blueprintWithoutSearch", "textTypeSearch"],
		met: "blueprintSearch",
	},
	{
		type: "single_reference",
		unmet: ["none", "blueprintWithoutSearch", "textTypeSearch"],
		met: "blueprintSearch",
	},
	{
		type: "fieldset",
		unmet: ["none", "blueprintWithoutSearch", "textTypeSearch"],
		met: "blueprintSearch",
	},
	{
		type: "rich_text",
		unmet: ["none", "textTypeWithoutSearch", "blueprintSearch"],
		met: "textTypeSearch",
	},
];

describe.each(TYPES)("the type picker and $type", ({ type, unmet, met }) => {
	it.each(unmet)("hides it with the adapters %s", async (adapters) => {
		renderEditor([textField], ADAPTERS[adapters]());
		await openTypePicker();

		expect(offered(type)).toBeNull();
		// Only the unservable type goes: the picker is otherwise whole.
		expect(offered("text")).not.toBeNull();
		expect(offered("virtual_table")).not.toBeNull();
	});

	it(`offers it with the adapters ${met}`, async () => {
		renderEditor([textField], ADAPTERS[met]());
		await openTypePicker();

		expect(offered(type)).not.toBeNull();
	});
});

describe("TypePicker on its own", () => {
	const reference = plugins.find(
		(p) => p.id === "reference",
	) as FieldTypePlugin;
	const text = plugins.find((p) => p.id === "text") as FieldTypePlugin;

	it("hides a type whose requirement is unmet outside any FieldKitProvider", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={[text, reference]} onSelect={vi.fn()} />
			</ChakraProvider>,
		);
		expect(offered("text")).not.toBeNull();
		expect(offered("reference")).toBeNull();
	});

	it("offers it with adapters of its own that meet it, and they win over the provider's", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={plugins} adapters={ADAPTERS.none()}>
					<TypePicker
						plugins={[text, reference]}
						onSelect={vi.fn()}
						adapters={ADAPTERS.blueprintSearch()}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);
		expect(offered("reference")).not.toBeNull();
	});

	it("offers it inside a provider whose adapters meet it", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={plugins} adapters={ADAPTERS.both()}>
					<TypePicker plugins={[text, reference]} onSelect={vi.fn()} />
				</FieldKitProvider>
			</ChakraProvider>,
		);
		expect(offered("reference")).not.toBeNull();
	});
});

describe("a Virtual Table's linked Row Spec", () => {
	const table: Field = {
		field_type: "virtual_table",
		config: config("Lines", "lines"),
		settings: {},
		children: null,
		system: false,
	};

	async function openSettings(adapters: FieldKitAdapters) {
		const user = userEvent.setup();
		renderEditor([table], adapters);
		await user.click(screen.getByTestId("shell-lines"));
		await user.click(screen.getByText(L.panelTabType));
	}

	it.each([
		"none",
		"blueprintWithoutSearch",
	] as const)("is not offered with the adapters %s: embedded only", async (adapters) => {
		await openSettings(ADAPTERS[adapters]());

		expect(screen.queryByLabelText("A linked blueprint")).toBeNull();
		expect(screen.getByText("Row fields")).toBeInTheDocument();
	});

	it("is offered with a Blueprint search", async () => {
		await openSettings(ADAPTERS.blueprintSearch());

		expect(screen.getByLabelText("A linked blueprint")).toBeInTheDocument();
	});
});

describe("a stored Field of a hidden type", () => {
	const STORED: { field: Field; testId: string; id: string }[] = [
		{
			field: {
				field_type: "reference",
				config: config("Related", "related"),
				settings: {
					blueprints: [{ blueprint: "bp_article" }],
					pin_mode: "none",
				},
				children: null,
				system: false,
			},
			testId: "reference-blueprints",
			id: "bp_article",
		},
		{
			field: {
				field_type: "single_reference",
				config: config("Author", "author"),
				settings: {
					blueprints: [{ blueprint: "bp_person" }],
					pin_mode: "none",
				},
				children: null,
				system: false,
			},
			testId: "single-reference-blueprints",
			id: "bp_person",
		},
		{
			field: {
				field_type: "fieldset",
				config: config("Address", "address"),
				settings: { collapsible: false, blueprint: "bp_address" },
				system: false,
			},
			testId: "fieldset-blueprint",
			id: "bp_address",
		},
		{
			field: {
				field_type: "rich_text",
				config: config("Body", "body"),
				settings: { text_type: "tt_body", view_mode: "full" },
				system: false,
			},
			testId: "rich-text-text-type",
			id: "tt_body",
		},
	];

	it.each(
		STORED,
	)("$field.field_type renders, and its setting says there is no source", async ({
		field,
		testId,
		id,
	}) => {
		const user = userEvent.setup();
		renderEditor([field], ADAPTERS.none());

		const accessor = field.config.api_accessor;
		expect(screen.getByTestId(`shell-${accessor}`)).toBeInTheDocument();

		await user.click(screen.getByTestId(`shell-${accessor}`));
		await user.click(screen.getByText(L.panelTabType));

		const note = screen.getByTestId(`${testId}-unavailable`);
		expect(note).toHaveTextContent(/has no source for/);
		expect(note).toHaveTextContent(id);
	});

	it("validates exactly as it did — hiding never invalidates a Spec", () => {
		const schema = STORED.map(({ field }) => field);
		// validateSpec takes no Adapters: what a Consumer can serve is not
		// something it can see, so a hidden type is as valid as before.
		const result = validateSpec(schema, new Map(plugins.map((p) => [p.id, p])));
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it("saves unchanged from an editor that hides its types", async () => {
		const user = userEvent.setup();
		const schema = STORED.map(({ field }) => field);
		const { onCommit } = renderEditor(schema, ADAPTERS.none());

		// Dirty the draft without touching a hidden Field, so Save is offered.
		await user.click(screen.getByTestId("shell-related"));
		await user.click(screen.getByText(L.panelTabGeneral));
		const name = screen.getByDisplayValue("Related");
		await user.type(name, "!");
		await user.click(screen.getByText(L.save));

		await waitFor(() => expect(onCommit).toHaveBeenCalled());
		const saved = onCommit.mock.calls[0][0] as Schema;
		expect(saved.slice(1)).toEqual(schema.slice(1));
		expect(saved[0].settings).toEqual(schema[0].settings);
		expect(saved[0].config.name).toBe("Related!");
	});
});
