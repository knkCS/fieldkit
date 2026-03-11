import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FieldKitProvider, FieldRenderer } from "../renderer";
import type { CellProps, FieldProps, FieldTypePlugin } from "../schema";
import {
	boolean,
	builtInFieldTypes,
	createRegistry,
	defineSpec,
	number,
	section,
	select,
	specToZodSchema,
	text,
} from "../schema";
import { SpecDataTable } from "../table";

function ChakraWrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

// ---------------------------------------------------------------------------
// Helpers: create test plugins that render real DOM elements
// ---------------------------------------------------------------------------

function makeTestPlugins(): FieldTypePlugin[] {
	return builtInFieldTypes.map((p) => ({
		...p,
		fieldComponent: ({ field }: FieldProps) => (
			<div data-testid={`field-${field.config.api_accessor}`}>
				{field.config.name}
			</div>
		),
		cellComponent: ({ field, value }: CellProps) => (
			<span data-testid={`cell-${field.config.api_accessor}`}>
				{value != null ? String(value) : ""}
			</span>
		),
	}));
}

// ---------------------------------------------------------------------------
// Test 1: Schema + Zod round trip (no rendering)
// ---------------------------------------------------------------------------

describe("Integration: Schema -> Zod -> validation", () => {
	it("should define a spec with correct fields and default values", () => {
		const spec = defineSpec([
			text("name", { required: true, placeholder: "Enter name" }),
			number("age"),
			boolean("active", { default_value: true }),
			select("role", { options: { admin: "Admin", user: "User" } }),
		]);

		expect(spec.fields).toHaveLength(4);
		expect(spec.defaultValues).toEqual({ active: true });

		expect(spec.fields[0].field_type).toBe("text");
		expect(spec.fields[0].config.api_accessor).toBe("name");
		expect(spec.fields[0].config.required).toBe(true);

		expect(spec.fields[1].field_type).toBe("number");
		expect(spec.fields[2].field_type).toBe("boolean");
		expect(spec.fields[3].field_type).toBe("select");
	});

	it("should generate a Zod schema that validates correct data", () => {
		const spec = defineSpec([
			text("name", { required: true }),
			number("age"),
			boolean("active", { default_value: true }),
			select("role", { options: { admin: "Admin", user: "User" } }),
		]);

		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes);

		const validResult = zodSchema.safeParse({
			name: "John",
			age: 30,
			active: true,
			role: "admin",
		});
		expect(validResult.success).toBe(true);
	});

	it("should reject invalid data (required field empty)", () => {
		const spec = defineSpec([text("name", { required: true }), number("age")]);

		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes);

		const invalidResult = zodSchema.safeParse({ name: "", age: 30 });
		expect(invalidResult.success).toBe(false);
	});

	it("should allow optional fields to be omitted", () => {
		const spec = defineSpec([
			text("name", { required: true }),
			number("age"),
			boolean("active"),
		]);

		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes);

		const result = zodSchema.safeParse({ name: "Jane" });
		expect(result.success).toBe(true);
	});

	it("should handle sections via defineSpec and flatten them", () => {
		const spec = defineSpec([
			section("Details", [text("title", { required: true }), number("count")]),
		]);

		// section() returns [sectionField, ...children], defineSpec flattens
		expect(spec.fields).toHaveLength(3);
		expect(spec.fields[0].field_type).toBe("section");
		expect(spec.fields[1].field_type).toBe("text");
		expect(spec.fields[2].field_type).toBe("number");

		// Zod schema should skip section fields
		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes);
		const result = zodSchema.safeParse({ title: "Hello", count: 5 });
		expect(result.success).toBe(true);
	});

	it("should support Zod overrides via options", () => {
		const spec = defineSpec([text("name", { required: true })]);

		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes, {
			overrides: {
				name: (base) => base.transform((v: unknown) => String(v).toUpperCase()),
			},
		});

		const result = zodSchema.safeParse({ name: "hello" });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe("HELLO");
		}
	});
});

// ---------------------------------------------------------------------------
// Test 2: Schema -> Renderer round trip
// ---------------------------------------------------------------------------

