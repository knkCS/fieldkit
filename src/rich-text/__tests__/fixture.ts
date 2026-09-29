// The round trip from the knkeditor-backed field to Go (#278): a document the
// field saves is written into a conformance fixture, which Go's
// `ValidateResolvedValue` replays (go/conformance_test.go) under the same
// Text Type.
//
// The TS test builds the whole fixture — Spec, Text Type Release, saved
// document — and compares it with the committed file, so the two cannot
// drift: when knkeditor starts saving a different document, the TS test fails
// with the diff, and `FIELDKIT_UPDATE_FIXTURES=1 npx vitest run
// src/rich-text` rewrites the file for Go to judge. The one thing normalised
// is the node ids, which knkeditor mints at random: they are renumbered in
// document order (`withOrdinalIds`), which keeps what Go checks of them — that
// every block has one and no two are the same.

import type { ResolvedTextType } from "@knkcms/knkeditor-vocabulary";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Field } from "../../schema/types";

export const ARTICLE = "article@3";

/** A Text Type allowing text wrappers and level-2 and -3 headings. */
export const ARTICLE_TEXT_TYPE = (): ResolvedTextType => ({
	minimumVocabularyVersion: "0.1.0",
	nodes: {
		doc: { options: {} },
		textWrapper: { options: {} },
		heading: { options: { levels: [2, 3] } },
		text: { options: {} },
	},
	marks: {},
});

export const bodyField = (): Field => ({
	field_type: "rich_text",
	config: {
		name: "Body",
		api_accessor: "body",
		required: true,
		instructions: "",
	},
	settings: { text_type: ARTICLE },
	system: false,
});

/** The document the form opens with. */
export const storedDocument = () => ({
	type: "doc",
	content: [
		{
			type: "textWrapper",
			attrs: { id: "a" },
			content: [{ type: "text", text: "Eins." }],
		},
	],
});

/** The edit the test makes, as a person would: a heading asked for at level
 * 1, which the Text Type does not allow, and a paragraph of text. */
export function editDocument(editor: TiptapEditor) {
	editor.commands.insertContentAt(editor.state.doc.content.size, [
		{
			type: "heading",
			attrs: { level: 1 },
			content: [{ type: "text", text: "Neu" }],
		},
		{
			type: "textWrapper",
			content: [{ type: "text", text: "Zwei." }],
		},
	]);
}

type Json = unknown;

/** `document` with every node's `attrs.id` renumbered `n1`, `n2`, … in
 * document order. */
export function withOrdinalIds(document: Json): Json {
	let next = 0;
	const visit = (node: Json): Json => {
		if (Array.isArray(node)) return node.map(visit);
		if (node === null || typeof node !== "object") return node;
		const out: Record<string, Json> = { ...(node as Record<string, Json>) };
		const attrs = out.attrs as Record<string, Json> | undefined;
		if (
			typeof out.type === "string" &&
			attrs &&
			typeof attrs === "object" &&
			"id" in attrs &&
			attrs.id != null
		) {
			next += 1;
			out.attrs = { ...attrs, id: `n${next}` };
		}
		if (Array.isArray(out.content)) out.content = out.content.map(visit);
		return out;
	};
	return visit(document);
}

/** Where the fixture lives, from the repository root. */
export const FIXTURE_PATH =
	"conformance/unreleased/validate-value/rich-text-saved-by-editor.json";

/** The fixture a saved document makes. */
export function fixtureFor(saved: Json) {
	return {
		description:
			"A document the knkeditor-backed rich_text field (@knkcs/fieldkit/rich-text) saved under its Text Type, written by src/rich-text/__tests__/knk-rich-text-field.test.tsx: Go's ValidateResolvedValue accepts it (#278). Regenerate with FIELDKIT_UPDATE_FIXTURES=1, never by hand",
		spec: [bodyField()],
		releases: { text_type: { [ARTICLE]: ARTICLE_TEXT_TYPE() } },
		data: { body: withOrdinalIds(saved) },
		expect: { validateValue: [] },
	};
}
