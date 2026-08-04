import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { getDefaultValues, specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { GroupField } from "../group-field";

const textPlugin = {
	id: "text",
	name: "Text",
	description: "A text field",
	icon: () => null,
	category: "text" as const,
	fieldComponent: ({ field }: { field: Field }) => (
		<input data-testid={`text-${field.config.api_accessor}`} />
	),
	toZodType: () => {
		const { z } = require("zod");
		return z.string();
	},
};

/**
 * Module-level render counter keyed by api_accessor, used to prove that
 * unrelated group items do not re-render when a sibling item is added.
 */
const probeRenderCounts: Record<string, number> = {};

function ProbeField({ field }: { field: Field }) {
	const accessor = field.config.api_accessor;
	probeRenderCounts[accessor] = (probeRenderCounts[accessor] ?? 0) + 1;
	return <input data-testid={`probe-${accessor}`} />;
}

const probePlugin = {
	id: "probe",
	name: "Probe",
	description: "Counts renders for memoization assertions",
	icon: () => null,
	category: "text" as const,
	fieldComponent: ProbeField,
	toZodType: () => {
		const { z } = require("zod");
		return z.string();
	},
};

function Wrapper({
	children,
	defaultValues = { items: [] },
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[textPlugin, probePlugin]}>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("GroupField", () => {
	const childFields: Field[] = [
		{
			field_type: "text",
			config: {
				name: "Name",
				api_accessor: "name",
				required: true,
				instructions: "",
			},
			children: null,
			system: false,
		},
	];

	const field: Field = {
		field_type: "group",
		config: {
			name: "Team Members",
			api_accessor: "items",
			required: false,
			instructions: "Add team members",
		},
		settings: {},
		children: childFields,
		system: false,
	};

	it("renders empty state when no items exist", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("No items added yet.")).toBeInTheDocument();
	});

	it("renders Add item button when not readOnly", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: /Add item/ }),
		).toBeInTheDocument();
	});

	it("hides Add item button when readOnly", () => {
		render(
			<Wrapper>
				<GroupField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByRole("button", { name: /Add item/ }),
		).not.toBeInTheDocument();
	});

	it("renders existing items with item labels", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText("Item 1")).toBeInTheDocument();
		expect(screen.getByText("Item 2")).toBeInTheDocument();
	});

	it("renders nested fields via FieldRenderer", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		// FieldRenderer renders each child field through FieldComponent
		expect(screen.getByTestId("field-renderer")).toBeInTheDocument();
	});

	it("hides remove buttons when readOnly", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByRole("button", { name: /Remove item/ }),
		).not.toBeInTheDocument();
	});

	it("shows remove buttons for each item", () => {
		render(
			<Wrapper
				defaultValues={{
					items: [{ name: "Alice" }, { name: "Bob" }],
				}}
			>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: "Remove item 1" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove item 2" }),
		).toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper>
				<GroupField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Team Members/)).toBeInTheDocument();
		expect(screen.getByText("Add team members")).toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(GroupField.displayName).toBe("GroupField");
	});

	it("seeds an added row with its children's value defaults", async () => {
		// #38's reasoning, one level down: zod rejects `undefined` for a
		// required boolean but accepts `false`, so a row appended as `{}` was
		// unsubmittable no matter what the form user did — nothing in the UI
		// turns an untouched switch into a value. Now that rows validate
		// (ADR-0007), that gap is a dead end rather than a curiosity.
		const user = userEvent.setup();
		const onSubmit = vi.fn();

		const spec: Field[] = [
			{
				field_type: "group",
				config: {
					name: "Team Members",
					api_accessor: "items",
					required: false,
					instructions: "",
				},
				settings: {},
				children: [
					{
						field_type: "text",
						config: {
							name: "Note",
							api_accessor: "note",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
					{
						field_type: "boolean",
						config: {
							name: "Active",
							api_accessor: "active",
							required: true,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
				],
				system: false,
			},
		];

		function Harness() {
			const methods = useForm({
				defaultValues: getDefaultValues(spec, builtInFieldTypes),
				resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
			});
			return (
				<ChakraProvider value={defaultSystem}>
					<FieldKitProvider plugins={builtInFieldTypes}>
						<FormProvider {...methods}>
							<form noValidate onSubmit={methods.handleSubmit(onSubmit)}>
								<GroupField field={spec[0]} />
								<button type="submit">Save</button>
							</form>
						</FormProvider>
					</FieldKitProvider>
				</ChakraProvider>
			);
		}

		render(<Harness />);

		await user.click(screen.getByRole("button", { name: /Add item/ }));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toEqual({
			items: [{ note: "", active: false }],
		});
	});

	it("does not re-render existing items' fields when a new item is added", async () => {
		const user = userEvent.setup();
		for (const key of Object.keys(probeRenderCounts)) {
			delete probeRenderCounts[key];
		}

		const probeChildFields: Field[] = [
			{
				field_type: "probe",
				config: {
					name: "Name",
					api_accessor: "name",
					required: true,
					instructions: "",
				},
				children: null,
				system: false,
			},
		];

		const probeField: Field = {
			field_type: "group",
			config: {
				name: "Team Members",
				api_accessor: "items",
				required: false,
				instructions: "",
			},
			settings: {},
			children: probeChildFields,
			system: false,
		};

		render(
			<Wrapper defaultValues={{ items: [{ name: "Alice" }, { name: "Bob" }] }}>
				<GroupField field={probeField} />
			</Wrapper>,
		);

		const before0 = probeRenderCounts["items.0.name"];
		const before1 = probeRenderCounts["items.1.name"];
		expect(before0).toBeGreaterThan(0);
		expect(before1).toBeGreaterThan(0);

		await user.click(screen.getByRole("button", { name: /Add item/ }));

		// A third item (items.2.name) is now mounted, but the two pre-existing
		// items' nested fields must not re-render — their schema objects
		// (and thus the FieldComponent memo's identity check) must be stable.
		expect(probeRenderCounts["items.0.name"]).toBe(before0);
		expect(probeRenderCounts["items.1.name"]).toBe(before1);
	});
});
