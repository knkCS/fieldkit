import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	createFakeLookupSource,
	fakeLookupCollection,
} from "../../test/fake-lookup-source";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const SOURCE = "layout:stylesheet";

// The same in-memory Source the tests drive, so a story and a test never
// disagree about what a Source offers.
const stylesheets = createFakeLookupSource();
const withoutResolver = createFakeLookupSource({ withoutResolve: true });
const pageable = createFakeLookupSource({ items: fakeLookupCollection(60) });
const failing = createFakeLookupSource({
	failSearch: new Error("layout service is down"),
});

function makeField(overrides: Partial<Field["config"]> = {}): Field {
	return {
		field_type: "lookup",
		config: {
			name: "Stylesheet",
			api_accessor: "stylesheet",
			required: false,
			instructions: "Pick the stylesheet this title is typeset with",
			...overrides,
		},
		settings: { source: SOURCE },
		children: null,
		system: false,
	};
}

const meta = {
	title: "Fields/Lookup",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Empty: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: null }}
			adapters={{ lookup: { [SOURCE]: stylesheets } }}
		/>
	),
};

/** The label comes from the Source, not from the stored value — which is only
 * the id. */
export const WithAStoredId: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: "sheet-2" }}
			adapters={{ lookup: { [SOURCE]: stylesheets } }}
		/>
	),
};

/** Without `resolveByIds`, a stored id reads as itself: visibly degraded
 * rather than blank. */
export const SourceWithoutResolver: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: "sheet-2" }}
			adapters={{ lookup: { [SOURCE]: withoutResolver } }}
		/>
	),
};

/** An id the Source has nothing behind keeps its id on screen, and the stored
 * value is never rewritten. */
export const UnresolvableId: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: "sheet-deleted" }}
			adapters={{ lookup: { [SOURCE]: stylesheets } }}
		/>
	),
};

/** Scrolling to the bottom of the menu asks the Source for the next page. */
export const ManyItems: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: null }}
			adapters={{ lookup: { [SOURCE]: pageable } }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({ required: true })]}
			defaultValues={{ stylesheet: null }}
			adapters={{ lookup: { [SOURCE]: stylesheets } }}
		/>
	),
};

/** A Source that rejects puts its failure in the menu and leaves the control
 * alive; the next query tries again. */
export const SourceFailure: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: null }}
			adapters={{ lookup: { [SOURCE]: failing } }}
		/>
	),
};

/** A Field naming a Source nobody registered says so, naming the id, rather
 * than throwing. */
export const SourceNotRegistered: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: null }}
			adapters={{ lookup: { "print:printer": stylesheets } }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ stylesheet: "sheet-1" }}
			adapters={{ lookup: { [SOURCE]: stylesheets } }}
			readOnly
		/>
	),
};
