import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { Field } from "../../schema/types";
import { countOutlineNodes, OutlineTreeCell, OutlineTreeField } from "..";

const outline: Field = {
	field_type: "outline_tree",
	config: {
		name: "Outline",
		api_accessor: "outline",
		required: false,
		instructions: "",
	},
	settings: { blueprint: "outline-bp@1" },
	system: false,
};

const tree = [
	{
		_id: "n1",
		children: [{ _id: "n2" }, { _id: "n3", children: [{ _id: "n4" }] }],
	},
	{ _id: "n5" },
];

function Form({ value }: { value: unknown }) {
	const methods = useForm({ defaultValues: { outline: value } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<OutlineTreeField field={outline} />
			</FormProvider>
		</ChakraProvider>
	);
}

describe("outline_tree's stopgap UI", () => {
	it("counts every node at every level", () => {
		expect(countOutlineNodes(tree)).toBe(5);
		expect(countOutlineNodes({ _id: "n1" })).toBe(0);
	});

	it("shows how many nodes the outline holds, read-only", () => {
		render(<Form value={tree} />);
		expect(screen.getByText("Outline")).toBeDefined();
		expect(screen.getByText("5 nodes")).toBeDefined();
	});

	it("says so when there are none", () => {
		render(<Form value={[]} />);
		expect(screen.getByText("No nodes")).toBeDefined();
	});

	it("counts nodes in a table cell", () => {
		render(<OutlineTreeCell field={outline} value={tree} />);
		expect(screen.getByText("5 nodes")).toBeDefined();
	});
});
