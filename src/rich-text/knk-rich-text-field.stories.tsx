import type { ResolvedTextType } from "@knkcms/knkeditor-vocabulary";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../renderer/provider";
import { SpecForm } from "../renderer/spec-form/spec-form";
import { builtInFieldTypes } from "../schema/field-types";
import type { FieldTypePlugin } from "../schema/plugin";
import { type ResolvedSpec, resolveSpec } from "../schema/resolve-spec";
import type { Field } from "../schema/types";
import { knkRichTextPlugin } from ".";

// The knkeditor-backed rich_text field (@knkcs/fieldkit/rich-text, ADR-0026).
// Each story resolves its Spec as a Consumer would — `resolveSpec()` with a
// `parts.text_type` fetcher — and hands the Resolved Spec's `parts` to
// FieldKitProvider, where the field finds its Text Type.

const plugins: FieldTypePlugin[] = builtInFieldTypes.map((plugin) =>
	plugin.id === "rich_text" ? knkRichTextPlugin : plugin,
);

const ARTICLE: ResolvedTextType = {
	minimumVocabularyVersion: "0.1.0",
	nodes: {
		doc: { options: {} },
		textWrapper: { options: {} },
		heading: { options: { levels: [2, 3] } },
		text: { options: {} },
	},
	marks: { bold: { options: {} }, italic: { options: {} } },
};

const TEXT_TYPES: Record<string, ResolvedTextType> = {
	"article@3": ARTICLE,
	// Set up for a vocabulary newer than the one this editor bundles.
	"future@1": { ...ARTICLE, minimumVocabularyVersion: "9999.0.0" },
};

const body = (textType: string): Field => ({
	field_type: "rich_text",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions:
			"Headings may be level 2 or 3: this Text Type allows no other",
	},
	settings: { text_type: textType, view_mode: "full" },
	system: false,
});

const stored = {
	type: "doc",
	content: [
		{
			type: "heading",
			attrs: { id: "h1", level: 2 },
			content: [{ type: "text", text: "Willkommen" }],
		},
		{
			type: "textWrapper",
			attrs: { id: "p1" },
			content: [
				{ type: "text", text: "A document stored as knkeditor's " },
				{ type: "text", marks: [{ type: "bold" }], text: "JSON" },
				{ type: "text", text: ", edited under its Text Type." },
			],
		},
	],
};

interface RichTextStoryProps {
	textType: string;
	mode?: "edit" | "read";
}

function RichTextStory({ textType, mode = "edit" }: RichTextStoryProps) {
	const [resolved, setResolved] = useState<ResolvedSpec | null>(null);
	const [submitted, setSubmitted] = useState<unknown>(null);
	const methods = useForm({ defaultValues: { body: stored } });

	useEffect(() => {
		resolveSpec(
			[body(textType)],
			{ parts: { text_type: async (release) => TEXT_TYPES[release] } },
			{ plugins },
		).then(setResolved);
	}, [textType]);

	if (!resolved) return null;
	return (
		<FieldKitProvider plugins={plugins} parts={resolved.parts}>
			{mode === "read" ? (
				<SpecForm
					schema={resolved.fields}
					mode="read"
					values={{ body: stored }}
				/>
			) : (
				<FormProvider {...methods}>
					<form noValidate onSubmit={methods.handleSubmit(setSubmitted)}>
						<SpecForm schema={resolved.fields} />
						<button type="submit" style={{ marginTop: 16 }}>
							Submit
						</button>
					</form>
					{submitted != null && (
						<pre style={{ marginTop: 16, fontSize: 12 }}>
							{JSON.stringify(submitted, null, 2)}
						</pre>
					)}
				</FormProvider>
			)}
		</FieldKitProvider>
	);
}
RichTextStory.displayName = "RichTextStory";

const meta = {
	title: "Rich Text/Knk Rich Text Field",
	component: RichTextStory,
	parameters: { layout: "padded" },
} satisfies Meta<typeof RichTextStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Edit a document under the Text Type the Resolved Spec's `parts` hold, and
 * submit to see what is saved. */
export const UnderATextType: Story = { args: { textType: "article@3" } };

/** SpecForm's read mode: the editor, read-only. */
export const ReadMode: Story = {
	args: { textType: "article@3", mode: "read" },
};

/** A Text Type that needs a newer vocabulary than this editor bundles: the
 * field opens read-only and says why. */
export const NeedsANewerEditor: Story = { args: { textType: "future@1" } };
