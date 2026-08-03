import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import type { FieldKitAdapters } from "../adapters";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

function text(name: string, accessor: string, instructions = ""): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions },
		settings: null,
		children: null,
		system: false,
	};
}

/** The fields a consumer's blueprint adapter would return for `address_bp`. */
const addressFields: Field[] = [
	text("Street", "street", "House number and street"),
	text("City", "city"),
	text("Postcode", "postcode"),
];

const adapters: FieldKitAdapters = {
	blueprint: {
		getSchema: async (blueprintId) =>
			blueprintId === "address_bp" ? addressFields : [],
		getData: async () => ({ items: [], total: 0, page: 1, page_size: 25 }),
	},
};

function fieldset(
	settings: Record<string, unknown>,
	overrides: Partial<Field> = {},
): Field {
	return {
		field_type: "fieldset",
		config: {
			name: "Address",
			api_accessor: "address",
			required: false,
			instructions: "The delivery address",
		},
		settings,
		children: null,
		system: false,
		...overrides,
	};
}

const meta = {
	title: "Fields/Fieldset",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[fieldset({ blueprint: "address_bp" })]}
			adapters={adapters}
			defaultValues={{ address: {} }}
		/>
	),
};

export const Collapsible: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[fieldset({ blueprint: "address_bp", collapsible: true })]}
			adapters={adapters}
			defaultValues={{
				address: { street: "12 Bridge Lane", city: "Ely", postcode: "CB7 4DL" },
			}}
		/>
	),
};

export const AlreadyResolved: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				fieldset({ blueprint: "address_bp" }, { children: addressFields }),
			]}
			defaultValues={{ address: {} }}
		/>
	),
};

export const NoBlueprintSelected: Story = {
	render: () => (
		<FieldStoryWrapper fields={[fieldset({})]} adapters={adapters} />
	),
};

export const NoAdapterConfigured: Story = {
	render: () => (
		<FieldStoryWrapper fields={[fieldset({ blueprint: "address_bp" })]} />
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[fieldset({ blueprint: "address_bp" })]}
			adapters={adapters}
			defaultValues={{
				address: { street: "12 Bridge Lane", city: "Ely", postcode: "CB7 4DL" },
			}}
			readOnly
		/>
	),
};
