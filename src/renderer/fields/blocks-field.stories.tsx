import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultBlocksField: Field = {
	field_type: "blocks",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "Build your content using blocks",
	},
	settings: {
		allowed_blocks: [],
	},
	children: null,
	system: false,
};

const withBlockTypesField: Field = {
	field_type: "blocks",
	config: {
		name: "Page Content",
		api_accessor: "page_content",
		required: false,
		instructions: "Add text, image, or call-to-action blocks",
	},
	settings: {
		allowed_blocks: [
			{
				type: "text_block",
				name: "Text Block",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Heading",
							api_accessor: "heading",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Block heading" },
						children: null,
						system: false,
					},
					{
						field_type: "textarea",
						config: {
							name: "Body",
							api_accessor: "body",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Block body text" },
						children: null,
						system: false,
					},
				],
			},
			{
				type: "image_block",
				name: "Image Block",
				fields: [
					{
						field_type: "url",
						config: {
							name: "Image URL",
							api_accessor: "image_url",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "https://example.com/image.png" },
						children: null,
						system: false,
					},
					{
						field_type: "text",
						config: {
							name: "Alt Text",
							api_accessor: "alt_text",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Describe the image" },
						children: null,
						system: false,
					},
				],
			},
			{
				type: "cta_block",
				name: "Call to Action",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Button Text",
							api_accessor: "button_text",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Click me" },
						children: null,
						system: false,
					},
					{
						field_type: "url",
						config: {
							name: "Button URL",
							api_accessor: "button_url",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "https://example.com" },
						children: null,
						system: false,
					},
				],
			},
		],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "blocks",
	config: {
		name: "Page Content",
		api_accessor: "page_content",
		required: false,
		instructions: "",
	},
	settings: {
		allowed_blocks: [
			{
				type: "text_block",
				name: "Text Block",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Heading",
							api_accessor: "heading",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
					{
						field_type: "textarea",
						config: {
							name: "Body",
							api_accessor: "body",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
				],
			},
		],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Blocks",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultBlocksField]}
			defaultValues={{ content: [] }}
		/>
	),
};

export const WithBlockTypes: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withBlockTypesField]}
			defaultValues={{ page_content: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				page_content: [
					{ _type: "text_block", heading: "Welcome", body: "Hello world" },
					{ _type: "text_block", heading: "About", body: "About us content" },
				],
			}}
			readOnly
		/>
	),
};
