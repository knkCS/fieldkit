import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	defaultEditorSettings,
	type ResolvedTextType,
	validate,
} from "@knkcms/knkeditor-vocabulary";
import { act, render, screen, waitFor } from "@testing-library/react";
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
	body?: unknown;
}) {
	let methods: UseFormReturn | undefined;
	const body = "body" in options ? options.body : storedDocument();
	function Form({ children }: { children: ReactNode }) {
		methods = useForm({ defaultValues: { body } });
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

		// The form hands its own edits back as deep clones: they must not
		// remount the editor, which would lose cursor and history.
		await act(async () => {
			form().setValue("other", "a change elsewhere clones the values too");
		});
		expect(editorIn(container)).toBe(editor);

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

	// The read view draws the page the editable field draws, without the
	// toolbar (contenthub#637, #643): knkeditor's read-only frame, reached
	// through knkeditor's own markers, as nothing else names the box and page.
	describe("in SpecForm's read mode", () => {
		function renderRead(options: {
			resolved?: ResolvedSpec;
			schema?: Field[];
			body: unknown;
		}) {
			return render(
				<ChakraProvider value={defaultSystem}>
					<FieldKitProvider plugins={plugins} parts={options.resolved?.parts}>
						<SpecForm
							schema={options.resolved?.fields ?? options.schema ?? []}
							mode="read"
							values={{ body: options.body }}
						/>
					</FieldKitProvider>
				</ChakraProvider>,
			);
		}

		it("reads the document on the Branch's page, read-only and without a toolbar", async () => {
			const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
			const { container } = renderRead({ resolved, body: storedDocument() });
			await waitFor(() =>
				expect(container.querySelector(".ProseMirror")).not.toBeNull(),
			);
			expect(editorIn(container).isEditable).toBe(false);
			const frame = container.querySelector("[data-knk-field-frame]");
			const page = frame?.querySelector("[data-knk-page-frame]");
			expect(page?.querySelector(".ProseMirror")).toHaveTextContent("Eins.");
			expect(screen.queryByRole("toolbar")).toBeNull();
		});

		it("reads a compact Field in the box, without a page", async () => {
			const compact: Field = {
				...bodyField(),
				settings: { ...bodyField().settings, view_mode: "compact" },
			};
			const resolved = await resolveSpec(
				[compact],
				{ parts: { text_type: async () => ARTICLE_TEXT_TYPE() } },
				{ plugins },
			);
			const { container } = renderRead({ resolved, body: storedDocument() });
			await waitFor(() =>
				expect(container.querySelector(".ProseMirror")).not.toBeNull(),
			);
			const frame = container.querySelector("[data-knk-field-frame]");
			expect(frame?.querySelector(".ProseMirror")).toHaveTextContent("Eins.");
			expect(container.querySelector("[data-knk-page-frame]")).toBeNull();
			expect(screen.queryByRole("toolbar")).toBeNull();
		});

		it("reads the text of a value that isn't a document", async () => {
			const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
			const { container } = renderRead({ resolved, body: "Legacy text" });
			expect(await screen.findByText("Legacy text")).toBeInTheDocument();
			expect(container.querySelector(".ProseMirror")).toBeNull();
			expect(container.querySelector("[data-knk-field-frame]")).toBeNull();
		});

		it("reads the text of a document whose Text Type can't be loaded", async () => {
			const { container } = renderRead({
				schema: [bodyField()],
				body: storedDocument(),
			});
			expect(await screen.findByText("Eins.")).toBeInTheDocument();
			expect(container.querySelector(".ProseMirror")).toBeNull();
			expect(container.querySelector("[data-knk-field-frame]")).toBeNull();
		});
	});

	it("edits on the same page, under a toolbar", async () => {
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
		const { container } = renderForm({ resolved });
		await waitFor(() =>
			expect(container.querySelector(".ProseMirror")).not.toBeNull(),
		);
		expect(editorIn(container).isEditable).toBe(true);
		const frame = container.querySelector("[data-knk-field-frame]");
		expect(
			frame?.querySelector("[data-knk-page-frame] .ProseMirror"),
		).not.toBeNull();
		expect(screen.getByRole("toolbar")).toBeInTheDocument();
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

	it("opens no editor over a stored value that isn't a document", async () => {
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
		const { container, form } = renderForm({ resolved, body: "Legacy text" });
		await screen.findByText(/isn't a rich-text document/);
		expect(screen.getByText("Legacy text")).toBeInTheDocument();
		expect(container.querySelector(".ProseMirror")).toBeNull();
		expect(form().getValues("body")).toBe("Legacy text");
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

	// knkeditor 2.3 / vocabulary 0.9 (knkboor/general#2067): a Text Type that
	// enables the task list needs vocabulary 0.9, so it opens an editor — not
	// the "newer editor" notice — and a tick is an edit the form saves.
	it("ticks a task list under a Text Type that needs vocabulary 0.9", async () => {
		const checklist = (): ResolvedTextType => ({
			minimumVocabularyVersion: "0.9.0",
			nodes: {
				doc: { options: {} },
				text: { options: {} },
				textWrapper: { options: {} },
				taskList: { options: {} },
				taskItem: { options: {} },
			},
			marks: {},
		});
		const resolved = await resolveUnder(checklist());
		const { container, form } = renderForm({
			resolved,
			body: {
				type: "doc",
				content: [
					{
						type: "taskList",
						attrs: { id: "l" },
						content: [
							{
								type: "taskItem",
								attrs: { id: "i", checked: false },
								content: [
									{
										type: "textWrapper",
										attrs: { id: "p" },
										content: [{ type: "text", text: "Prüfen" }],
									},
								],
							},
						],
					},
				],
			},
		});
		await waitFor(() =>
			expect(container.querySelector(".ProseMirror")).not.toBeNull(),
		);
		const checkbox = container.querySelector(
			'li[data-type="taskItem"] input[type="checkbox"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();
		expect(checkbox?.disabled).toBe(false);
		expect(form().formState.dirtyFields).toEqual({});

		await act(async () => {
			checkbox?.click();
		});

		const saved = form().getValues("body") as {
			content: { content: { attrs: { checked: boolean } }[] }[];
		};
		expect(saved.content[0].content[0].attrs.checked).toBe(true);
		expect(validate(saved, checklist())).toEqual([]);
	});
	// Editor 3 dropped the text block from its default extensions
	// (knkeditor#907); Content imported from core may hold one, so the field
	// registers it. Its valid place is inside an Absatz.
	describe("a legacy text block", () => {
		const legacy = (): ResolvedTextType => ({
			minimumVocabularyVersion: "0.1.0",
			nodes: {
				doc: { options: {} },
				paragraph: { options: {} },
				paragraphContent: { options: {} },
				textBlock: { options: {} },
				textWrapper: { options: {} },
				text: { options: {} },
			},
			marks: {},
		});
		const withTextBlock = () => ({
			type: "doc",
			content: [
				{
					type: "paragraph",
					attrs: { id: "p" },
					content: [
						{
							type: "paragraphContent",
							attrs: { id: "c" },
							content: [
								{
									type: "textBlock",
									attrs: { id: "t" },
									content: [
										{
											type: "textWrapper",
											attrs: { id: "w" },
											content: [{ type: "text", text: "Alter Fließtext." }],
										},
									],
								},
							],
						},
					],
				},
			],
		});
		/** The text of every text block in the editor's document. */
		const textBlocks = (editor: TiptapEditor) => {
			const texts: string[] = [];
			editor.state.doc.descendants((node) => {
				if (node.type.name === "textBlock") texts.push(node.textContent);
			});
			return texts;
		};

		it("is a valid document under its Text Type", () => {
			expect(validate(withTextBlock(), legacy())).toEqual([]);
		});

		it("loads in the edit field, and opening it is no edit", async () => {
			const resolved = await resolveUnder(legacy());
			const { container, form } = renderForm({
				resolved,
				body: withTextBlock(),
			});
			await waitFor(() =>
				expect(container.querySelector(".ProseMirror")).not.toBeNull(),
			);
			const editor = editorIn(container);
			expect(textBlocks(editor)).toEqual(["Alter Fließtext."]);
			expect(form().formState.dirtyFields).toEqual({});
			expect(form().getValues("body")).toStrictEqual(withTextBlock());
		});

		it("loads in the read view", async () => {
			const resolved = await resolveUnder(legacy());
			const { container } = render(
				<ChakraProvider value={defaultSystem}>
					<FieldKitProvider plugins={plugins} parts={resolved.parts}>
						<SpecForm
							schema={resolved.fields}
							mode="read"
							values={{ body: withTextBlock() }}
						/>
					</FieldKitProvider>
				</ChakraProvider>,
			);
			await waitFor(() =>
				expect(container.querySelector(".ProseMirror")).not.toBeNull(),
			);
			const editor = editorIn(container);
			expect(editor.isEditable).toBe(false);
			expect(textBlocks(editor)).toEqual(["Alter Fließtext."]);
		});
	});
});
