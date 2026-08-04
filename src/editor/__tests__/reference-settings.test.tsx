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

	return {
		onChange,
		/** The settings as the editor last handed them back. */
		latest: () => onChange.mock.calls.at(-1)?.[0] as ReferenceSettings,
		blueprints: () => screen.getByLabelText(/Blueprints/),
		pinMode: () => screen.getByLabelText(/Pin references to/),
		maxItems: () => screen.getByLabelText(/Maximum references/),
		maxDepth: () => screen.getByLabelText(/Maximum depth/),
	};
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

	it("offers a pin mode of none, release or version", async () => {
		const user = userEvent.setup();
		const { pinMode } = renderEditor();

		await user.click(pinMode());

		// Read off the open menu by the words an Author sees: not pinning is
		// named after what it gets you, the other two after what they pin to.
		// The options, not `getByText` — the chosen one is also rendered as the
		// select's own value.
		expect(
			(await screen.findAllByRole("option")).map((option) =>
				option.textContent?.trim(),
			),
		).toEqual(["The newest version", "A chosen release", "A chosen version"]);
	});

	it("starts a Field on the newest version", () => {
		renderEditor();

		expect(screen.getByText("The newest version")).toBeInTheDocument();
	});

	it("stores the pin mode the Author chooses", async () => {
		const user = userEvent.setup();
		const { onChange, pinMode } = renderEditor();

		await user.click(pinMode());
		await user.click(await screen.findByText("A chosen release"));

		expect(onChange).toHaveBeenLastCalledWith({ pin_mode: "release" });
	});

	it("leaves the Field's other settings alone when the pin mode changes", async () => {
		const user = userEvent.setup();
		const { onChange, pinMode } = renderEditor({
			initial: { blueprints: ["article"] },
		});

		await user.click(pinMode());
		await user.click(await screen.findByText("A chosen version"));

		expect(onChange).toHaveBeenLastCalledWith({
			blueprints: ["article"],
			pin_mode: "version",
		});
	});

	it("shows a Spec written before pinning existed as not pinning", () => {
		renderEditor({ initial: { blueprints: ["article"] } });

		expect(screen.getByText("The newest version")).toBeInTheDocument();
	});

	it("warns that changing the pin mode strands the pins already saved", () => {
		renderEditor();

		// Fieldkit cannot refuse the change, and does not rewrite the stranded
		// Pins either — only a Consumer knows whether any Content would be
		// stranded, and its own upgrade nulls them (ADR-0008). So it says so.
		expect(
			screen.getByText(/strands every pin already saved/i),
		).toBeInTheDocument();
	});

	describe("the two caps", () => {
		it("offers a control for each", () => {
			const { maxItems, maxDepth } = renderEditor();

			expect(maxItems()).toBeInTheDocument();
			expect(maxDepth()).toBeInTheDocument();
		});

		it("shows an unset cap as an empty box saying there is no limit", () => {
			const { maxItems, maxDepth } = renderEditor();

			expect(maxItems()).toHaveValue(null);
			expect(maxItems()).toHaveAttribute("placeholder", "No limit");
			expect(maxDepth()).toHaveValue(null);
		});

		it("stores the number of references an Author caps the Field at", async () => {
			const user = userEvent.setup();
			const { onChange, maxItems } = renderEditor();

			await user.type(maxItems(), "5");

			expect(onChange).toHaveBeenLastCalledWith({ max_items: 5 });
		});

		it("stores the number of levels an Author allows", async () => {
			const user = userEvent.setup();
			const { onChange, maxDepth } = renderEditor();

			await user.type(maxDepth(), "3");

			expect(onChange).toHaveBeenLastCalledWith({ max_depth: 3 });
		});

		it("says what one level means, so a flat list is not authored by accident", () => {
			renderEditor();

			expect(screen.getByText(/1 is a flat list/i)).toBeInTheDocument();
		});

		it("says the reference cap counts nested references too", () => {
			renderEditor();

			expect(
				screen.getByText(/counts every reference, nested ones included/i),
			).toBeInTheDocument();
		});

		it("unsets the cap when the box is emptied, rather than storing zero", async () => {
			const user = userEvent.setup();
			const { latest, maxItems } = renderEditor({ initial: { max_items: 3 } });

			await user.clear(maxItems());

			// The key is gone, not set to 0: an unset cap and a cap of zero are
			// different settings, and only one of them stops an Author adding.
			expect(latest()).not.toHaveProperty("max_items");
		});

		it("unsets the depth the same way", async () => {
			const user = userEvent.setup();
			const { latest, maxDepth } = renderEditor({ initial: { max_depth: 2 } });

			await user.clear(maxDepth());

			expect(latest()).not.toHaveProperty("max_depth");
		});

		it("keeps a depth of zero out of reach, since it would allow nothing", async () => {
			const user = userEvent.setup();
			const { onChange, maxDepth } = renderEditor();

			await user.type(maxDepth(), "0");

			expect(onChange).toHaveBeenLastCalledWith({ max_depth: 1 });
		});

		it("leaves the Field's other settings alone", async () => {
			const user = userEvent.setup();
			const { onChange, maxDepth } = renderEditor({
				initial: { blueprints: ["article"], pin_mode: "release" },
			});

			await user.type(maxDepth(), "2");

			expect(onChange).toHaveBeenLastCalledWith({
				blueprints: ["article"],
				pin_mode: "release",
				max_depth: 2,
			});
		});

		it("shows the caps a Spec already stores", () => {
			const { maxItems, maxDepth } = renderEditor({
				initial: { max_items: 8, max_depth: 3 },
			});

			expect(maxItems()).toHaveValue(8);
			expect(maxDepth()).toHaveValue(3);
		});
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
		expect(screen.getByLabelText(/Pin references to/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Maximum references/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Maximum depth/)).toBeInTheDocument();
	});
});
