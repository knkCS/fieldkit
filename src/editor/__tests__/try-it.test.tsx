// src/editor/__tests__/try-it.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { toaster } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FieldKitProvider } from "../../renderer/provider";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { TryItView } from "../try-it-view";

// Mock only the `toaster` export — SpecForm imports `Tabs` from the same
// module, so the rest must pass through untouched via importOriginal.
vi.mock("@knkcs/anker/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcs/anker/primitives")>();
	return { ...actual, toaster: { create: vi.fn() } };
});

function makeField(accessor: string, name: string, required = false): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required, instructions: "" },
		settings: null,
		system: false,
	};
}

function makeSection(accessor: string, name: string): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

// A registered input (unlike editor-helpers' TestField) so fireEvent.change
// actually drives react-hook-form state, and a toZodType that honors
// `config.required` (unlike editor-helpers' plain `z.string()`) so a
// required-empty submit actually fails validation.
function TestField({ field }: FieldProps) {
	const { register } = useFormContext();
	return (
		<input
			data-testid={`field-${field.config.api_accessor}`}
			aria-label={field.config.name}
			{...register(field.config.api_accessor)}
		/>
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
		toZodType: (field) =>
			field.config.required ? z.string().min(1) : z.string(),
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

const LABELS = {
	testSubmit: "Test submit",
	testSubmitSuccess: "Form submitted successfully",
};

function Wrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={plugins}>{children}</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("TryItView", () => {
	it("renders the real SpecForm fields interactively, not an inert preview", () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("title", "Title"),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		const input = screen.getByTestId("field-title");
		// EditorCanvas's FieldShell wraps previews in `inert` — Try-it must NOT
		// reuse that path; it renders the real, interactive SpecForm.
		expect(input.closest("[inert]")).toBeNull();

		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");
	});

	it("shows the tab error badge when a required field is submitted empty", async () => {
		// Two tabs (like SpecForm's own submit-jump tests) so the failed
		// submit's jump-to-error-tab effect actually switches tabs, rather
		// than a same-tab no-op jump on a single-tab partition.
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("name", "Name"),
			makeSection("s2", "Details"),
			makeField("title", "Title", true),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		fireEvent.click(screen.getByRole("button", { name: LABELS.testSubmit }));

		await waitFor(() => {
			expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();
		});
		expect(toaster.create).not.toHaveBeenCalled();
	});

	it("calls toaster.create with the success message on a valid submit", async () => {
		const schema: Schema = [
			makeSection("s1", "General"),
			makeField("name", "Name"),
			makeSection("s2", "Details"),
			makeField("title", "Title", true),
		];
		render(
			<Wrap>
				<TryItView schema={schema} plugins={plugins} labels={LABELS} />
			</Wrap>,
		);

		// "title" lives on the inactive "Details" tab; SpecForm keeps every
		// panel mounted (just hidden), so it's still reachable and typable
		// without first switching tabs.
		fireEvent.change(screen.getByTestId("field-title"), {
			target: { value: "Hello" },
		});
		fireEvent.click(screen.getByRole("button", { name: LABELS.testSubmit }));

		await waitFor(() => {
			expect(toaster.create).toHaveBeenCalledWith({
				title: LABELS.testSubmitSuccess,
				type: "success",
			});
		});
		expect(screen.queryByTestId(/tab-errors-/)).not.toBeInTheDocument();
	});
});
