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
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import { singleReferencePlugin } from "../../schema/field-types/single-reference";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { SingleReferenceSettingsEditor } from "../field-settings/single-reference-settings";
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

const FIELD: Field<SingleReferenceSettings> = {
	field_type: "single_reference",
	config: {
		name: "Primary article",
		api_accessor: "primary_article",
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
	initial?: SingleReferenceSettings | null;
	adapters?: FieldKitAdapters;
} = {}) {
	const onChange = vi.fn();

	// Stateful so a multi-character id types the way an Author's does — the
	// config panel applies each change straight back to the draft.
	function Harness() {
		const [settings, setSettings] = useState(initial);
		return (
			<SingleReferenceSettingsEditor
				settings={settings as SingleReferenceSettings}
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
		blueprints: () => screen.getByLabelText(/Blueprints/),
		pinMode: () => screen.getByLabelText(/Pin the reference to/),
	};
}

describe("SingleReferenceSettingsEditor", () => {
	describe("with a blueprint list", () => {
		it("offers the blueprints the adapter lists", async () => {
			const user = userEvent.setup();
			const { blueprints } = renderEditor({ adapters: listingAdapter() });

			await user.click(await screen.findByLabelText(/Blueprints/));

			expect(await screen.findByText("Article")).toBeInTheDocument();
			expect(screen.getByText("Author")).toBeInTheDocument();
			expect(blueprints()).toBeInTheDocument();
		});

		it("stores the ids of the blueprints the Author picks", async () => {
			const user = userEvent.setup();
			const { onChange, blueprints } = renderEditor({
				adapters: listingAdapter(),
			});

			await user.click(await screen.findByLabelText(/Blueprints/));
			await user.click(await screen.findByText("Article"));

			expect(onChange).toHaveBeenLastCalledWith({
				blueprints: [{ blueprint: "article" }],
			});

			await user.click(blueprints());
			await user.click(await screen.findByText("Author"));

			expect(onChange).toHaveBeenLastCalledWith({
				blueprints: [{ blueprint: "article" }, { blueprint: "author" }],
			});
		});

		it("shows stored blueprints by name, not by id", async () => {
			renderEditor({
				initial: { blueprints: [{ blueprint: "author" }] },
				adapters: listingAdapter(),
			});

			expect(await screen.findByText("Author")).toBeInTheDocument();
		});

		it("keeps a stored blueprint the list does not offer", async () => {
			const { onChange } = renderEditor({
				initial: { blueprints: [{ blueprint: "retired_bp" }] },
				adapters: listingAdapter(),
			});

			// Shown under its raw id, and never silently rewritten just by
			// opening the panel.
			expect(await screen.findByText("retired_bp")).toBeInTheDocument();
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("the pin mode", () => {
		it("offers none or release — never a version", async () => {
			const user = userEvent.setup();
			const { pinMode } = renderEditor();

			await user.click(pinMode());

			// The options, not `getByText` — the chosen one is also rendered as
			// the select's own value.
			expect(
				(await screen.findAllByRole("option")).map((option) =>
					option.textContent?.trim(),
				),
			).toEqual(["The release in force", "A chosen release"]);
		});

		it("starts a Field on the release in force", () => {
			renderEditor();

			expect(screen.getByText("The release in force")).toBeInTheDocument();
		});

		it("stores the mode the Author chooses, leaving the rest alone", async () => {
			const user = userEvent.setup();
			const { onChange, pinMode } = renderEditor({
				initial: { blueprints: [{ blueprint: "article" }] },
			});

			await user.click(pinMode());
			await user.click(await screen.findByText("A chosen release"));

			expect(onChange).toHaveBeenLastCalledWith({
				blueprints: [{ blueprint: "article" }],
				pin_mode: "release",
			});
		});

		it("warns that changing it strands the pins already saved", () => {
			renderEditor();

			expect(
				screen.getByText(/strands every pin already saved/i),
			).toBeInTheDocument();
		});
	});

	it("offers a Reference Spec, as a tree of references has", () => {
		renderEditor();

		expect(screen.getByTestId("reference-spec-editor")).toHaveTextContent(
			"Reference Spec",
		);
	});

	it("offers a linked Reference Spec for each Blueprint", () => {
		renderEditor({
			initial: { blueprints: [{ blueprint: "article" }] },
			adapters: schemaOnlyAdapter(),
		});

		expect(
			screen.getByTestId("single-reference-blueprints-input-spec-article"),
		).toBeInTheDocument();
	});

	describe("with no way to list blueprints", () => {
		it("sets the blueprint ids the Author types", async () => {
			const user = userEvent.setup();
			const { onChange, blueprints } = renderEditor({
				adapters: schemaOnlyAdapter(),
			});

			await user.type(blueprints(), "article, author");

			expect(onChange).toHaveBeenLastCalledWith({
				blueprints: [{ blueprint: "article" }, { blueprint: "author" }],
			});
		});

		it("shows the Author's stored blueprint ids", () => {
			const { blueprints } = renderEditor({
				initial: {
					blueprints: [{ blueprint: "article" }, { blueprint: "author" }],
				},
				adapters: schemaOnlyAdapter(),
			});

			expect(blueprints()).toHaveValue("article, author");
		});

		it("treats a cleared input as no blueprint constraint", async () => {
			const user = userEvent.setup();
			const { onChange, blueprints } = renderEditor({
				initial: { blueprints: [{ blueprint: "article" }] },
				adapters: schemaOnlyAdapter(),
			});

			await user.clear(blueprints());

			expect(onChange).toHaveBeenLastCalledWith({ blueprints: [] });
		});
	});
});

describe("single_reference in the type picker", () => {
	it("is offered from the catalogue", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={builtInFieldTypes} onSelect={vi.fn()} />
			</ChakraProvider>,
		);

		expect(
			screen.getByTestId("type-option-single_reference"),
		).toHaveTextContent("Single Reference");
	});

	it("is offered when a Spec is being built for a Blueprint", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={builtInFieldTypes}
					consumer="blueprint"
					onSelect={onSelect}
				/>
			</ChakraProvider>,
		);

		await user.click(screen.getByTestId("type-option-single_reference"));

		expect(onSelect).toHaveBeenCalledWith("single_reference");
	});

	it("offers its Blueprints setting in the config panel's Type settings tab", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
					<SettingsSection
						field={FIELD as Field}
						plugin={singleReferencePlugin as FieldTypePlugin}
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
