// src/editor/__tests__/field-modal.test.tsx

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { FieldModal } from "../field-modal";

const DummyIcon = () => <span>icon</span>;

const testPlugin: FieldTypePlugin = {
	id: "text",
	name: "Text",
	description: "A single line of text",
	icon: DummyIcon,
	category: "text",
	fieldComponent: () => null,
	toZodType: () => z.string(),
	defaultSettings: { placeholder: "" },
};

const existingField: Field = {
	field_type: "text",
	config: {
		name: "First Name",
		api_accessor: "first_name",
		required: true,
		instructions: "Enter your first name",
	},
	validation: { min_length: 2, max_length: 50 },
	settings: { placeholder: "John" },
	children: null,
	system: false,
};

describe("FieldModal", () => {
	it("renders with field data populated", () => {
		const onSave = vi.fn();
		const onClose = vi.fn();

		render(
			<FieldModal
				field={existingField}
				plugin={testPlugin}
				existingAccessors={["first_name", "last_name"]}
				isOpen={true}
				onClose={onClose}
				onSave={onSave}
			/>,
		);

		expect(screen.getByTestId("field-modal")).toBeInTheDocument();
		expect(screen.getByTestId("field-name-input")).toHaveValue("First Name");
		expect(screen.getByTestId("field-accessor-input")).toHaveValue(
			"first_name",
		);
		expect(screen.getByTestId("field-required-input")).toBeChecked();
		expect(screen.getByTestId("field-instructions-input")).toHaveValue(
			"Enter your first name",
		);
		expect(screen.getByTestId("field-min-length-input")).toHaveValue(2);
		expect(screen.getByTestId("field-max-length-input")).toHaveValue(50);
	});

	it("does not render when closed", () => {
		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={false}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId("field-modal")).not.toBeInTheDocument();
	});

	it("auto-generates api_accessor from name", () => {
		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const nameInput = screen.getByTestId("field-name-input");
		fireEvent.change(nameInput, { target: { value: "My Field Name" } });

		expect(screen.getByTestId("field-accessor-input")).toHaveValue(
			"my_field_name",
		);
	});

	it("stops auto-generating accessor once manually edited", () => {
		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const nameInput = screen.getByTestId("field-name-input");
		const accessorInput = screen.getByTestId("field-accessor-input");

		// First auto-generate
		fireEvent.change(nameInput, { target: { value: "My Field" } });
		expect(accessorInput).toHaveValue("my_field");

		// Manually edit accessor
		fireEvent.change(accessorInput, { target: { value: "custom_accessor" } });
		expect(accessorInput).toHaveValue("custom_accessor");

		// Further name changes should not update accessor
		fireEvent.change(nameInput, { target: { value: "Another Name" } });
		expect(accessorInput).toHaveValue("custom_accessor");
	});

	it("shows error for duplicate accessor", () => {
		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={["existing_field"]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const accessorInput = screen.getByTestId("field-accessor-input");
		fireEvent.change(accessorInput, { target: { value: "existing_field" } });

		expect(screen.getByTestId("accessor-error")).toBeInTheDocument();
		expect(
			screen.getByText("This accessor is already in use"),
		).toBeInTheDocument();
	});

	it("allows same accessor when editing existing field", () => {
		render(
			<FieldModal
				field={existingField}
				plugin={testPlugin}
				existingAccessors={["first_name", "last_name"]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		// "first_name" is in existingAccessors but it's the same field, so no error
		expect(screen.queryByTestId("accessor-error")).not.toBeInTheDocument();
	});

	it("calls onSave with correct Field object", () => {
		const onSave = vi.fn();

		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={onSave}
			/>,
		);

		fireEvent.change(screen.getByTestId("field-name-input"), {
			target: { value: "Title" },
		});
		// accessor auto-generated to "title"
		fireEvent.click(screen.getByTestId("field-required-input"));
		fireEvent.change(screen.getByTestId("field-instructions-input"), {
			target: { value: "Enter a title" },
		});

		fireEvent.click(screen.getByTestId("field-modal-save"));

		expect(onSave).toHaveBeenCalledTimes(1);
		const savedField = onSave.mock.calls[0][0] as Field;

		expect(savedField.field_type).toBe("text");
		expect(savedField.config.name).toBe("Title");
		expect(savedField.config.api_accessor).toBe("title");
		expect(savedField.config.required).toBe(true);
		expect(savedField.config.instructions).toBe("Enter a title");
		expect(savedField.system).toBe(false);
	});

	it("calls onClose when Cancel is clicked", () => {
		const onClose = vi.fn();

		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={true}
				onClose={onClose}
				onSave={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("Cancel"));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("shows 'No additional settings' when plugin has no settings component", () => {
		render(
			<FieldModal
				field={null}
				plugin={testPlugin}
				existingAccessors={[]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByText("No additional settings")).toBeInTheDocument();
	});

	it("renders settings component when plugin has one", () => {
		const pluginWithSettings: FieldTypePlugin = {
			...testPlugin,
			settingsComponent: ({ settings, onChange }) => (
				<div data-testid="custom-settings">
					<input
						data-testid="custom-setting-input"
						value={settings?.placeholder ?? ""}
						onChange={(e) =>
							onChange({ ...settings, placeholder: e.target.value })
						}
					/>
				</div>
			),
		};

		render(
			<FieldModal
				field={null}
				plugin={pluginWithSettings}
				existingAccessors={[]}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByTestId("custom-settings")).toBeInTheDocument();
	});
});
