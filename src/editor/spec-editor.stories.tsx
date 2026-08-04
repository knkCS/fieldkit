import type { Meta, StoryObj } from "@storybook/react";
import { type ReactNode, useState } from "react";
import type { FieldKitAdapters } from "../renderer/adapters";
import { FieldKitProvider } from "../renderer/provider";
import { boolean, number, section, select, text } from "../schema/builders";
import { builtInFieldTypes } from "../schema/field-types";
import type { Field, Schema } from "../schema/types";
import { SpecEditor } from "./spec-editor";

/* ------------------------------------------------------------------ */
/*  Specs                                                              */
/* ------------------------------------------------------------------ */

const sectionedSpec: Schema = [
	text("title", {
		name: "Title",
		required: true,
		instructions: "Enter a title",
	}),
	boolean("published", { name: "Published" }),
	...section("SEO", [
		text("meta_title", { name: "Meta Title" }),
		text("meta_description", { name: "Meta Description" }),
	]),
	...section("Advanced", [
		number("priority", { name: "Priority", min: 0, max: 10 }),
		select("visibility", {
			name: "Visibility",
			options: { public: "Public", private: "Private", unlisted: "Unlisted" },
		}),
	]),
];

const sectionlessSpec: Schema = [
	text("name", { name: "Name", required: true }),
	number("quantity", { name: "Quantity", min: 0 }),
	boolean("inStock", { name: "In Stock" }),
];

// A duplicate accessor SPANNING two tabs (one field on the implicit General
// tab, one inside the "Details" section) — validateSpec flags each with a
// duplicate_accessor error, so both shells outline red, BOTH tab triggers
// carry an error-count badge, and Save/Try-it stay disabled until one field
// is renamed. Mirrors the cross-tab badge case in validation-surfacing.test.tsx.
const invalidSpec: Schema = [
	text("duplicate", { name: "First Name", required: true }),
	...section("Details", [text("duplicate", { name: "Last Name" })]),
];

// System fields as a host would inject them (server-canonical definitions,
// e.g. mediahub's asset name/description): locked in the panel, draggable
// on the canvas, undeletable. Mixed with one customer field.
const systemSpec: Schema = [
	{
		...text("name", {
			name: "Name",
			required: true,
			instructions: "The name of the asset.",
		}),
		system: true,
	},
	{ ...text("description", { name: "Description" }), system: true },
	text("internal_ref", { name: "Internal reference" }),
];

// Cards are authored via "+ Card" — this marker literal is exactly what
// draft-ops' insertCard produces (plus a name, set via the config panel).
function cardMarker(name: string, accessor: string): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

const cardedSpec: Schema = [
	cardMarker("Basics", "card_basics"),
	text("title", { name: "Title", required: true }),
	boolean("published", { name: "Published" }),
	cardMarker("", "card_untitled"),
	text("notes", { name: "Notes" }),
	...section("SEO", [
		cardMarker("Meta", "card_meta"),
		text("meta_title", { name: "Meta Title" }),
	]),
];

// An authored Fieldset — a blueprint id and no children, exactly what the
// editor writes. Preview is what resolves it (#54).
function fieldsetField(
	accessor: string,
	name: string,
	blueprint: string,
): Field {
	return {
		field_type: "fieldset",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: { blueprint },
		system: false,
	};
}

const fieldsetSpec: Schema = [
	text("title", { name: "Title", required: true }),
	fieldsetField("address", "Address", "address_bp"),
];

/** The Blueprint a consumer's adapter would return for `address_bp`, with a
 * REQUIRED field in it — the one Preview only enforces once resolved. */
const addressBlueprint: Schema = [
	text("street", { name: "Street", required: true }),
	text("city", { name: "City" }),
];

