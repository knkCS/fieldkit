import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { EditorSpec } from "./types";
import { EditorSpecEditor } from "./editor-spec-editor";
import { builtInMarkPlugins, builtInNodePlugins } from "./node-plugins";

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

function StoryWrapper({ initial }: { initial: EditorSpec }) {
	const [spec, setSpec] = useState<EditorSpec>(initial);

	return (
		<div style={{ maxWidth: 700 }}>
			<EditorSpecEditor
				spec={spec}
				onChange={setSpec}
				nodePlugins={builtInNodePlugins}
				markPlugins={builtInMarkPlugins}
			/>
			<details style={{ marginTop: 24 }}>
				<summary style={{ cursor: "pointer", fontSize: 13, color: "#888" }}>
					EditorSpec JSON
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
					{JSON.stringify(spec, null, 2)}
				</pre>
			</details>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Meta                                                               */
/* ------------------------------------------------------------------ */

const meta = {
	title: "RichTextSpec/EditorSpecEditor",
	component: EditorSpecEditor,
	parameters: { layout: "padded" },
} satisfies Meta<typeof EditorSpecEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

export const Default: Story = {
	render: () => (
		<StoryWrapper
			initial={{
				id: "default",
				name: "Default Editor Spec",
				nodes: {},
				marks: {},
			}}
		/>
	),
};

export const WithPresets: Story = {
	render: () => (
		<StoryWrapper
			initial={{
				id: "preset",
				name: "Preset Editor Spec",
				description: "Common rich-text configuration",
				nodes: {
					heading: { levels: [1, 2, 3] },
					bulletList: {},
					orderedList: {},
					blockquote: {},
					image: {},
				},
				marks: {
					bold: {},
					italic: {},
					underline: {},
				},
			}}
		/>
	),
};
