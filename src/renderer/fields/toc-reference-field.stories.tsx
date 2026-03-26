import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import type { FieldKitAdapters } from "../adapters";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockReferenceAdapter: FieldKitAdapters["reference"] = {
	search: async (_blueprintIds: string[], query: string) => {
		const allItems = [
			{
				id: "chapter-1",
				display_name: "1. Introduction",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-2",
				display_name: "2. Getting Started",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-3",
				display_name: "3. Core Concepts",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-4",
				display_name: "4. Advanced Usage",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-5",
				display_name: "5. API Reference",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-6",
				display_name: "6. Troubleshooting",
				blueprint_id: "chapter",
			},
		];
		const lower = query.toLowerCase();
		return allItems.filter((item) =>
			item.display_name.toLowerCase().includes(lower),
		);
	},
	fetch: async (ids: string[]) => {
		const allItems = [
			{
				id: "chapter-1",
				display_name: "1. Introduction",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-2",
				display_name: "2. Getting Started",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-3",
				display_name: "3. Core Concepts",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-4",
				display_name: "4. Advanced Usage",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-5",
				display_name: "5. API Reference",
				blueprint_id: "chapter",
			},
			{
				id: "chapter-6",
				display_name: "6. Troubleshooting",
				blueprint_id: "chapter",
			},
		];
		return allItems.filter((item) => ids.includes(item.id));
	},
};

const defaultTocReferenceField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "Select the parent chapter for this section",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/TOC Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTocReferenceField]}
			defaultValues={{ parent_chapter: "" }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ parent_chapter: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ parent_chapter: "chapter-3" }}
			adapters={{ reference: mockReferenceAdapter }}
			readOnly
		/>
	),
};