describe("Integration: Schema -> FieldRenderer", () => {
	it("should render fields from a spec using FieldRenderer", () => {
		const testPlugins = makeTestPlugins();

		const spec = defineSpec([
			text("title", { required: true }),
			number("count"),
		]);

		function TestForm() {
			const methods = useForm({ defaultValues: spec.defaultValues });
			return (
				<FormProvider {...methods}>
					<FieldKitProvider plugins={testPlugins}>
						<FieldRenderer schema={spec.fields} />
					</FieldKitProvider>
				</FormProvider>
			);
		}

		render(<TestForm />);

		expect(screen.getByTestId("field-title")).toBeInTheDocument();
		expect(screen.getByTestId("field-count")).toBeInTheDocument();
	});

	it("should not render hidden fields", () => {
		const testPlugins = makeTestPlugins();

		const spec = defineSpec([
			text("visible_field"),
			text("hidden_field", { hidden: true }),
		]);

		function TestForm() {
			const methods = useForm({ defaultValues: spec.defaultValues });
			return (
				<FormProvider {...methods}>
					<FieldKitProvider plugins={testPlugins}>
						<FieldRenderer schema={spec.fields} />
					</FieldKitProvider>
				</FormProvider>
			);
		}

		render(<TestForm />);

		expect(screen.getByTestId("field-visible_field")).toBeInTheDocument();
		expect(screen.queryByTestId("field-hidden_field")).not.toBeInTheDocument();
	});

	it("should show an error for unknown field types", () => {
		const testPlugins = makeTestPlugins();

		const unknownField = {
			field_type: "nonexistent_type",
			config: {
				name: "Mystery",
				api_accessor: "mystery",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		};

		function TestForm() {
			const methods = useForm();
			return (
				<FormProvider {...methods}>
					<FieldKitProvider plugins={testPlugins}>
						<FieldRenderer schema={[unknownField]} />
					</FieldKitProvider>
				</FormProvider>
			);
		}

		render(<TestForm />);

		const alert = screen.getByRole("alert");
		expect(alert).toBeInTheDocument();
		expect(alert.textContent).toContain("nonexistent_type");
	});

	it("should render with zodResolver integration", () => {
		const testPlugins = makeTestPlugins();

		const spec = defineSpec([
			text("email", { required: true }),
			boolean("agree"),
		]);

		const zodSchema = specToZodSchema(spec.fields, builtInFieldTypes);

		function TestForm() {
			const methods = useForm({
				defaultValues: spec.defaultValues,
				resolver: zodResolver(zodSchema),
			});
			return (
				<FormProvider {...methods}>
					<FieldKitProvider plugins={testPlugins}>
						<FieldRenderer schema={spec.fields} />
					</FieldKitProvider>
				</FormProvider>
			);
		}

		render(<TestForm />);

		expect(screen.getByTestId("field-email")).toBeInTheDocument();
		expect(screen.getByTestId("field-agree")).toBeInTheDocument();
	});

	it("should render loading state", () => {
		const testPlugins = makeTestPlugins();

		function TestForm() {
			const methods = useForm();
			return (
				<FormProvider {...methods}>
					<FieldKitProvider plugins={testPlugins}>
						<FieldRenderer schema={[]} loading />
					</FieldKitProvider>
				</FormProvider>
			);
		}

		render(<TestForm />);
		expect(screen.getByTestId("field-renderer-loading")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Test 3: Schema -> SpecDataTable round trip
// ---------------------------------------------------------------------------

describe("Integration: Schema -> SpecDataTable", () => {
	it("should render a table with columns from schema and data rows", () => {
		const testPlugins = makeTestPlugins();

		const spec = defineSpec([
			text("name", { required: true }),
			number("age"),
			boolean("active"),
		]);

		const data = [
			{ name: "Alice", age: 30, active: true },
			{ name: "Bob", age: 25, active: false },
		];

		render(
			<SpecDataTable schema={spec.fields} data={data} plugins={testPlugins} />,
			{ wrapper: ChakraWrapper },
		);

		const table = screen.getByTestId("spec-data-table");
		expect(table).toBeInTheDocument();

		// Check column headers
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("age")).toBeInTheDocument();
		expect(screen.getByText("active")).toBeInTheDocument();

		// Check cell data rendered via cellComponent
		expect(screen.getAllByTestId("cell-name")).toHaveLength(2);
		expect(screen.getAllByTestId("cell-age")).toHaveLength(2);
		expect(screen.getAllByTestId("cell-active")).toHaveLength(2);
	});

	it("should skip section fields in table columns", () => {
		const testPlugins = makeTestPlugins();

		const spec = defineSpec([
			section("Details", [text("title"), number("count")]),
		]);

		const data = [{ title: "Post 1", count: 10 }];

		render(
			<SpecDataTable schema={spec.fields} data={data} plugins={testPlugins} />,
			{ wrapper: ChakraWrapper },
		);

		// Section header should not appear as a column
		const sectionAccessor = `section_${"Details".toLowerCase().replace(/\s+/g, "_")}`;
		expect(screen.queryByText(sectionAccessor)).not.toBeInTheDocument();

		// Data columns should appear
		expect(screen.getByText("title")).toBeInTheDocument();
		expect(screen.getByText("count")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Test 4: Plugin registry round trip
// ---------------------------------------------------------------------------

describe("Integration: Plugin registry", () => {
	it("should register and retrieve all built-in plugins", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);

		expect(registry.getAll()).toHaveLength(builtInFieldTypes.length);

		for (const plugin of builtInFieldTypes) {
			expect(registry.get(plugin.id)).toBeDefined();
			expect(registry.get(plugin.id)?.id).toBe(plugin.id);
		}
	});

	it("should filter plugins by category", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);

		const textPlugins = registry.getByCategory("text");
		expect(textPlugins.length).toBeGreaterThan(0);
		for (const p of textPlugins) {
			expect(p.category).toBe("text");
		}
	});

	it("should filter plugins by context", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);

		const formPlugins = registry.getByContext("form");
		expect(formPlugins.length).toBeGreaterThan(0);
		for (const p of formPlugins) {
			expect(
				p.availableIn === undefined || p.availableIn.includes("form"),
			).toBe(true);
		}
	});

	it("should throw when registering a duplicate plugin", () => {
		const registry = createRegistry();
		registry.registerAll(builtInFieldTypes);

		expect(() => {
			registry.register(builtInFieldTypes[0]);
		}).toThrow(/already registered/);
	});
});
