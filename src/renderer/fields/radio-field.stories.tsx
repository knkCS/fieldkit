import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultRadioField: Field = {
	field_type: "radio",
	config: {
		name: "Priority",
		api_accessor: "priority",
		required: false,
		instructions: "Select a priority level",
	},
	settings: {
		options: {
			low: "Low",
			medium: "Medium",
			high: "High",
		},
	},
	children: null,
	system: false,
};

const manyOptionsField: Field = {
	field_type: "radio",
	config: {
		name: "Department",
		api_accessor: "department",
		required: false,
		instructions: "Select your department",
	},
	settings: {
		options: {
			engineering: "Engineering",
			design: "Design",
			marketing: "Marketing",
			sales: "Sales",
			hr: "Human Resources",
			finance: "Finance",
			legal: "Legal",
			operations: "Operations",
		},
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "radio",
	config: {
		name: "Plan",
		api_accessor: "plan",
		required: true,
		instructions: "You must select a plan",
	},
	settings: {
		options: {
			free: "Free",
			pro: "Pro",
			enterprise: "Enterprise",
		},
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "radio",
	config: {
		name: "Priority",
		api_accessor: "priority",
		required: false,
		instructions: "",
	},
	settings: {
		options: {
			low: "Low",
			medium: "Medium",
			high: "High",
		},
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Radio",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultRadioField]}
			defaultValues={{ priority: "" }}
		/>
	),
};

export const ManyOptions: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[manyOptionsField]}
			defaultValues={{ department: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper fields={[requiredField]} defaultValues={{ plan: "" }} />
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ priority: "medium" }}
			readOnly
		/>
	),
};
