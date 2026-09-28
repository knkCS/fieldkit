import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react";
import { FormProvider, useForm } from "react-hook-form";
import type { Field } from "../../schema/types";
import { OutlineTreeCell, OutlineTreeField } from "./outline-tree-view";

const outline: Field = {
	field_type: "outline_tree",
	config: {
		name: "Outline",
		api_accessor: "outline",
		required: false,
		instructions:
			"Edited in the publishing service until the outline editor is ported",
	},
	settings: { blueprint: "outline-bp@1", text_type: "article@1" },
	children: null,
	system: false,
};

const tree = [
	{
		_id: "n1",
		values: { kind: "part", title: "Part One" },
		children: [
			{ _id: "n2", values: { kind: "chapter", title: "Beginnings" } },
			{ _id: "n3", values: { kind: "chapter", title: "Middles" } },
		],
	},
	{ _id: "n4", values: { kind: "part", title: "Part Two" } },
];

function Form({ value }: { value: unknown }) {
	const methods = useForm({ defaultValues: { outline: value } });
	return (
		<FormProvider {...methods}>
			<Box maxW="md">
				<OutlineTreeField field={outline} />
			</Box>
		</FormProvider>
	);
}

const meta = {
	title: "Publishing/Outline Tree",
	component: Form,
	parameters: { layout: "padded" },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithNodes: Story = { args: { value: tree } };

export const Empty: Story = { args: { value: [] } };

export const Cell: Story = {
	args: { value: tree },
	render: ({ value }) => <OutlineTreeCell field={outline} value={value} />,
};
