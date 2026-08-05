import type { Meta, StoryObj } from "@storybook/react";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
} from "../../test/fake-reference-adapter";
import { FieldKitProvider } from "../provider";
import { SpecForm } from "../spec-form/spec-form";
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

/** One Attribute Field, as an Author would declare it in the config panel. */
function attribute(
	fieldType: string,
	accessor: string,
	name: string,
	overrides: Partial<Field["config"]> = {},
	settings: unknown = null,
): Field {
	return {
		field_type: fieldType,
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
			...overrides,
		},
		settings,
		children: null,
		system: false,
	};
}

/**
 * Attributes: values about the *pointing*, declared once and filled per
 * Reference. Each row shows how many it has filled; the button opens a drawer
 * rendering the Attribute Spec through the ordinary renderer.
 *
 * `role` is required, so submitting reports at that Reference's own path.
 */
export const WithAttributes: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				makeField(
					{},
					{
						blueprints: ["article"],
						attributes: [
							attribute("number", "page", "Page"),
							attribute(
								"select",
								"role",
								"Role",
								{ required: true },
								{
									options: { cited: "Cited", background: "Background" },
								},
							),
						],
					},
				),
			]}
			defaultValues={{
				related: [
					{ id: "article-1", attributes: { page: 12, role: "cited" } },
					{ id: "article-3", attributes: { page: 4 } },
					{ id: "article-2" },
				],
			}}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/**
 * Read mode: the same structure editing shows, resolved and static.
 *
 * It bypasses the table cell — which can only count, having neither adapter
 * access nor async — and renders the tree: each Content's current name at the
 * depth it sits at, with its Attribute values against it (ADR-0008). No form
 * is involved; `SpecForm` in read mode needs no `FormProvider`.
 */
export const ReadMode: Story = {
	render: () => (
		<FieldKitProvider
			plugins={builtInFieldTypes}
			adapters={{ reference: referenceAdapter }}
		>
			<SpecForm
				schema={[
					makeField(
						{},
						{
							blueprints: ["article"],
							attributes: [attribute("number", "page", "Page")],
						},
					),
				]}
				mode="read"
				values={{
					related: [
						{
							id: "article-1",
							attributes: { page: 12 },
							children: [{ id: "article-2", attributes: { page: 88 } }],
						},
						{ id: "article-3" },
					],
				}}
			/>
		</FieldKitProvider>
	),
};

/**
 * Read mode past the node-count threshold: the tree opens with every parent
 * collapsed and carries the same Find control the editable tree does, so
 * reaching one Reference never means switching into an editable view.
 *
 * Both halves call the tree model's own fold and reveal functions, so the two
 * renderers cannot disagree about what a fold hides or what a Reveal opens.
 */
export const ReadModeLargeTree: Story = {
	render: () => (
		<FieldKitProvider
			plugins={builtInFieldTypes}
			adapters={{ reference: treeAdapter }}
		>
			<SpecForm
				schema={[makeField()]}
				mode="read"
				values={{ related: treeOf(30) }}
			/>
		</FieldKitProvider>
	),
};
