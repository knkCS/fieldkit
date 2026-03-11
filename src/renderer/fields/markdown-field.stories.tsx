import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultMarkdownField: Field = {
	field_type: "markdown",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions: "Write your content using Markdown syntax",
	},
	settings: {
		placeholder: "Start writing...",
	},
	children: null,
	system: false,
};

const withContentField: Field = {
	field_type: "markdown",
	config: {
		name: "Article Body",
		api_accessor: "article_body",
		required: false,
		instructions: "Full article content in Markdown",
	},
	settings: {
		placeholder: "Write your article...",
	},
	children: null,
	system: false,
};

const withValidationField: Field = {
	field_type: "markdown",
	config: {
		name: "Summary",
		api_accessor: "summary",
		required: true,
		instructions: "A brief summary (10-500 characters)",
	},
	validation: {
		min_length: 10,
		max_length: 500,
	},
	settings: {
		placeholder: "Write a summary...",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "markdown",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Markdown",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultMarkdownField]}
			defaultValues={{ body: "" }}
		/>
	),
};

export const WithContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withContentField]}
			defaultValues={{
				article_body:
					"# Introduction\n\nThis is a **bold** statement and this is *italic*.\n\n## Features\n\n- First item\n- Second item\n- Third item\n\n> A blockquote for emphasis.\n\n```js\nconsole.log('Hello, world!');\n```\n\n[Learn more](https://example.com)",
			}}
		/>
	),
};

export const WithValidation: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withValidationField]}
			defaultValues={{ summary: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				body: "# Read Only Content\n\nThis markdown content cannot be edited.",
			}}
			readOnly
		/>
	),
};
