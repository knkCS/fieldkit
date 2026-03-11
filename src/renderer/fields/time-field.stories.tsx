import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTimeField: Field = {
	field_type: "time",
	config: {
		name: "Start Time",
		api_accessor: "start_time",
		required: false,
		instructions: "Select a start time",
	},
	settings: null,
	children: null,
	system: false,
};

const requiredTimeField: Field = {
	field_type: "time",
	config: {
		name: "Deadline",
		api_accessor: "deadline",
		required: true,
		instructions: "A deadline time is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "time",
	config: {
		name: "Start Time",
		api_accessor: "start_time",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Time",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTimeField]}
			defaultValues={{ start_time: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredTimeField]}
			defaultValues={{ deadline: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ start_time: "14:30" }}
			readOnly
		/>
	),
};