const blueprintAdapters: FieldKitAdapters = {
	blueprint: {
		getSchema: async (id) => {
			// Slow on purpose, and slower than a real adapter would be: the
			// Preview skeleton is one of the two states this story exists to
			// show, and at realistic latency it flashes past unseen.
			await new Promise((resolve) => setTimeout(resolve, 1500));
			return id === "address_bp" ? addressBlueprint : [];
		},
		getData: async () => ({ items: [], total: 0, page: 1, page_size: 25 }),
		list: async () => [{ id: "address_bp", name: "Address" }],
	},
};

const failingBlueprintAdapters: FieldKitAdapters = {
	blueprint: {
		getSchema: async () => {
			throw new Error("blueprint service unavailable");
		},
		getData: async () => ({ items: [], total: 0, page: 1, page_size: 25 }),
	},
};

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

// Mirrors the draft model documented in spec-editor.mdx: `onCommit` is async
// (a real host would await a network request), the baseline (the `schema`
// prop fed back into SpecEditor) only advances on a SUCCESSFUL resolve, and
// `onDirtyChange` is wired through to a host-guard stand-in below the editor.
function StoryWrapper({
	initialSchema,
	note,
	adapters,
}: {
	initialSchema: Schema;
	note?: ReactNode;
	/** Left off by most stories — the editor needs no adapter until a Fieldset
	 * has to be resolved for Preview. */
	adapters?: FieldKitAdapters;
}) {
	const [committed, setCommitted] = useState<Schema>(initialSchema);
	const [dirty, setDirty] = useState(false);
	const [log, setLog] = useState<string[]>([]);

	async function handleCommit(next: Schema) {
		setLog((l) => [...l, "onCommit called — awaiting (simulated) save…"]);
		await new Promise((resolve) => setTimeout(resolve, 400));
		setCommitted(next);
		setLog((l) => [...l, "save resolved — baseline advanced, draft clean"]);
	}

	return (
		<FieldKitProvider plugins={builtInFieldTypes} adapters={adapters}>
			<div style={{ maxWidth: 960 }}>
				{note && (
					<div
						style={{
							marginBottom: 16,
							padding: 12,
							borderRadius: 6,
							background: "#f5f5f5",
							fontSize: 13,
							color: "#444",
						}}
					>
						{note}
					</div>
				)}
				<SpecEditor
					schema={committed}
					onCommit={handleCommit}
					onDirtyChange={setDirty}
					plugins={builtInFieldTypes}
				/>
				<details style={{ marginTop: 24 }} open>
					<summary style={{ cursor: "pointer", fontSize: 13, color: "#888" }}>
						Host state — dirty: {String(dirty)}, last committed schema
					</summary>
					<pre
						style={{
							fontSize: 12,
							background: "#f5f5f5",
							padding: 12,
							borderRadius: 6,
							overflow: "auto",
							maxHeight: 300,
						}}
					>
						{JSON.stringify(committed, null, 2)}
					</pre>
				</details>
				{log.length > 0 && (
					<details style={{ marginTop: 12 }} open>
						<summary style={{ cursor: "pointer", fontSize: 13, color: "#888" }}>
							onCommit activity log
						</summary>
						<ul style={{ fontSize: 12, color: "#666", margin: 0 }}>
							{log.map((entry, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only log, never reordered
								<li key={i}>{entry}</li>
							))}
						</ul>
					</details>
				)}
			</div>
		</FieldKitProvider>
	);
}

/* ------------------------------------------------------------------ */
/*  Meta                                                               */
/* ------------------------------------------------------------------ */

const meta = {
	title: "Editor/SpecEditor",
	component: SpecEditor,
	parameters: { layout: "padded" },
} satisfies Meta<typeof SpecEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

export const Build: Story = {
	render: () => <StoryWrapper initialSchema={sectionedSpec} />,
};

export const TryIt: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={sectionedSpec}
			note={
				<>
					Preview mode is internal state on <code>SpecEditor</code> — there is
					no prop to force it open on mount, so this story renders the same as
					Build. Select <strong>Preview</strong> in the toolbar's mode control
					above to render the schema as a live, submittable form; select{" "}
					<strong>Build</strong> to return. The Preview segment is disabled
					whenever the draft has validation errors.
				</>
			}
		/>
	),
};

