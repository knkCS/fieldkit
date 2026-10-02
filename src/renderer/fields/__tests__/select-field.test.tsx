import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { selectPlugin } from "../../../schema/field-types/select";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { SelectField } from "../select-field";

/** Renders the form's current values, so a test reads what the control
 * stored rather than what it shows. */
function Values() {
	const { watch } = useFormContext();
	return <output data-testid="values">{JSON.stringify(watch())}</output>;
}

function Wrapper({
	children,
	defaultValues = { category: "" },
	fields,
	onSubmit,
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
	fields?: Field[];
	onSubmit?: (values: Record<string, unknown>) => void;
}) {
	const methods = useForm({
		defaultValues,
		resolver: fields
			? zodResolver(specToZodSchema(fields, [selectPlugin]))
			: undefined,
	});
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<form
					noValidate
					onSubmit={methods.handleSubmit((values) => onSubmit?.(values))}
				>
					{children}
					<Values />
					<button type="submit">Save</button>
				</form>
			</FormProvider>
		</ChakraProvider>
	);
}

function values(): Record<string, unknown> {
	return JSON.parse(screen.getByTestId("values").textContent ?? "{}");
}

/** Opens the select's menu the way a keyboard does. */
function openMenu(label: RegExp) {
	fireEvent.keyDown(screen.getByLabelText(label), { key: "ArrowDown" });
}

/** Empties a single select the way a keyboard does. */
function clear(label: RegExp) {
	fireEvent.keyDown(screen.getByLabelText(label), { key: "Backspace" });
}

describe("SelectField", () => {
	const singleField: Field = {
		field_type: "select",
		config: {
			name: "Category",
			api_accessor: "category",
			required: false,
			instructions: "Pick a category",
		},
		settings: {
			options: { news: "News", blog: "Blog", tutorial: "Tutorial" },
		},
		children: null,
		system: false,
	};

	const multiField: Field = {
		field_type: "select",
		config: {
			name: "Tags",
			api_accessor: "tags",
			required: false,
			instructions: "",
		},
		settings: {
			options: { js: "JavaScript", ts: "TypeScript", py: "Python" },
			multiple: true,
		},
		children: null,
		system: false,
	};

	const emptyField: Field = {
		field_type: "select",
		config: {
			name: "Empty",
			api_accessor: "empty",
			required: false,
			instructions: "",
		},
		settings: { options: {} },
		children: null,
		system: false,
	};

	it("draws a BaseSelect combobox, never a native select (#314)", () => {
		const { container } = render(
			<Wrapper defaultValues={{ category: "", tags: [] }}>
				<SelectField field={singleField} />
				<SelectField field={multiField} />
			</Wrapper>,
		);
		expect(container.querySelector("select")).toBeNull();
		expect(screen.getByRole("combobox", { name: /Category/ })).toBeVisible();
		expect(screen.getByRole("combobox", { name: /Tags/ })).toBeVisible();
	});

	it("offers the options' labels and stores the picked key", () => {
		render(
			<Wrapper>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		openMenu(/Category/);
		expect(screen.getByText("News")).toBeInTheDocument();
		expect(screen.getByText("Tutorial")).toBeInTheDocument();
		fireEvent.click(screen.getByText("Blog"));
		expect(values().category).toBe("blog");
	});

	it("shows a stored key by its label", () => {
		render(
			<Wrapper defaultValues={{ category: "tutorial" }}>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		expect(screen.getByText("Tutorial")).toBeInTheDocument();
	});

	it("links helper text from instructions to the control", () => {
		render(
			<Wrapper>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		const helper = screen.getByText("Pick a category");
		const input = screen.getByRole("combobox", { name: /Category/ });
		expect(input.getAttribute("aria-describedby") ?? "").toContain(helper.id);
	});

	it("stores several keys as an array when multiple", () => {
		render(
			<Wrapper defaultValues={{ tags: [] }}>
				<SelectField field={multiField} />
			</Wrapper>,
		);
		openMenu(/Tags/);
		fireEvent.click(screen.getByText("JavaScript"));
		openMenu(/Tags/);
		fireEvent.click(screen.getByText("Python"));
		expect(values().tags).toEqual(["js", "py"]);
	});

	it("handles empty options", () => {
		render(
			<Wrapper defaultValues={{ empty: "" }}>
				<SelectField field={emptyField} />
			</Wrapper>,
		);
		expect(screen.getByLabelText(/Empty/)).toBeInTheDocument();
	});

	it("cannot be changed when readOnly, single or multiple", () => {
		render(
			<Wrapper defaultValues={{ category: "", tags: [] }}>
				<SelectField field={singleField} readOnly />
				<SelectField field={multiField} readOnly />
			</Wrapper>,
		);
		expect(screen.getByLabelText(/Category/)).toBeDisabled();
		expect(screen.getByLabelText(/Tags/)).toBeDisabled();
	});

	it("submits a cleared optional select as absent, as before", async () => {
		let submitted: Record<string, unknown> | undefined;
		render(
			<Wrapper
				defaultValues={{ category: "news" }}
				fields={[singleField]}
				onSubmit={(v) => {
					submitted = v;
				}}
			>
				<SelectField field={singleField} />
			</Wrapper>,
		);
		clear(/Category/);
		expect(values().category).toBeNull();
		fireEvent.click(screen.getByText("Save"));
		await waitFor(() => expect(submitted).toEqual({}));
	});

	it("reports a cleared required select with its own message", async () => {
		const required: Field = {
			...singleField,
			config: { ...singleField.config, required: true },
		};
		render(
			<Wrapper defaultValues={{ category: "news" }} fields={[required]}>
				<SelectField field={required} />
			</Wrapper>,
		);
		clear(/Category/);
		fireEvent.click(screen.getByText("Save"));
		expect(await screen.findByText("Category is required")).toBeVisible();
	});

	it("has displayName", () => {
		expect(SelectField.displayName).toBe("SelectField");
	});
});
