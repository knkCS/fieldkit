import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters, MediaItem } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

let mockIdCounter = 100;

const mockMediaAdapter: FieldKitAdapters["media"] = {
	upload: async (file: File): Promise<MediaItem> => {
		// Simulate upload delay
		await new Promise((resolve) => setTimeout(resolve, 800));
		mockIdCounter += 1;
		return {
			id: `media-${mockIdCounter}`,
			filename: file.name,
			url: `https://cdn.example.com/uploads/${file.name}`,
			mime_type: file.type || "application/octet-stream",
			size: file.size,
		};
	},
	browse: async () => {
		return [
			{
				id: "media-1",
				filename: "hero-banner.jpg",
				url: "https://cdn.example.com/uploads/hero-banner.jpg",
				mime_type: "image/jpeg",
				size: 245000,
			},
			{
				id: "media-2",
				filename: "logo.png",
				url: "https://cdn.example.com/uploads/logo.png",
				mime_type: "image/png",
				size: 18400,
			},
			{
				id: "media-3",
				filename: "product-overview.pdf",
				url: "https://cdn.example.com/uploads/product-overview.pdf",
				mime_type: "application/pdf",
				size: 1250000,
			},
		];
	},
};

const defaultMediaField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "Upload files to attach to this entry",
	},
	settings: null,
	children: null,
	system: false,
};

const withAcceptFilterField: Field = {
	field_type: "media",
	config: {
		name: "Cover Image",
		api_accessor: "cover_image",
		required: false,
		instructions: "Upload an image (JPEG, PNG, or WebP)",
	},
	settings: {
		accept: ["image/jpeg", "image/png", "image/webp"],
		max_items: 1,
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Media",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultMediaField]}
			defaultValues={{ attachments: [] }}
			adapters={{ media: mockMediaAdapter }}
		/>
	),
};

export const WithAcceptFilter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withAcceptFilterField]}
			defaultValues={{ cover_image: [] }}
			adapters={{ media: mockMediaAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ attachments: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ attachments: ["media-1", "media-2"] }}
			adapters={{ media: mockMediaAdapter }}
			readOnly
		/>
	),
};
