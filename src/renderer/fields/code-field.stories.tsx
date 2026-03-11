import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultCodeField: Field = {
	field_type: "code",
	config: {
		name: "Code Snippet",
		api_accessor: "code_snippet",
		required: false,
		instructions: "Enter source code or preformatted text",
	},
	settings: null,
	children: null,
	system: false,
};

const withLanguageField: Field = {
	field_type: "code",
	config: {
		name: "JavaScript Code",
		api_accessor: "js_code",
		required: false,
		instructions: "Enter JavaScript code",
	},
	settings: {
		language: "javascript",
	},
	children: null,
	system: false,
};

const withContentField: Field = {
	field_type: "code",
	config: {
		name: "CSS Styles",
		api_accessor: "css_styles",
		required: false,
		instructions: "Custom CSS styles",
	},
	settings: {
		language: "css",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "code",
	config: {
		name: "Configuration",
		api_accessor: "configuration",
		required: false,
		instructions: "",
	},
	settings: {
		language: "json",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Code",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultCodeField]}
			defaultValues={{ code_snippet: "" }}
		/>
	),
};

export const WithLanguage: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withLanguageField]}
			defaultValues={{ js_code: "" }}
		/>
	),
};

export const WithContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withContentField]}
			defaultValues={{
				css_styles:
					".container {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 0 1rem;\n}\n\n.header {\n  background-color: #1a1a2e;\n  color: #e0e0e0;\n  padding: 1rem 0;\n}",
			}}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				configuration: JSON.stringify(
					{
						api_version: "2.0",
						base_url: "https://api.example.com",
						timeout: 30000,
						features: {
							caching: true,
							rate_limiting: { max_requests: 100, window_ms: 60000 },
						},
					},
					null,
					2,
				),
			}}
			readOnly
		/>
	),
};
