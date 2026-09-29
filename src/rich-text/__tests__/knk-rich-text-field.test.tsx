import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { defaultEditorSettings, validate } from "@knkcms/knkeditor-vocabulary";
import { render, screen, waitFor } from "@testing-library/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { ReactNode } from "react";
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldRenderer } from "../../renderer/field-renderer";
import { FieldKitProvider } from "../../renderer/provider";
import { SpecForm } from "../../renderer/spec-form/spec-form";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { type ResolvedSpec, resolveSpec } from "../../schema/resolve-spec";
import type { Field } from "../../schema/types";
import { knkRichTextPlugin } from "..";
import {
	ARTICLE,
	ARTICLE_TEXT_TYPE,
	bodyField,
	editDocument,
	FIXTURE_PATH,
	fixtureFor,
	storedDocument,
} from "./fixture";

/** The committed fixture, rewritten first under FIELDKIT_UPDATE_FIXTURES. */
function committedFixture(expected: unknown): unknown {
	const file = path.resolve(__dirname, "../../..", FIXTURE_PATH);
	if (process.env.FIELDKIT_UPDATE_FIXTURES) {
		writeFileSync(file, `${JSON.stringify(expected, null, "\t")}\n`);
	}
	return JSON.parse(readFileSync(file, "utf8"));
}

// The knkeditor-backed rich_text field (ADR-0026), in jsdom. Kept to a few
// tests: each mounts a whole knkeditor editor.

const plugins: FieldTypePlugin[] = builtInFieldTypes.map((plugin) =>
	plugin.id === "rich_text" ? knkRichTextPlugin : plugin,
);

const summaryField = (): Field => ({
	...bodyField(),
	config: { ...bodyField().config, name: "Summary", api_accessor: "summary" },
});

function editorIn(container: HTMLElement): TiptapEditor {
	const dom = container.querySelector(".ProseMirror") as
		| (HTMLElement & { editor?: TiptapEditor })
		| null;
	if (!dom?.editor) throw new Error("no editor rendered");
	return dom.editor;
}

function renderForm(options: {
	resolved?: ResolvedSpec;
	schema?: Field[];
	adapters?: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
}) {
	let methods: UseFormReturn | undefined;
	function Form({ children }: { children: ReactNode }) {
		methods = useForm({ defaultValues: { body: storedDocument() } });
		return <FormProvider {...methods}>{children}</FormProvider>;
	}
	const view = render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider
				plugins={plugins}
				parts={options.resolved?.parts}
				adapters={options.adapters}
				onError={options.onError}
			>
				<Form>
					<FieldRenderer
						schema={options.resolved?.fields ?? options.schema ?? []}
					/>
				</Form>
			</FieldKitProvider>
		</ChakraProvider>,
	);
	return { ...view, form: () => methods as UseFormReturn };
}

const resolveUnder = (textType: unknown) =>
	resolveSpec(
		[bodyField()],
		{ parts: { text_type: async () => textType } },
		{ plugins },
	);

describe("KnkRichTextField", () => {
	it("edits a document under the Text Type the Resolved Spec's parts hold, and saves what Go accepts", async () => {
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
		const { container, form } = renderForm({ resolved });
		await waitFor(() =>
			expect(container.querySelector(".ProseMirror")).not.toBeNull(),
		);
		const editor = editorIn(container);

		// Opening a document is not an edit (knkeditor#608).
		expect(form().formState.dirtyFields).toEqual({});
		// The Text Type from `parts` configures the editor…
		expect(
			editor.extensionManager.extensions.find((e) => e.name === "heading")
				?.options.levels,
		).toEqual([2, 3]);

		editDocument(editor);

		const saved = form().getValues("body") as Record<string, unknown>;
		expect(saved).toStrictEqual(editor.getJSON());
		// …and normalises what is inserted to it: the level-1 heading is a 2.
		expect(
			saved.content as { type: string; attrs?: { level?: number } }[],
		).toContainEqual(
			expect.objectContaining({
				type: "heading",
				attrs: expect.objectContaining({ level: 2 }),
			}),
		);
		expect(validate(saved, ARTICLE_TEXT_TYPE())).toEqual([]);
		// Go's ValidateResolvedValue replays this fixture (./fixture.ts).
		const expected = fixtureFor(saved);
		expect(committedFixture(expected)).toStrictEqual(expected);
	});

	it("reads the document in the editor, read-only, in SpecForm's read mode", async () => {
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
		const { container } = render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={plugins} parts={resolved.parts}>
					<SpecForm
						schema={resolved.fields}
						mode="read"
						values={{ body: storedDocument() }}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);
		await waitFor(() =>
			expect(container.querySelector(".ProseMirror")).not.toBeNull(),
		);
		expect(editorIn(container).isEditable).toBe(false);
		expect(container.querySelector(".ProseMirror")).toHaveTextContent("Eins.");
	});

	it("falls back to the textType adapter for a Pin the parts don't hold, and fetches each once", async () => {
		const get = vi.fn(async () => ARTICLE_TEXT_TYPE());
		const settings = vi.fn(async () => defaultEditorSettings());
		const { container } = renderForm({
			schema: [bodyField(), summaryField()],
			adapters: { textType: { get }, editorSettings: { get: settings } },
		});
		await waitFor(() =>
			expect(container.querySelectorAll(".ProseMirror")).toHaveLength(2),
		);
		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith(ARTICLE);
		expect(settings).toHaveBeenCalledTimes(1);
	});

	it("opens read-only and says why when the Text Type needs a newer vocabulary", async () => {
		const resolved = await resolveUnder({
			...ARTICLE_TEXT_TYPE(),
			minimumVocabularyVersion: "9999.0.0",
		});
		const onError = vi.fn();
		const { container, form } = renderForm({ resolved, onError });
		await screen.findByText(/needs a newer editor.*Reload the page/);
		expect(screen.getByText("Eins.")).toBeInTheDocument();
		expect(container.querySelector(".ProseMirror")).toBeNull();
		// A page older than its Text Type is not a failure.
		expect(onError).not.toHaveBeenCalled();
		expect(form().getValues("body")).toStrictEqual(storedDocument());
	});

	it("shows the document read-only when its Text Type can't be loaded", async () => {
		const onError = vi.fn();
		const { container, form } = renderForm({ schema: [bodyField()], onError });
		await screen.findByText(/its Text Type \(article@3\) could not be loaded/);
		expect(container.querySelector(".ProseMirror")).toBeNull();
		expect(screen.getByText("Eins.")).toBeInTheDocument();
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "body");
		expect(form().getValues("body")).toStrictEqual(storedDocument());
	});
});
