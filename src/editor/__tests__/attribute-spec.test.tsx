// src/editor/__tests__/attribute-spec.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import { referencePlugin } from "../../schema/field-types/reference";
import type { Field } from "../../schema/types";
import { FieldConfigPanel } from "../field-config-panel";
import { DEFAULT_EDITOR_LABELS } from "../spec-editor";

const REFERENCE_FIELD: Field<ReferenceSettings> = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: "related",
		required: false,
		instructions: "",
	},
	settings: { blueprints: [], pin_mode: "none", attributes: [] },
	children: null,
	system: false,
};

/** The Field as the panel currently holds it. */
function settingsOf(): ReferenceSettings {
	return (JSON.parse(screen.getByTestId("dump").textContent ?? "null") as Field)
		.settings as ReferenceSettings;
}

function attributesOf(): Field[] {
	return settingsOf().attributes ?? [];
}

function renderPanel(initial: Field = REFERENCE_FIELD) {
	function Harness() {
		const [field, setField] = useState<Field>(initial);
		return (
			<div>
				<FieldConfigPanel
					field={field}
					plugin={referencePlugin}
					plugins={builtInFieldTypes}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={setField}
					onClose={() => {}}
					committedAccessors={new Set<string>()}
					baselineAccessor={initial.config.api_accessor}
					labels={DEFAULT_EDITOR_LABELS}
				/>
				<pre data-testid="dump">{JSON.stringify(field)}</pre>
			</div>
		);
	}

	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>,
	);
}

/** Opens the Type settings tab, where the Attribute Spec is authored. */
async function openTypeSettings(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("tab", { name: "Type settings" }));
	return await screen.findByTestId("attribute-spec-editor");
}

/** Opens the type picker the way an Author does. */
async function openTypePicker(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Add attribute" }));
	return await screen.findByTestId("type-picker");
}

describe("declaring Attributes on a Reference Field", () => {
	it("shows the Attribute Spec in the Type settings tab", async () => {
		const user = userEvent.setup();
		renderPanel();

		const editor = await openTypeSettings(user);
		expect(editor).toHaveTextContent("No attributes");
	});

	it("offers only the types an Attribute may be", async () => {
		const user = userEvent.setup();
		renderPanel();
		await openTypeSettings(user);
		await openTypePicker(user);

		// Ordinary leaves, so "page" can be a number and "role" a select.
		expect(screen.getByTestId("type-option-number")).toBeInTheDocument();
		expect(screen.getByTestId("type-option-select")).toBeInTheDocument();
		expect(screen.getByTestId("type-option-text")).toBeInTheDocument();

		// A drawer has no Tab and no Card for a Marker to open…
		expect(screen.queryByTestId("type-option-section")).toBeNull();
		expect(screen.queryByTestId("type-option-card")).toBeNull();
		// …a container's children would be composed but never checked
		// (ADR-0007)…
		expect(screen.queryByTestId("type-option-group")).toBeNull();
		expect(screen.queryByTestId("type-option-fieldset")).toBeNull();
		expect(screen.queryByTestId("type-option-blocks")).toBeNull();
		// …and a Reference Field here is a recursion nothing would catch.
		expect(screen.queryByTestId("type-option-reference")).toBeNull();
		expect(screen.queryByTestId("type-option-single_reference")).toBeNull();
	});

	it("adds the chosen type to settings, never to children", async () => {
		const user = userEvent.setup();
		renderPanel();
		await openTypeSettings(user);
		await openTypePicker(user);

		await user.click(screen.getByTestId("type-option-number"));

		expect(attributesOf()).toHaveLength(1);
		expect(attributesOf()[0].field_type).toBe("number");
		// The Blocks precedent, and ADR-0007's boundary with it: an Attribute
		// Field is never a child, so nothing shared walks to it.
		const dumped = JSON.parse(
			screen.getByTestId("dump").textContent ?? "null",
		) as Field;
		expect(dumped.children).toBeNull();
	});

	it("keeps the Field's other settings when an Attribute is added", async () => {
		const user = userEvent.setup();
		renderPanel({
			...REFERENCE_FIELD,
			settings: { blueprints: ["article"], pin_mode: "release" },
		});
		await openTypeSettings(user);
		await openTypePicker(user);

		await user.click(screen.getByTestId("type-option-text"));

		expect(settingsOf().blueprints).toEqual(["article"]);
		expect(settingsOf().pin_mode).toBe("release");
	});

	it("gives a second Attribute of one type its own Accessor", async () => {
		const user = userEvent.setup();
		renderPanel();
		await openTypeSettings(user);

		await openTypePicker(user);
		await user.click(screen.getByTestId("type-option-text"));
		// Back lands on the Reference Field's General tab — popping a frame is a
		// change of field, and the panel resets the tab with it.
		await user.click(screen.getByTestId("panel-back"));
		await openTypeSettings(user);
		await openTypePicker(user);
		await user.click(screen.getByTestId("type-option-text"));

		// Nothing shared checks these for duplicates (ADR-0007), so generating
		// them uniquely is the only thing standing between an Author and a
		// silently-overwritten Attribute.
		expect(attributesOf().map((a) => a.config.api_accessor)).toEqual([
			"text",
			"text_2",
		]);
	});

	it("removes an Attribute from the list", async () => {
		const user = userEvent.setup();
		renderPanel();
		await openTypeSettings(user);
		await openTypePicker(user);
		await user.click(screen.getByTestId("type-option-number"));
		await user.click(screen.getByTestId("panel-back"));
		await openTypeSettings(user);

		await user.click(screen.getByRole("button", { name: "Remove Number" }));

		expect(attributesOf()).toEqual([]);
	});
});

