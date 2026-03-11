import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { boolean, number, select, text } from "../schema/builders";
import { builtInFieldTypes } from "../schema/field-types";
import type { Schema } from "../schema/types";
import { SpecEditor } from "./spec-editor";

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

function StoryWrapper({ initialSchema }: { initialSchema: Schema }) {
	const [schema, setSchema] = useState<Schema>(initialSchema);

	return (
		<div style={{ maxWidth: 640 }}>
			<SpecEditor
				schema={schema}
				onChange={setSchema}
				plugins={builtInFieldTypes}
			/>
			<details style={{ marginTop: 24 }}>
				<summary style={{ cursor: "pointer", fontSize: 13, color: "#888" }}>
					Schema JSON
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
					{JSON.stringify(schema, null, 2)}
				</pre>
			</details>
		</div>
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

export const Empty: Story = {
	render: () => <StoryWrapper initialSchema={[]} />,
};

export const WithExistingFields: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={[
				text("title", { name: "Title", required: true }),
				number("price", { name: "Price", min: 0 }),
				boolean("active", { name: "Active" }),
				select("status", {
					name: "Status",
					options: { draft: "Draft", published: "Published", archived: "Archived" },
				}),
			]}
		/>
	),
};
