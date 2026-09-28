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
			_id: `r${n}`,
			id: `article-${n}`,
			children: [{ _id: `r${n + 1}`, id: `article-${n + 1}` }],
		});
	}
	return roots;
}

function makeField(
	overrides: Partial<Field["config"]> = {},
	settings: Record<string, unknown> = {
		blueprints: [{ blueprint: "article" }],
	},
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
			defaultValues={{
				related: [
					{ _id: "r1", id: "article-1" },
					{ _id: "r2", id: "article-3" },
				],
			}}
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
						_id: "r1",
						id: "article-1",
						children: [
							{
								_id: "r2",
								id: "article-3",
								children: [{ _id: "r3", id: "article-2" }],
							},
						],
					},
					{ _id: "r4", id: "author-1" },
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
			defaultValues={{ related: [{ _id: "r1", id: "deleted-42" }] }}
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
 * are offered alongside the Release in force. Open the drawer and pick a
 * Content to see it.
 */
export const PinnedToARelease: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				makeField(
					{},
					{ blueprints: [{ blueprint: "article" }], pin_mode: "release" },
				),
			]}
			defaultValues={{
				related: [{ _id: "r1", id: "article-1", pin: "article-1-r2" }],
			}}
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
			defaultValues={{
				related: [
					{ _id: "r1", id: "article-1" },
					{ _id: "r2", id: "article-2" },
				],
			}}
			adapters={{ reference: referenceAdapter }}
			readOnly
		/>
	),
};

/** One Reference Spec Field, as an Author would declare it in the config
 * panel. */
function specField(
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
 * Values: facts about the *pointing*, declared once as the Reference Spec and
 * filled per Reference. Each row shows how many it has filled; the button opens
 * a drawer rendering the Reference Spec through the ordinary renderer.
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
						blueprints: [{ blueprint: "article" }],
						spec: [
							specField("number", "page", "Page"),
							specField(
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
					{ _id: "r1", id: "article-1", values: { page: 12, role: "cited" } },
					{ _id: "r2", id: "article-3", values: { page: 4 } },
					{ _id: "r3", id: "article-2" },
				],
			}}
			adapters={{ reference: referenceAdapter }}
		/>
	),
};

/**
 * A linked Reference Spec: the `article` entry names a Blueprint Release
 * (`spec_blueprint`) whose resolved Fields — a required `chapter` — ask about
 * every Reference to an article *instead of* the embedded `spec`. A Reference
 * to an author falls back to the embedded `spec` and is asked for a `page`.
 * The two are never merged.
 *
 * Which Blueprint a target belongs to comes from the Adapter's `fetch`
 * (`blueprint_id`), so the drawer for a row picks its Spec only once that
 * row's Content has resolved.
 */
export const WithLinkedReferenceSpec: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[
				makeField(
					{ name: "Sources" },
					{
						blueprints: [
							{
								blueprint: "article",
								spec_blueprint: "bp-citation@1",
								spec: [
									specField("number", "chapter", "Chapter", { required: true }),
								],
							},
							{ blueprint: "author" },
						],
						spec: [specField("number", "page", "Page")],
					},
				),
			]}
			defaultValues={{
				related: [
					{ _id: "r1", id: "article-1", values: { chapter: 3 } },
					{ _id: "r2", id: "article-3" },
					{ _id: "r3", id: "author-1", values: { page: 42 } },
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
 * depth it sits at, with its values against it (ADR-0008). No form
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
							blueprints: [{ blueprint: "article" }],
							spec: [specField("number", "page", "Page")],
						},
					),
				]}
				mode="read"
				values={{
					related: [
						{
							_id: "r1",
							id: "article-1",
							values: { page: 12 },
							children: [{ _id: "r2", id: "article-2", values: { page: 88 } }],
						},
						{ _id: "r3", id: "article-3" },
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
