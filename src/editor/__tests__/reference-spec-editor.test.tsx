// src/editor/__tests__/reference-spec-editor.test.tsx
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
	settings: { blueprints: [], pin_mode: "none", spec: [] },
	children: null,
	system: false,
};

/** The Field as the panel currently holds it. */
function settingsOf(): ReferenceSettings {
	return (JSON.parse(screen.getByTestId("dump").textContent ?? "null") as Field)
		.settings as ReferenceSettings;
}

function referenceSpecOf(): Field[] {
	return settingsOf().spec ?? [];
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

/** Opens the Type settings tab, where the Reference Spec is authored. */
async function openTypeSettings(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("tab", { name: "Type settings" }));
	return await screen.findByTestId("reference-spec-editor");
}

/** Opens the type picker the way an Author does. */
async function openTypePicker(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Add field" }));
	return await screen.findByTestId("type-picker");
}

describe("declaring a Reference Spec on a Reference Field", () => {
	it("shows the Reference Spec in the Type settings tab", async () => {
		const user = userEvent.setup();
		renderPanel();

		const editor = await openTypeSettings(user);
		expect(editor).toHaveTextContent("No fields");
	});

	it("offers only the types a Reference Spec may hold", async () => {
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

		expect(referenceSpecOf()).toHaveLength(1);
		expect(referenceSpecOf()[0].field_type).toBe("number");
		// The Blocks precedent, and ADR-0007's boundary with it: a Reference
		// Spec field is never a child, so nothing shared walks to it.
		const dumped = JSON.parse(
			screen.getByTestId("dump").textContent ?? "null",
		) as Field;
		expect(dumped.children).toBeNull();
	});

	it("keeps the Field's other settings when a Reference Spec field is added", async () => {
		const user = userEvent.setup();
		renderPanel({
			...REFERENCE_FIELD,
			settings: {
				blueprints: [{ blueprint: "article" }],
				pin_mode: "release",
			},
		});
		await openTypeSettings(user);
		await openTypePicker(user);

		await user.click(screen.getByTestId("type-option-text"));

		expect(settingsOf().blueprints).toEqual([{ blueprint: "article" }]);
		expect(settingsOf().pin_mode).toBe("release");
	});

	it("gives a second Reference Spec field of one type its own Accessor", async () => {
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

		// Two Fields sharing an Accessor would write one value, so the editor
		// generates them uniquely rather than hand the Author a Spec that
		// validateSpec() would only refuse at Save.
		expect(referenceSpecOf().map((a) => a.config.api_accessor)).toEqual([
			"text",
			"text_2",
		]);
	});

	it("removes a Reference Spec field from the list", async () => {
		const user = userEvent.setup();
		renderPanel();
		await openTypeSettings(user);
		await openTypePicker(user);
		await user.click(screen.getByTestId("type-option-number"));
		await user.click(screen.getByTestId("panel-back"));
		await openTypeSettings(user);

		await user.click(screen.getByRole("button", { name: "Remove Number" }));

		expect(referenceSpecOf()).toEqual([]);
	});
});

describe("configuring one Reference Spec field through the panel's drill-in", () => {
	/** Adds a Reference Spec field of `type`, leaving the panel drilled into it. */
	async function addSpecField(
		user: ReturnType<typeof userEvent.setup>,
		type: string,
	) {
		await openTypeSettings(user);
		await openTypePicker(user);
		await user.click(screen.getByTestId(`type-option-${type}`));
	}

	it("drills straight into a freshly added Reference Spec field", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addSpecField(user, "number");

		// The generated name and Accessor are not what the Author meant, so the
		// panel lands on them rather than making someone go looking.
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Number");
	});

	it("writes a rename back into settings, not into children", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addSpecField(user, "number");

		await user.clear(screen.getByTestId("panel-name-input"));
		await user.type(screen.getByTestId("panel-name-input"), "Page");

		expect(referenceSpecOf()[0].config.name).toBe("Page");
		// And the drill-in followed the auto-slug rather than orphaning itself.
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Page");
	});

	it("makes a Reference Spec field required from its own General tab", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addSpecField(user, "select");

		await user.click(screen.getByTestId("panel-required-input"));

		expect(referenceSpecOf()[0].config.required).toBe(true);
	});

	it("gives a drilled Reference Spec field its own type settings", async () => {
		const user = userEvent.setup();
		renderPanel();
		await addSpecField(user, "list");

		await user.click(screen.getByRole("tab", { name: "Type settings" }));

		// A Reference Spec field has to be configurable as the type it is, so the drill-in
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
		await addSpecField(user, "number");

		await user.click(screen.getByTestId("panel-back"));

		expect(screen.getByTestId("panel-name-input")).toHaveValue(
			"Related articles",
		);
		expect(screen.queryByTestId("panel-back")).toBeNull();
	});

	it("ignores an entry in the Spec that is not a Field", async () => {
		const user = userEvent.setup();
		renderPanel({
			...REFERENCE_FIELD,
			settings: {
				// A hand-written Reference Spec may hold anything until
				// validateSpec() is asked about it. Walking a string as though it
				// were a Field would take the whole panel down.
				spec: [
					"not-a-field",
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
				] as unknown as Field[],
			},
		});

		await openTypeSettings(user);
		await user.click(screen.getByTestId("reference-spec-edit-role"));

		expect(screen.getByTestId("panel-name-input")).toHaveValue("Role");
	});

	it("re-opens a Reference Spec field declared earlier", async () => {
		const user = userEvent.setup();
		renderPanel({
			...REFERENCE_FIELD,
			settings: {
				spec: [
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

		await user.click(screen.getByTestId("reference-spec-edit-role"));

		expect(screen.getByTestId("panel-name-input")).toHaveValue("Role");
	});
});
