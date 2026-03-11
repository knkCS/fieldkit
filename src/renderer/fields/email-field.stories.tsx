import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultEmailField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: false,
		instructions: "Enter your email address",
	},
	settings: {
		placeholder: "you@example.com",
	},
	children: null,
	system: false,
};

const requiredEmailField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: true,
		instructions: "A valid email address is required",
	},
	settings: {
		placeholder: "you@example.com",
	},
	children: null,
	system: false,
};

const optionalEmailField: Field = {
	field_type: "email",
	config: {
		name: "Secondary Email",
		api_accessor: "secondary_email",
		required: false,
		instructions: "Optional backup email",
	},
	settings: {
		placeholder: "backup@example.com",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Email",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultEmailField]}
			defaultValues={{ email: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredEmailField]}
			defaultValues={{ email: "" }}
		/>
	),
};

export const Optional: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[optionalEmailField]}
			defaultValues={{ secondary_email: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ email: "user@example.com" }}
			readOnly
		/>
	),
};