describe("configuring one Attribute through the panel's drill-in", () => {
	/** Adds an Attribute of `type`, leaving the panel drilled into it. */
	async function addAttribute(
		user: ReturnType<typeof userEvent.setup>,
		type: string,
	) {
		await openTypeSettings(user);
		await openTypePicker(user);
		await user.click(screen.getByTestId(`type-option-${type}`));
	}

	it("drills straight into a freshly added Attribute", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addAttribute(user, "number");

		// The generated name and Accessor are not what the Author meant, so the
		// panel lands on them rather than making someone go looking.
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Number");
	});

	it("writes a rename back into settings, not into children", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addAttribute(user, "number");

		await user.clear(screen.getByTestId("panel-name-input"));
		await user.type(screen.getByTestId("panel-name-input"), "Page");

		expect(attributesOf()[0].config.name).toBe("Page");
		// And the drill-in followed the auto-slug rather than orphaning itself.
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Page");
	});

	it("makes an Attribute required from the Attribute's own General tab", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addAttribute(user, "select");

		await user.click(screen.getByTestId("panel-required-input"));

		expect(attributesOf()[0].config.required).toBe(true);
	});

	it("gives a drilled Attribute its own type settings", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addAttribute(user, "list");

		await user.click(screen.getByRole("tab", { name: "Type settings" }));

		// An Attribute has to be configurable as the type it is, so the drill-in
		// resolves the DRILLED Field's own plugin rather than falling back to
		// "No additional settings" the way a Group's child used to.
		expect(
			screen.getByTestId("list-max-items-per-page-input"),
		).toBeInTheDocument();
		expect(
			screen.queryByText(DEFAULT_EDITOR_LABELS.panelNoSettings),
		).toBeNull();
	});

	it("comes back out to the Reference Field", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addAttribute(user, "number");

		await user.click(screen.getByTestId("panel-back"));

		expect(screen.getByTestId("panel-name-input")).toHaveValue(
			"Related articles",
		);
		expect(screen.queryByTestId("panel-back")).toBeNull();
	});

	it("re-opens an Attribute declared earlier", async () => {
		const user = userEvent.setup();
		renderPanel({
			...REFERENCE_FIELD,
			settings: {
				attributes: [
					{
						field_type: "text",
						config: {
							name: "Role",
							api_accessor: "role",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
				],
			},
		});
		await openTypeSettings(user);

		await user.click(screen.getByTestId("attribute-edit-role"));

		expect(screen.getByTestId("panel-name-input")).toHaveValue("Role");
	});
});
