import type { Meta, StoryObj } from "@storybook/react";
import { type ReactNode, useState } from "react";
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
}: {
	initialSchema: Schema;
	note?: ReactNode;
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
		<FieldKitProvider plugins={builtInFieldTypes}>
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
					italic placeholder). Try the card header: drag its handle to move the
					whole card, click it to rename via the panel, or open ⋯ for the two
					delete flavors ("Delete card" merges fields into a neighbor; "Delete
					card and fields" confirms first). "+ Card" (in the toolbar) on a tab
					with loose fields auto-wraps them. Select <strong>Preview</strong> to
					see the rendered card layout as a real form.
				</>
			}
		/>
	),
};
