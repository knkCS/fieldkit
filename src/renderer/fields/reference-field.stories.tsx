import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
} from "../../test/fake-reference-adapter";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

// The same in-memory catalogue the tests drive, so a story and a test never
// disagree about what the Adapter offers.
const referenceAdapter = createFakeReferenceAdapter();

/** A Consumer that has implemented neither Spec method — the degrade path. */
const bareAdapter = createFakeReferenceAdapter({
	searchFilters: null,
	resultColumns: null,
});

/** Enough Contents that the browse has to be paged through. */
const bigAdapter = createFakeReferenceAdapter({ contents: fakeCatalogue(42) });

function makeField(
	overrides: Partial<Field["config"]> = {},
	settings: Record<string, unknown> = { blueprints: ["article"] },
): Field {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: false,
			instructions: "Browse the catalogue and add the articles this cites",
			...overrides,
		},
		settings,
		children: null,
		system: false,
	};
}

const meta = {
	title: "Fields/Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Empty: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** Names come from the Adapter, not from the stored value. */
export const WithStoredReferences: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [{ id: "article-1" }, { id: "article-3" }] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** A Content that no longer resolves keeps its id on screen. */
export const UnresolvableReference: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [{ id: "deleted-42" }] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/**
 * The browse over a catalogue too big to scroll: pages, and a total the
 * Adapter reports.
 */
export const LargeCatalogue: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [] }}
			adapters={{ reference: bigAdapter }}
		/>
	),
};

/**
 * An Adapter that describes neither its filters nor its result columns: the
 * picker degrades to a search box and a name column rather than erroring
 * (ADR-0009).
 */
export const AdapterWithoutSpecs: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [] }}
			adapters={{ reference: bareAdapter }}
		/>
	),
};

/** `max_items` is a cap, never a change of shape — the add affordance stops
 * being offered at the limit. */
export const AtTheCap: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({}, { blueprints: ["article"], max_items: 2 })]}
			defaultValues={{ related: [{ id: "article-1" }, { id: "article-2" }] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({ required: true })]}
			defaultValues={{ related: [] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** No Blueprints configured: the Adapter decides what may be referenced. */
export const AnyBlueprint: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({ name: "Related records" }, { blueprints: [] })]}
			defaultValues={{ related: [] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper fields={[makeField()]} defaultValues={{ related: [] }} />
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: [{ id: "article-1" }, { id: "article-2" }] }}
			adapters={{ reference: referenceAdapter }}
			readOnly
		/>
	),
};
