import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultDateField: Field = {
	field_type: "date",
	config: {
		name: "Publish Date",
		api_accessor: "publish_date",
		required: false,
		instructions: "Select a publish date",
	},
	settings: null,
	children: null,
	system: false,
};

const withMinMaxDateField: Field = {
	field_type: "date",
	config: {
		name: "Event Date",
		api_accessor: "event_date",
		required: false,
		instructions: "Must be within the next year",
	},
	settings: {
		min_date: "2026-01-01",
		max_date: "2026-12-31",
	},
	children: null,
	system: false,
};

const requiredDateField: Field = {
	field_type: "date",
	config: {
		name: "Start Date",
		api_accessor: "start_date",
		required: true,
		instructions: "A start date is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "date",
	config: {
		name: "Publish Date",
		api_accessor: "publish_date",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Date",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultDateField]}
			defaultValues={{ publish_date: "" }}
		/>
	),
};

export const WithMinMaxDate: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withMinMaxDateField]}
			defaultValues={{ event_date: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredDateField]}
			defaultValues={{ start_date: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ publish_date: "2026-03-15" }}
			readOnly
		/>
	),
};
