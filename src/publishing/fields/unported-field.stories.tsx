import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react";
import { FormProvider, useForm } from "react-hook-form";
import type { Field } from "../../schema/types";
import { UnportedField } from "./unported-field";

const title: Field = {
	field_type: "manipulation_tree",
	config: {
		name: "Composition",
		api_accessor: "composition",
		required: false,
		instructions:
			"Edited in the publishing service until the manipulation tree is ported",
	},
	settings: {},
	children: null,
	system: false,
};

const tree = [
	{
		_id: "i1",
		id: "law-1",
		intent: "include",
		pin: "r1",
		children: [
			{ _id: "x1", id: "para-3", intent: "exclude" },
			{
				_id: "a1",
				id: "para-4",
				intent: "annotate",
				values: { redtitel: "Neu gefasst" },
			},
			{ _id: "r1", id: "para-5", intent: "replace", with: { id: "na-1" } },
		],
	},
];

function Form({ value }: { value: unknown }) {
	const methods = useForm({ defaultValues: { composition: value } });
	return (
		<FormProvider {...methods}>
			<Box maxW="md">
				<UnportedField field={title} />
			</Box>
		</FormProvider>
	);
}

const meta = {
	title: "Publishing/Unported Field",
	component: Form,
	parameters: { layout: "padded" },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManipulationTree: Story = { args: { value: tree } };

export const Empty: Story = { args: { value: undefined } };
