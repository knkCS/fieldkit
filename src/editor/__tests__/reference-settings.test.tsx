import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
	BlueprintSummary,
	FieldKitAdapters,
} from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import { referencePlugin } from "../../schema/field-types/reference";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { ReferenceSettingsEditor } from "../field-settings/reference-settings";
import { SettingsSection } from "../panel-sections/settings-section";
import { DEFAULT_EDITOR_LABELS } from "../spec-editor";
import { TypePicker } from "../type-picker";

const BLUEPRINTS: BlueprintSummary[] = [
	{ id: "article", name: "Article" },
	{ id: "author", name: "Author" },
];

/** A Consumer whose adapter cannot enumerate Blueprints. */
function schemaOnlyAdapter(): FieldKitAdapters {
	return {
		blueprint: {
			getSchema: vi.fn().mockResolvedValue([]),
			getData: vi.fn(),
		},
	};
}

function listingAdapter(): FieldKitAdapters {
	return {
		blueprint: {
			getSchema: vi.fn().mockResolvedValue([]),
			getData: vi.fn(),
			list: () => Promise.resolve(BLUEPRINTS),
		},
	};
}

const FIELD: Field<ReferenceSettings> = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: "related",
		required: false,
		instructions: "",
	},
	settings: {},
	system: false,
};

function renderEditor({
	initial = {},
	adapters = {},
}: {
	initial?: ReferenceSettings | null;
	adapters?: FieldKitAdapters;
} = {}) {
	const onChange = vi.fn();

	// Stateful so a multi-character id types the way an Author's does — the
	// config panel applies each change straight back to the draft.
	function Harness() {
		const [settings, setSettings] = useState(initial);
		return (
			<ReferenceSettingsEditor
				settings={settings as ReferenceSettings}
				field={FIELD}
				onChange={(next) => {
					onChange(next);
					setSettings(next);
				}}
			/>
		);
	}

	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>,
	);

	return { onChange, blueprints: () => screen.getByLabelText(/Blueprints/) };
}

describe("ReferenceSettingsEditor", () => {
	it("stores the ids of the blueprints the Author picks", async () => {
		const user = userEvent.setup();
		const { onChange, blueprints } = renderEditor({
			adapters: listingAdapter(),
		});

		await user.click(await screen.findByLabelText(/Blueprints/));
		await user.click(await screen.findByText("Article"));

		expect(onChange).toHaveBeenLastCalledWith({ blueprints: ["article"] });

		await user.click(blueprints());
		await user.click(await screen.findByText("Author"));

		expect(onChange).toHaveBeenLastCalledWith({
			blueprints: ["article", "author"],
		});
	});

	it("leaves the Field's other settings alone", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({
			initial: { max_items: 3 },
			adapters: listingAdapter(),
		});

		await user.click(await screen.findByLabelText(/Blueprints/));
		await user.click(await screen.findByText("Article"));

		expect(onChange).toHaveBeenLastCalledWith({
			max_items: 3,
			blueprints: ["article"],
		});
	});

	it("shows stored blueprints by name, not by id", async () => {
		renderEditor({
			initial: { blueprints: ["author"] },
			adapters: listingAdapter(),
		});

		expect(await screen.findByText("Author")).toBeInTheDocument();
	});

	it("falls back to blueprint id entry when the adapter cannot list", async () => {
		const user = userEvent.setup();
		const { onChange, blueprints } = renderEditor({
			adapters: schemaOnlyAdapter(),
		});

		await user.type(blueprints(), "article, author");

		expect(onChange).toHaveBeenLastCalledWith({
			blueprints: ["article", "author"],
		});
	});
});

describe("reference in the type picker", () => {
	it("is offered from the catalogue", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={builtInFieldTypes} onSelect={vi.fn()} />
			</ChakraProvider>,
		);

		expect(screen.getByTestId("type-option-reference")).toHaveTextContent(
			"Reference",
		);
	});

	it("offers its Blueprints setting in the config panel's Type settings tab", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
					<SettingsSection
						field={FIELD as Field}
						plugin={referencePlugin as FieldTypePlugin}
						onFieldChange={vi.fn()}
						accessorError={null}
						takenAccessors={new Set()}
						committedAccessors={new Set()}
						labels={DEFAULT_EDITOR_LABELS}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);

		expect(screen.getByLabelText(/Blueprints/)).toBeInTheDocument();
	});
});