export const FieldsetPreview: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={fieldsetSpec}
			adapters={blueprintAdapters}
			note={
				<>
					<code>Address</code> is a <strong>Fieldset</strong> — it embeds the{" "}
					<code>address_bp</code> Blueprint rather than storing its fields.{" "}
					<code>Street</code> and <code>City</code> appear on the Build canvas
					too, because the Fieldset self-resolves <em>for display</em>; seeing
					them there tells you nothing about whether the form knows they exist.
					Select <strong>Preview</strong> (behind a skeleton — this adapter is
					deliberately slow) and the editor resolves the draft through{" "}
					<code>resolveSpec()</code> before building the form. The difference is
					validation: <code>Street</code> is <em>required</em>, so pressing{" "}
					<strong>Test submit</strong> with it empty is blocked by the
					Blueprint's own rule and reported at <code>Street</code> itself.
					Unresolved, a Fieldset validates as an opaque record and that submit
					would pass.
				</>
			}
		/>
	),
};

export const FieldsetPreviewAdapterFails: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={fieldsetSpec}
			adapters={failingBlueprintAdapters}
			note={
				<>
					The same spec against a blueprint adapter that always rejects. Select{" "}
					<strong>Preview</strong>: a warning alert (
					<code>labels.previewResolveFailed</code>) sits above the form, the
					rest of the draft still renders and submits, and the Fieldset falls
					back to its own "Failed to load blueprint fields" state.{" "}
					<strong>Build</strong> returns to the canvas untouched. With no
					adapter configured at all, the Fieldset shows "Blueprint adapter not
					configured" and Preview renders with no skeleton, since there is
					nothing to fetch.
				</>
			}
		/>
	),
};

export const Sectionless: Story = {
	render: () => <StoryWrapper initialSchema={sectionlessSpec} />,
};

export const Empty: Story = {
	render: () => <StoryWrapper initialSchema={[]} />,
};

export const InvalidDraft: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={invalidSpec}
			note={
				<>
					Two fields on <em>different tabs</em> ("General" and "Details") share
					the accessor <code>duplicate</code>. Both tab triggers carry an
					error-count badge, both shells outline in the danger color, and
					selecting either field shows the inline duplicate-accessor message.{" "}
					<strong>Save</strong> and the <strong>Preview</strong> segment stay
					disabled until the collision is resolved.
				</>
			}
		/>
	),
};

export const SystemFields: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={systemSpec}
			note={
				<>
					<code>Name</code> and <code>Description</code> are system fields (
					<code>field.system</code>): the toolbar shows a lock and no delete,
					the config panel renders a read-only summary with no tab strip, and
					dragging still works from the shell's always-visible grip.{" "}
					<code>Internal reference</code> is a normal editable field.
					Duplicating a system field produces an editable copy.
				</>
			}
		/>
	),
};

export const BuildWithCards: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={cardedSpec}
			note={
				<>
					The "General" tab groups its fields into two cards (one untitled —
					italic placeholder), with a third card in "SEO". Try the card header:
					drag its handle to move the whole card — a header-bar clone with a "+
					N fields" hint follows the pointer while an accent line marks the
					landing slot between frames (0.11.0 drag feedback; field drags
					likewise get a shell clone, an insertion line, and a soft tint on the
					receiving card). Dwell on the "SEO" tab trigger mid-drag (~500 ms) to
					spring the canvas into it and drop the card between its frames —
					crossing the tab strip quickly does not switch tabs (0.12.0
					spring-loaded sections). Click the header to rename via the panel, or
					open ⋯ for the two delete flavors ("Delete card" merges fields into a
					neighbor; "Delete card and fields" confirms first) and a "Move to
					section" group that relocates the whole card block to the other
					section and follows it there. "+ Card" (in the toolbar) on a tab with
					loose fields auto-wraps them. Select <strong>Preview</strong> to see
					the rendered card layout as a real form.
				</>
			}
		/>
	),
};
