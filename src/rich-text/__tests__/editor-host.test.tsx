import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	EditorHost,
	Inspector,
	useFocusedEditor,
	ViewControl,
} from "@knkcms/knkeditor-editor";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FieldRenderer } from "../../renderer/field-renderer";
import { FieldKitProvider } from "../../renderer/provider";
import { SpecForm } from "../../renderer/spec-form/spec-form";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { resolveSpec } from "../../schema/resolve-spec";
import { knkRichTextPlugin } from "..";
import { ARTICLE_TEXT_TYPE, bodyField, storedDocument } from "./fixture";

// The rich-text field inside a knkeditor `EditorHost` (contenthub#632, contenthub ADR
// 0031): the page places one Inspector and one View control, and the
// fields have none of their own — knkeditor switches them off inside a host
// (contenthub#628), fieldkit passes nothing for it. Outside a host the field
// keeps its own.

// Focusing an editor makes ProseMirror scroll its selection into view, which
// measures a Range — and jsdom's Range has no layout. Empty rects stand in.
const rangeRects = Object.getOwnPropertyDescriptors(Range.prototype);
beforeAll(() => {
	Range.prototype.getClientRects = () =>
		[] as unknown as ReturnType<Range["getClientRects"]>;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterAll(() => {
	for (const key of ["getClientRects", "getBoundingClientRect"] as const) {
		const original = rangeRects[key];
		if (original) Object.defineProperty(Range.prototype, key, original);
		else delete (Range.prototype as Partial<Range>)[key];
	}
});

const plugins: FieldTypePlugin[] = builtInFieldTypes.map((plugin) =>
	plugin.id === "rich_text" ? knkRichTextPlugin : plugin,
);

const resolveUnder = () =>
	resolveSpec(
		[bodyField()],
		{ parts: { text_type: async () => ARTICLE_TEXT_TYPE() } },
		{ plugins },
	);

/** A document for the read view, told apart from the edit form's. */
const readDocument = () => ({
	type: "doc",
	content: [
		{
			type: "textWrapper",
			attrs: { id: "r" },
			content: [{ type: "text", text: "Gelesen." }],
		},
	],
});

function Form({ children }: { children: ReactNode }) {
	const methods = useForm({ defaultValues: { body: storedDocument() } });
	return <FormProvider {...methods}>{children}</FormProvider>;
}

/** The tiptap editor behind each `.ProseMirror` in `within`, in page order. */
function editorsIn(within: HTMLElement): TiptapEditor[] {
	return [...within.querySelectorAll(".ProseMirror")].map((dom) => {
		const editor = (dom as HTMLElement & { editor?: TiptapEditor }).editor;
		if (!editor) throw new Error("no editor behind .ProseMirror");
		return editor;
	});
}

/** The text of the editor the host's parts follow. */
function FocusedProbe() {
	const focused = useFocusedEditor();
	return (
		<output data-testid="focused">
			{focused ? focused.editor.state.doc.textContent : "none"}
		</output>
	);
}

/** An edit field and a read view of the same rich-text Field. */
async function twoFields(wrap: (fields: ReactNode) => ReactNode) {
	const resolved = await resolveUnder();
	const fields = (
		<FieldKitProvider plugins={plugins} parts={resolved.parts}>
			<section data-testid="edit">
				<Form>
					<FieldRenderer schema={resolved.fields} />
				</Form>
			</section>
			<section data-testid="read">
				<SpecForm
					schema={resolved.fields}
					mode="read"
					values={{ body: readDocument() }}
				/>
			</section>
		</FieldKitProvider>
	);
	const view = render(
		<ChakraProvider value={defaultSystem}>{wrap(fields)}</ChakraProvider>,
	);
	await waitFor(() =>
		expect(view.container.querySelectorAll(".ProseMirror")).toHaveLength(2),
	);
	return view;
}

// knkeditor's i18next picks the language up from jsdom, which reads German
// here and may read English elsewhere: the names match either.
const INSPECTOR_TOGGLE = /^(Inspector|Inspektor)$/;
const VIEW_MENU = /^(View|Ansicht):/;

/** A field's own Inspector toggle and view menu, by their toolbar names. */
const ownControls = (field: HTMLElement) => ({
	inspector: within(field).queryAllByRole("button", { name: INSPECTOR_TOGGLE }),
	viewMenu: within(field).queryAllByRole("button", { name: VIEW_MENU }),
	docked: field.querySelectorAll("[data-inspector-placement]"),
});

describe("the rich-text field inside an EditorHost", () => {
	it("has no Inspector or view menu of its own, in edit or read mode", async () => {
		await twoFields((fields) => <EditorHost>{fields}</EditorHost>);
		for (const id of ["edit", "read"]) {
			const own = ownControls(screen.getByTestId(id));
			expect(own.inspector).toHaveLength(0);
			expect(own.viewMenu).toHaveLength(0);
			expect(own.docked).toHaveLength(0);
		}
	});

	it("lets the host's Inspector and View control follow focus across both fields", async () => {
		const { container } = await twoFields((fields) => (
			<EditorHost>
				<aside data-testid="rail">
					<ViewControl />
					<Inspector fallback={<p>Nothing focused</p>} />
					<FocusedProbe />
				</aside>
				{fields}
			</EditorHost>
		));
		const rail = screen.getByTestId("rail");
		expect(screen.getByTestId("focused")).toHaveTextContent("none");
		expect(within(rail).getByText("Nothing focused")).toBeInTheDocument();
		// The page's one View control.
		expect(
			within(rail).getByRole("button", { name: VIEW_MENU }),
		).toBeInTheDocument();

		const [edit, read] = editorsIn(container);
		// Focus as the browser gives it; jsdom has no layout for a click to
		// place a cursor by.
		act(() => edit.view.dom.focus());
		await waitFor(() =>
			expect(screen.getByTestId("focused")).toHaveTextContent("Eins."),
		);
		expect(within(rail).queryByText("Nothing focused")).toBeNull();

		// A read-only editor takes focus too (knkeditor#625).
		act(() => read.view.dom.focus());
		await waitFor(() =>
			expect(screen.getByTestId("focused")).toHaveTextContent("Gelesen."),
		);
	});
});

describe("the rich-text field outside an EditorHost", () => {
	it("keeps its own Inspector, which docks beside the document, and its view menu", async () => {
		await twoFields((fields) => fields);
		// The read view has a view menu of its own outside a host, too.
		expect(ownControls(screen.getByTestId("read")).viewMenu).toHaveLength(1);
		const edit = screen.getByTestId("edit");
		expect(ownControls(edit).viewMenu).toHaveLength(1);
		const [toggle] = ownControls(edit).inspector;
		expect(toggle).toBeDefined();
		expect(ownControls(edit).docked).toHaveLength(0);
		await userEvent.click(toggle as HTMLElement);
		await waitFor(() =>
			expect(edit.querySelector("[data-inspector-placement]")).not.toBeNull(),
		);
	});
});
