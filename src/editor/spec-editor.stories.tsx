import type { Meta, StoryObj } from "@storybook/react";
import { type ReactNode, useState } from "react";
import { FieldKitProvider } from "../renderer/provider";
import { boolean, number, section, select, text } from "../schema/builders";
import { builtInFieldTypes } from "../schema/field-types";
import type { Schema } from "../schema/types";
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

// Both fields share the "duplicate" accessor — validateSpec flags each with a
// duplicate_accessor error, so both shells outline red, the tab carries an
// error badge, and Save/Try-it stay disabled until one is renamed.
const invalidSpec: Schema = [
	text("duplicate", { name: "First Name", required: true }),
	text("duplicate", { name: "Last Name" }),
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
					Try-it mode is internal state on <code>SpecEditor</code> — there is no
					prop to force it open on mount, so this story renders the same as
					Build. Click <strong>Try it</strong> in the header above to preview
					the schema as a live, submittable form; click <strong>Build</strong>{" "}
					to return. The button is disabled whenever the draft has validation
					errors.
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
					Both fields are authored with the accessor <code>duplicate</code>.
					Select either one to see the red "already in use" message and the
					danger-colored shell outline; the tab strip's error badge counts both.{" "}
					<strong>Save</strong> and <strong>Try it</strong> stay disabled until
					the collision is resolved.
				</>
			}
		/>
	),
};
