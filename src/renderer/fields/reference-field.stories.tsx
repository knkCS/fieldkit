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

/** Enough Contents to build a tree past the collapse threshold out of. */
const treeAdapter = createFakeReferenceAdapter({ contents: fakeCatalogue(30) });

/** `count` References as parent/child pairs, for the two tree stories. */
function treeOf(count: number) {
	const roots = [];
	for (let n = 1; n <= count; n += 2) {
		roots.push({
			id: `article-${n}`,
			children: [{ id: `article-${n + 1}` }],
		});
	}
	return roots;
}

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

/**
 * A Reference Tree: drag a row's grip to reorder it among its siblings, or
 * rightwards to nest it under the Reference above. A Reference with children
 * folds away with the chevron, and its descendants travel with it.
 */
export const NestedTree: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{
				related: [
					{
						id: "article-1",
						children: [{ id: "article-3", children: [{ id: "article-2" }] }],
					},
					{ id: "author-1" },
				],
			}}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/**
 * Past the node-count threshold a tree opens with every parent collapsed, so
 * it is navigable from the first render instead of needing to be scrolled.
 */
export const LargeTree: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField()]}
			defaultValues={{ related: treeOf(30) }}
			adapters={{ reference: treeAdapter }}
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

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({ required: true })]}
			defaultValues={{ related: [] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/**
 * A Field that pins: adding gains a second step, where the Content's Releases
 * are offered alongside the newest Version. Open the drawer and pick a Content
 * to see it.
 */
export const PinnedToARelease: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({}, { blueprints: ["article"], pin_mode: "release" })]}
			defaultValues={{ related: [{ id: "article-1", pin: "article-1-r2" }] }}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/** The same second step, offering Versions instead — the value is identical
 * either way, since a Pin stores only a target id (ADR-0008). */
export const PinnedToAVersion: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[makeField({}, { blueprints: ["article"], pin_mode: "version" })]}
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
