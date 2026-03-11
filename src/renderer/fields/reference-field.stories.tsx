import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockReferenceAdapter: FieldKitAdapters["reference"] = {
	search: async (_blueprintIds: string[], query: string) => {
		const allItems = [
			{ id: "post-1", display_name: "Getting Started with FieldKit", blueprint_id: "blog_post" },
			{ id: "post-2", display_name: "Advanced Schema Design", blueprint_id: "blog_post" },
			{ id: "post-3", display_name: "Building Custom Field Types", blueprint_id: "blog_post" },
			{ id: "page-1", display_name: "About Us", blueprint_id: "page" },
			{ id: "page-2", display_name: "Contact", blueprint_id: "page" },
			{ id: "page-3", display_name: "Terms of Service", blueprint_id: "page" },
			{ id: "product-1", display_name: "Pro Plan", blueprint_id: "product" },
			{ id: "product-2", display_name: "Enterprise Plan", blueprint_id: "product" },
		];
		const lower = query.toLowerCase();
		return allItems.filter((item) =>
			item.display_name.toLowerCase().includes(lower),
		);
	},
	fetch: async (ids: string[]) => {
		const allItems = [
			{ id: "post-1", display_name: "Getting Started with FieldKit", blueprint_id: "blog_post" },
			{ id: "post-2", display_name: "Advanced Schema Design", blueprint_id: "blog_post" },
			{ id: "post-3", display_name: "Building Custom Field Types", blueprint_id: "blog_post" },
			{ id: "page-1", display_name: "About Us", blueprint_id: "page" },
			{ id: "page-2", display_name: "Contact", blueprint_id: "page" },
			{ id: "page-3", display_name: "Terms of Service", blueprint_id: "page" },
			{ id: "product-1", display_name: "Pro Plan", blueprint_id: "product" },
			{ id: "product-2", display_name: "Enterprise Plan", blueprint_id: "product" },
		];
		return allItems.filter((item) => ids.includes(item.id));
	},
};

const defaultReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "Search and select related blog posts",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const singleReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Author",
		api_accessor: "author",
		required: true,
		instructions: "Select the author of this post",
	},
	settings: {
		blueprints: ["page"],
		max_items: 1,
	},
	children: null,
	system: false,
};

const multiReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Featured Items",
		api_accessor: "featured_items",
		required: false,
		instructions: "Select multiple items from any blueprint",
	},
	settings: {
		blueprints: ["blog_post", "page", "product"],
		max_items: 5,
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultReferenceField]}
			defaultValues={{ related_posts: [] }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const SingleMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[singleReferenceField]}
			defaultValues={{ author: "" }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const MultiMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[multiReferenceField]}
			defaultValues={{ featured_items: ["post-1", "page-2"] }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ related_posts: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ related_posts: ["post-1", "post-3"] }}
			adapters={{ reference: mockReferenceAdapter }}
			readOnly
		/>
	),
};
