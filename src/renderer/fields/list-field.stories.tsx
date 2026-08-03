import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const emptyField: Field = {
	field_type: "list",
	config: {
		name: "Keywords",
		api_accessor: "keywords",
		required: false,
		instructions: "One keyword per entry",
	},
	settings: { max_items_per_page: 0 },
	children: null,
	system: false,
};

const populatedField: Field = {
	field_type: "list",
	config: {
		name: "Keywords",
		api_accessor: "keywords",
		required: false,
		instructions: "Reorder to change the order they are published in",
	},
	settings: { max_items_per_page: 0 },
	children: null,
	system: false,
};

const paginatedField: Field = {
	field_type: "list",
	config: {
		name: "ISBNs",
		api_accessor: "isbns",
		required: false,
		instructions: "Search to find an entry without paging through all of them",
	},
	settings: { max_items_per_page: 5 },
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "list",
	config: {
		name: "Keywords",
		api_accessor: "keywords",
		required: true,
		instructions: "Submit with the list empty to see the required error",
	},
	settings: { max_items_per_page: 0 },
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "list",
	config: {
		name: "Keywords",
		api_accessor: "keywords",
		required: false,
		instructions: "",
	},
	settings: { max_items_per_page: 0 },
	children: null,
	system: false,
};

const isbns = Array.from(
	{ length: 23 },
	(_, i) => `978-3-16-${String(148410 + i).padStart(6, "0")}-0`,
);

const meta = {
	title: "Fields/List",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Empty: Story = {
	render: () => (
		<FieldStoryWrapper fields={[emptyField]} defaultValues={{ keywords: [] }} />
	),
};

export const WithEntries: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[populatedField]}
			defaultValues={{
				keywords: ["typography", "bookbinding", "letterpress", "papermaking"],
			}}
		/>
	),
};

export const SearchableAndPaginated: Story = {
	render: () => (
		<FieldStoryWrapper fields={[paginatedField]} defaultValues={{ isbns }} />
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ keywords: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				keywords: ["typography", "bookbinding", "letterpress"],
			}}
			readOnly
		/>
	),
};
