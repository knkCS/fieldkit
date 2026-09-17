import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { numberPlugin } from "../../../schema/field-types/number";
import { textPlugin } from "../../../schema/field-types/text";
import type { VirtualTableSettings } from "../../../schema/field-types/virtual-table";
import { virtualTablePlugin } from "../../../schema/field-types/virtual-table";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { VirtualTableField } from "../virtual-table-field";

function column(fieldType: string, name: string, accessor: string): Field {
	return {
		field_type: fieldType,
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		children: null,
		system: false,
	};
}

/** A neutral line-items Row Spec: what a row of an order table holds. */
const ROW_SPEC: Field[] = [
	column("text", "Description", "description"),
	column("number", "Quantity", "quantity"),
];

function lineItems(
	settings: VirtualTableSettings | null,
	children: Field[] | null,
): Field<VirtualTableSettings> {
	return {
		field_type: "virtual_table",
		config: {
			name: "Line items",
			api_accessor: "line_items",
			required: false,
			instructions: "",
		},
		settings,
		children,
		system: false,
	};
}

function blueprintAdapter(fields: Field[] = ROW_SPEC) {
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
}: {
	children: ReactNode;
	adapters?: FieldKitAdapters;
	defaultValues?: Record<string, unknown>;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider
				plugins={[textPlugin, numberPlugin, virtualTablePlugin]}
				adapters={adapters}
			>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("VirtualTableField", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("draws its columns from an embedded Row Spec, fetching nothing", () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{
					line_items: [{ description: "Binding", quantity: 3 }],
				}}
			>
				<VirtualTableField field={lineItems({}, ROW_SPEC)} />
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(screen.getByText("Quantity")).toBeInTheDocument();
		expect(screen.getByText("Binding")).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("draws its columns from a linked Row Spec `resolveSpec()` already resolved", () => {
		// The resolved shape: a Blueprint named AND its Fields in `children`.
		// The renderer reads the children and asks the adapter for nothing.
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, ROW_SPEC)}
				/>
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(adapter.getSchema).not.toHaveBeenCalled();
	});

	it("self-resolves a linked Row Spec for display when the Consumer skipped resolveSpec()", async () => {
		const adapter = blueprintAdapter();
		render(
			<Wrapper
				adapters={{ blueprint: adapter }}
				defaultValues={{ line_items: [] }}
			>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, null)}
				/>
			</Wrapper>,
		);

		expect(await screen.findByText("Description")).toBeInTheDocument();
		expect(adapter.getSchema).toHaveBeenCalledWith("line_item_bp");
	});

	it("renders an embedded Row Spec with no blueprint adapter configured", () => {
		// The whole point of the embedded half: a Consumer without Blueprints
		// still gets a working table (ADR-0017).
		render(
			<Wrapper defaultValues={{ line_items: [{ description: "Cover" }] }}>
				<VirtualTableField field={lineItems({}, ROW_SPEC)} />
			</Wrapper>,
		);

		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(
			screen.queryByText("Blueprint adapter not configured"),
		).not.toBeInTheDocument();
	});

	it("says so when a linked Row Spec has no adapter to resolve it", () => {
		render(
			<Wrapper defaultValues={{ line_items: [] }}>
				<VirtualTableField
					field={lineItems({ blueprint: "line_item_bp" }, null)}
				/>
			</Wrapper>,
		);

		expect(
			screen.getByText("Blueprint adapter not configured"),
		).toBeInTheDocument();
	});

	it("counts the rows it is holding", () => {
		render(
			<Wrapper
				defaultValues={{
					line_items: [{ description: "Binding" }, { description: "Cover" }],
				}}
			>
				<VirtualTableField field={lineItems({}, ROW_SPEC)} />
			</Wrapper>,
		);

		expect(screen.getByText(/2 records/)).toBeInTheDocument();
	});
});
