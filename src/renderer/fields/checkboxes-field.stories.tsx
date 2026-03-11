import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultCheckboxesField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Interests",
		api_accessor: "interests",
		required: false,
		instructions: "Select your interests",
	},
	settings: {
		options: {
			sports: "Sports",
			music: "Music",
			travel: "Travel",
			cooking: "Cooking",
		},
	},
	children: null,
	system: false,
};

const preSelectedField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Notifications",
		api_accessor: "notifications",
		required: false,
		instructions: "Choose which notifications to receive",
	},
	settings: {
		options: {
			email: "Email notifications",
			sms: "SMS notifications",
			push: "Push notifications",
			in_app: "In-app notifications",
		},
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Terms",
		api_accessor: "terms",
		required: true,
		instructions: "You must accept at least one agreement",
	},
	settings: {
		options: {
			tos: "Terms of Service",
			privacy: "Privacy Policy",
			marketing: "Marketing Communications",
		},
	},
	children: null,
	system: false,
};

const manyOptionsField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Tags",
		api_accessor: "tags",
		required: false,
		instructions: "Select applicable tags",
	},
	settings: {
		options: {
			frontend: "Frontend",
			backend: "Backend",
			devops: "DevOps",
			mobile: "Mobile",
			security: "Security",
			testing: "Testing",
			performance: "Performance",
			accessibility: "Accessibility",
			documentation: "Documentation",
			design: "Design",
			database: "Database",
			api: "API",
		},
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Interests",
		api_accessor: "interests",
		required: false,
		instructions: "",
	},
	settings: {
		options: {
			sports: "Sports",
			music: "Music",
			travel: "Travel",
			cooking: "Cooking",
		},
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Checkboxes",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultCheckboxesField]}
			defaultValues={{ interests: [] }}
		/>
	),
};

export const PreSelected: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[preSelectedField]}
			defaultValues={{ notifications: ["email", "push"] }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ terms: [] }}
		/>
	),
};

export const ManyOptions: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[manyOptionsField]}
			defaultValues={{ tags: ["frontend", "testing"] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ interests: ["sports", "travel"] }}
			readOnly
		/>
	),
};
