import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultRichTextField: Field = {
	field_type: "rich_text",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "Enter rich text content",
	},
	settings: {
		view_mode: "full",
	},
	children: null,
	system: false,
};

const withJSONContentField: Field = {
	field_type: "rich_text",
	config: {
		name: "Article",
		api_accessor: "article",
		required: false,
		instructions: "ProseMirror document structure as JSON",
	},
	settings: {
		editor_spec: "default",
		view_mode: "full",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "rich_text",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "",
	},
	settings: {
		view_mode: "compact",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Rich Text",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultRichTextField]}
			defaultValues={{ content: "" }}
		/>
	),
};

export const WithJSONContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withJSONContentField]}
			defaultValues={{
				article: {
					type: "doc",
					content: [
						{
							type: "heading",
							attrs: { level: 1 },
							content: [{ type: "text", text: "Welcome" }],
						},
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "This is a " },
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "rich text",
								},
								{ type: "text", text: " document stored as ProseMirror JSON." },
							],
						},
						{
							type: "bullet_list",
							content: [
								{
									type: "list_item",
									content: [
										{
											type: "paragraph",
											content: [{ type: "text", text: "First point" }],
										},
									],
								},
								{
									type: "list_item",
									content: [
										{
											type: "paragraph",
											content: [{ type: "text", text: "Second point" }],
										},
									],
								},
							],
						},
					],
				},
			}}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				content: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "This content is read-only and cannot be edited.",
								},
							],
						},
					],
				},
			}}
			readOnly
		/>
	),
};
