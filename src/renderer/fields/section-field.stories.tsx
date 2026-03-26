import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const sectionField: Field = {
	field_type: "section",
	config: {
		name: "General Settings",
		api_accessor: "general_settings",
		required: false,
		instructions:
			"This section should group related fields — but rendering is not implemented",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Section",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper fields={[sectionField]} defaultValues={{}} />
	),
};
