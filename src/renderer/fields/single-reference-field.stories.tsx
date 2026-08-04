import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import { createFakeReferenceAdapter } from "../../test/fake-reference-adapter";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

// The same in-memory catalogue the tests drive, so a story and a test never
// disagree about what the Adapter offers.
const referenceAdapter = createFakeReferenceAdapter();

function makeField(overrides: Partial<Field["config"]> = {}): Field {
	return {
		field_type: "single_reference",
		config: {
			name: "Primary article",
			api_accessor: "primary_article",
			required: false,
			instructions: "Search the catalogue and pick one article",
			...overrides,
		},
		settings: { blueprints: ["article"] },
		children: null,
		system: false,
	};
}

const meta = {
	title: "Fields/Single Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Empty: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ primary_article: null }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** The name comes from the Adapter, not from the stored value. */
export const WithAStoredReference: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ primary_article: { id: "article-2" } }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** A Content that no longer resolves keeps its id on screen. */
export const UnresolvableReference: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ primary_article: { id: "deleted-42" } }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({ required: true })]}
			defaultValues={{ primary_article: null }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** No Blueprints configured: the Adapter decides what may be referenced. */
export const AnyBlueprint: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				{
					...makeField({ name: "Related record" }),
					settings: { blueprints: [] },
				},
			]}
			defaultValues={{ primary_article: null }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ primary_article: null }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ primary_article: { id: "article-1" } }}
			adapters={{ reference: referenceAdapter }}
			readOnly
		/>
	),
};
