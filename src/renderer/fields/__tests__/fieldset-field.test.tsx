import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldsetSettings } from "../../../schema/field-types/fieldset";
import { fieldsetPlugin } from "../../../schema/field-types/fieldset";
import { textPlugin } from "../../../schema/field-types/text";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { FieldsetField } from "../fieldset-field";
import { TextField } from "../text-field";

function textField(name: string, accessor: string): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

const addressFields: Field[] = [
	textField("Street", "street"),
	textField("City", "city"),
];

function fieldsetField(
	settings: FieldsetSettings | null = { blueprint: "address_bp" },
	children: Field[] | null = null,
): Field<FieldsetSettings> {
	return {
		field_type: "fieldset",
		config: {
			name: "Address",
			api_accessor: "address",
			required: false,
			instructions: "The delivery address",
		},
		settings,
		children,
		system: false,
	};
}

function blueprintAdapter(fields: Field[] = addressFields) {
	return {
		getSchema: vi.fn().mockResolvedValue(fields),
		getData: vi
			.fn()
			.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 }),
	};
}

function Wrapper({
	children,
	adapters = {},
	defaultValues = {},
	onSubmit,
}: {
	children: ReactNode;
	adapters?: FieldKitAdapters;
	defaultValues?: Record<string, unknown>;
	onSubmit?: (data: Record<string, unknown>) => void;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider
				plugins={[textPlugin, fieldsetPlugin]}
				adapters={adapters}
			>
				<FormProvider {...methods}>
					<form
						onSubmit={methods.handleSubmit((data) => {
							onSubmit?.(data);
						})}
					>
						{children}
						<button type="submit">Submit</button>
					</form>
				</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("FieldsetField", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the blueprint's fields inline", async () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper adapters={{ blueprint: adapter }}>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		expect(await screen.findByLabelText(/Street/)).toBeInTheDocument();
		expect(screen.getByLabelText(/City/)).toBeInTheDocument();
		expect(adapter.getSchema).toHaveBeenCalledWith("address_bp");
	});

	it("renders its own label and instructions", async () => {
		render(
			<Wrapper adapters={{ blueprint: blueprintAdapter() }}>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		expect(await screen.findByText(/Address/)).toBeInTheDocument();
		expect(screen.getByText("The delivery address")).toBeInTheDocument();
	});

	it("nests child values under the fieldset's accessor", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<Wrapper
				adapters={{ blueprint: blueprintAdapter() }}
				defaultValues={{ address: {} }}
				onSubmit={onSubmit}
			>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		await user.type(await screen.findByLabelText(/Street/), "12 Bridge Lane");
		await user.type(screen.getByLabelText(/City/), "Ely");
		await user.click(screen.getByRole("button", { name: "Submit" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			address: { street: "12 Bridge Lane", city: "Ely" },
		});
	});

	it("prefers children that are already resolved over fetching them", async () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper adapters={{ blueprint: adapter }}>
				<FieldsetField
					field={fieldsetField({ blueprint: "address_bp" }, addressFields)}
				/>
			</Wrapper>,
		);

		expect(await screen.findByLabelText(/Street/)).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("renders the adapter-not-configured stub, leaving the rest of the form working", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<Wrapper defaultValues={{ notes: "" }} onSubmit={onSubmit}>
				<FieldsetField field={fieldsetField()} />
				<TextField field={textField("Notes", "notes")} />
			</Wrapper>,
		);

		expect(
			screen.getByText("Blueprint adapter not configured"),
		).toBeInTheDocument();

		await user.type(screen.getByLabelText(/Notes/), "still typing");
		await user.click(screen.getByRole("button", { name: "Submit" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ notes: "still typing" });
	});

	it("says so plainly when no blueprint is selected", () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper adapters={{ blueprint: adapter }}>
				<FieldsetField field={fieldsetField({})} />
			</Wrapper>,
		);

		expect(screen.getByText("No blueprint selected")).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("surfaces an adapter failure rather than rendering empty", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failing = {
			getSchema: vi.fn().mockRejectedValue(new Error("Network error")),
			getData: vi.fn().mockRejectedValue(new Error("Network error")),
		};
		render(
			<Wrapper adapters={{ blueprint: failing }}>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		expect(
			await screen.findByText("Failed to load blueprint fields"),
		).toBeInTheDocument();
	});

	it("says a blueprint has no fields rather than rendering an empty frame", async () => {
		render(
			<Wrapper adapters={{ blueprint: blueprintAdapter([]) }}>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		expect(
			await screen.findByText("This blueprint has no fields"),
		).toBeInTheDocument();
	});

	it("collapses and expands when the author marked it collapsible", async () => {
		const user = userEvent.setup();
		render(
			<Wrapper adapters={{ blueprint: blueprintAdapter() }}>
				<FieldsetField
					field={fieldsetField({ blueprint: "address_bp", collapsible: true })}
				/>
			</Wrapper>,
		);

		const street = await screen.findByLabelText(/Street/);
		expect(street).toBeVisible();

		await user.click(screen.getByRole("button", { name: "Collapse Address" }));
		expect(street).not.toBeVisible();

		await user.click(screen.getByRole("button", { name: "Expand Address" }));
		expect(street).toBeVisible();
	});

	it("keeps a collapsed fieldset's values in the form", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(
			<Wrapper
				adapters={{ blueprint: blueprintAdapter() }}
				defaultValues={{ address: {} }}
				onSubmit={onSubmit}
			>
				<FieldsetField
					field={fieldsetField({ blueprint: "address_bp", collapsible: true })}
				/>
			</Wrapper>,
		);

		await user.type(await screen.findByLabelText(/Street/), "12 Bridge Lane");
		await user.click(screen.getByRole("button", { name: "Collapse Address" }));
		await user.click(screen.getByRole("button", { name: "Submit" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			address: { street: "12 Bridge Lane" },
		});
	});

	it("is always open when it is not collapsible", async () => {
		render(
			<Wrapper adapters={{ blueprint: blueprintAdapter() }}>
				<FieldsetField field={fieldsetField()} />
			</Wrapper>,
		);

		expect(await screen.findByLabelText(/Street/)).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /Collapse|Expand/ }),
		).not.toBeInTheDocument();
	});

	it("renders its children read-only when the form is read-only", async () => {
		render(
			<Wrapper adapters={{ blueprint: blueprintAdapter() }}>
				<FieldsetField field={fieldsetField()} readOnly />
			</Wrapper>,
		);

		expect(await screen.findByLabelText(/Street/)).toHaveAttribute("readonly");
	});

	it("has displayName", () => {
		expect(FieldsetField.displayName).toBe("FieldsetField");
	});
});
