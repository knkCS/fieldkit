import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const dynamicModeField: Field = {
	field_type: "array",
	config: {
		name: "Metadata",
		api_accessor: "metadata",
		required: false,
		instructions: "Add key-value pairs",
	},
	settings: {
		mode: "dynamic",
	},
	children: null,
	system: false,
};

const keyedModeField: Field = {
	field_type: "array",
	config: {
		name: "Social Links",
		api_accessor: "social_links",
		required: false,
		instructions: "Fill in your social media profiles",
	},
	settings: {
		mode: "keyed",
		keys: ["twitter", "github", "linkedin", "website"],
	},
	children: null,
	system: false,
};

const prePopulatedField: Field = {
	field_type: "array",
	config: {
		name: "Environment Variables",
		api_accessor: "env_vars",
		required: false,
		instructions: "Pre-populated with common variables",
	},
	settings: {
		mode: "dynamic",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "array",
	config: {
		name: "Metadata",
		api_accessor: "metadata",
		required: false,
		instructions: "",
	},
	settings: {
		mode: "dynamic",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Array",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DynamicMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[dynamicModeField]}
			defaultValues={{ metadata: [] }}
		/>
	),
};

export const KeyedMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[keyedModeField]}
			defaultValues={{ social_links: {} }}
		/>
	),
};

export const PrePopulated: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[prePopulatedField]}
			defaultValues={{
				env_vars: [
					{ key: "NODE_ENV", value: "production" },
					{ key: "API_URL", value: "https://api.example.com" },
					{ key: "LOG_LEVEL", value: "info" },
				],
			}}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				metadata: [
					{ key: "author", value: "Jane Doe" },
					{ key: "version", value: "1.0.0" },
				],
			}}
			readOnly
		/>
	),
};
