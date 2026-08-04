// src/table/__tests__/edit-drawer.test.tsx

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { EditDrawer } from "../edit-drawer";

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

function TestField({ field }: FieldProps) {
	const { register } = useFormContext();
	return (
		<div data-testid={`field-${field.config.api_accessor}`}>
			<label>
				{field.config.name}
				<input {...register(field.config.api_accessor)} />
			</label>
		</div>
	);
}
TestField.displayName = "TestField";

const plugins: FieldTypePlugin[] = [
	{
		id: "text",
		name: "Text",
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: TestField,
		toZodType: () => z.string(),
	},
	{
		id: "section",
		name: "Section",
		description: "",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
];

function makeField(
	overrides: Partial<Field> & { field_type: string; config: Field["config"] },
): Field {
	return {
		settings: null,
		children: null,
		system: false,
		...overrides,
	};
}

const schema: Schema = [
	makeField({
		field_type: "text",
		config: {
			name: "Title",
			api_accessor: "title",
			required: true,
			instructions: "",
		},
	}),
	makeField({
		field_type: "text",
		config: {
			name: "Description",
			api_accessor: "description",
			required: false,
			instructions: "",
		},
	}),
];

describe("EditDrawer", () => {
	it("should render when isOpen is true", () => {
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
			{ wrapper: Wrapper },
		);

		expect(screen.getByTestId("edit-drawer")).toBeInTheDocument();
	});

	it("should not render content when isOpen is false", () => {
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={false}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
			{ wrapper: Wrapper },
		);

		expect(screen.queryByTestId("edit-drawer")).not.toBeInTheDocument();
	});

	it("should show field labels from schema", () => {
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
			{ wrapper: Wrapper },
		);

		expect(screen.getByText("Title")).toBeInTheDocument();
		expect(screen.getByText("Description")).toBeInTheDocument();
	});

	it("should show custom title when provided", () => {
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
				title="Edit Record"
			/>,
			{ wrapper: Wrapper },
		);

		expect(screen.getByText("Edit Record")).toBeInTheDocument();
	});

	it("should call onClose when close button is clicked", async () => {
		const onClose = vi.fn();
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={onClose}
				onSave={vi.fn()}
			/>,
			{ wrapper: Wrapper },
		);

		// DrawerRoot renders a close trigger with aria-label matching closeLabel ("Cancel")
		const closeButton = screen.getByRole("button", { name: /cancel/i });
		fireEvent.click(closeButton);
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	it("should call onSave with form values when Save is clicked", async () => {
		const onSave = vi.fn();
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={onSave}
				initialValues={{ title: "Test", description: "Desc" }}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByText("Save"));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledOnce();
		});
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Test", description: "Desc" }),
		);
	});

	// A field component that renders the native `required` attribute, as every
	// real one does — anker's FormField passes `required` down to the control.
	// Without it the browser has nothing to validate and this whole hazard is
	// invisible, which is why it went unnoticed until now.
	function RequiredField({ field }: FieldProps) {
		const accessor = field.config.api_accessor;
		const {
			register,
			formState: { errors },
		} = useFormContext();
		// Shows the Schema's message the way anker's FormField does, so the
		// assertion below is "the form user was told what to fix" rather than
		// an internals check.
		const error = errors[accessor]?.message;
		return (
			<div data-testid={`field-${accessor}`}>
				<label>
					{field.config.name}
					<input required {...register(accessor)} />
				</label>
				{typeof error === "string" && <span>{error}</span>}
			</div>
		);
	}
	RequiredField.displayName = "RequiredField";

	const nativePlugins: FieldTypePlugin[] = plugins.map((plugin) =>
		plugin.id === "text"
			? {
					...plugin,
					fieldComponent: RequiredField,
					toZodType: () => z.string().min(1, "Title is required"),
				}
			: plugin,
	);

	it("validates through the Schema, not the browser, when a required field is empty", async () => {
		// The drawer owns this form, so the drawer is responsible for turning
		// native validation off. Left on, the browser intercepts the submit,
		// react-hook-form never runs, and the Schema's message never appears —
		// and on a tab SpecForm has hidden, a browser can't even focus the
		// offending control, so the save silently does nothing.
		const onSave = vi.fn();
		render(
			<EditDrawer
				schema={schema}
				plugins={nativePlugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={onSave}
				initialValues={{ title: "", description: "" }}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByText("Save"));

		expect(await screen.findByText("Title is required")).toBeInTheDocument();
		expect(onSave).not.toHaveBeenCalled();
	});

	it("should render Save button", () => {
		render(
			<EditDrawer
				schema={schema}
				plugins={plugins}
				isOpen={true}
				onClose={vi.fn()}
				onSave={vi.fn()}
			/>,
			{ wrapper: Wrapper },
		);

		expect(screen.getByText("Save")).toBeInTheDocument();
	});
});
