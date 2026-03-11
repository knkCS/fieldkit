import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const booleanField: Field = {
	field_type: "boolean",
	config: {
		name: "Published",
		api_accessor: "published",
		required: false,
		instructions: "Toggle to publish this entry",
	},
	settings: null,
	children: null,
	system: false,
};

const withHelperTextField: Field = {
	field_type: "boolean",
	config: {
		name: "Send Notifications",
		api_accessor: "send_notifications",
		required: false,
		instructions: "When enabled, subscribers will receive an email notification when this entry is published.",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "boolean",
	config: {
		name: "Published",
		api_accessor: "published",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Boolean",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultOff: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[booleanField]}
			defaultValues={{ published: false }}
		/>
	),
};

export const DefaultOn: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[booleanField]}
			defaultValues={{ published: true }}
		/>
	),
};

export const WithHelperText: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withHelperTextField]}
			defaultValues={{ send_notifications: false }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ published: true }}
			readOnly
		/>
	),
};
