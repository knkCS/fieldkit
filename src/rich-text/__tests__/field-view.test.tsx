import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { EditorHost, type InitialView } from "@knkcms/knkeditor-editor";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { FieldRenderer } from "../../renderer/field-renderer";
import { FieldKitProvider } from "../../renderer/provider";
import { SpecForm } from "../../renderer/spec-form/spec-form";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { resolveSpec } from "../../schema/resolve-spec";
import type { Field } from "../../schema/types";
import { knkRichTextPlugin } from "..";
import { ARTICLE_TEXT_TYPE, bodyField, storedDocument } from "./fixture";

// The Field view in a rich-text Field's label row (contenthub ADR 0033,
// contenthub#677): knkeditor's `FieldView`, bound to the Field's own editor
// by its view key, at the right end of the row where the Reference Field puts
// Find and Expand/Collapse all — in the form and in read mode, inside an
// `EditorHost`. Outside one the editor keeps its own view menu.

const plugins: FieldTypePlugin[] = builtInFieldTypes.map((plugin) =>
	plugin.id === "rich_text" ? knkRichTextPlugin : plugin,
);

const summaryField = (): Field => ({
	...bodyField(),
	config: { ...bodyField().config, name: "Summary", api_accessor: "summary" },
});

// knkeditor's i18next reads German from jsdom here and may read English
// elsewhere: the names match either.
const VIEW_OF = (field: string) =>
	new RegExp(`^(View of|Ansicht von) ${field}$`);
const EDITING = /^(Editing|Bearbeiten)$/;
const STRUCTURE = /^(Structure|Struktur)$/;
const PROOF = /^(Proof|Korrektur)$/;
const READING = /^(Reading|Lesen)$/;

/** Every layer on: a mix no preset names. */
const ALL_LAYERS = {
	structure: true,
	characters: true,
	lookalikes: true,
	typesetting: true,
	review: true,
};

function Form({ children }: { children: ReactNode }) {
	const methods = useForm({
		defaultValues: { body: storedDocument(), summary: storedDocument() },
	});
	return <FormProvider {...methods}>{children}</FormProvider>;
}

async function renderFields(
	fields: Field[],
	{
		mode = "edit",
		wrap = (node) => node,
		values,
	}: {
		mode?: "edit" | "read";
		wrap?: (node: ReactNode) => ReactNode;
		values?: Record<string, unknown>;
	} = {},
) {
	const resolved = await resolveSpec(
		fields,
		{ parts: { text_type: async () => ARTICLE_TEXT_TYPE() } },
		{ plugins },
	);
	const body =
		mode === "edit" ? (
			<Form>
				<FieldRenderer schema={resolved.fields} />
			</Form>
		) : (
			<SpecForm
				schema={resolved.fields}
				mode="read"
				values={values ?? { body: storedDocument(), summary: storedDocument() }}
			/>
		);
	const view = render(
		<ChakraProvider value={defaultSystem}>
			{wrap(
				<FieldKitProvider plugins={plugins} parts={resolved.parts}>
					{body}
				</FieldKitProvider>,
			)}
		</ChakraProvider>,
	);
	await waitFor(() =>
		expect(view.container.querySelectorAll(".ProseMirror").length).toBe(
			fields.length,
		),
	);
	return view;
}

const inHost = (node: ReactNode) => <EditorHost>{node}</EditorHost>;

/** The Field view named for `field`. */
const fieldView = (field: string) =>
	screen.getByRole("group", { name: VIEW_OF(field) });

/** The label row `view` sits at the right end of, by its actions slot. */
function labelRowOf(view: HTMLElement): HTMLElement {
	const slot = view.closest<HTMLElement>("[data-field-label-actions]");
	if (!slot?.parentElement) throw new Error("not in a label row");
	return slot.parentElement;
}

/** The layers the editor of the Field labelled `field` draws. */
function layersOf(container: HTMLElement, field: string): string | null {
	const label = within(container)
		.getAllByText(field)
		.find((node) => node.closest("[data-field-label-actions]") === null);
	const root =
		label?.closest("[role=group], .chakra-field__root") ?? label?.parentElement;
	return (
		root
			?.querySelector("[data-view-layers]")
			?.getAttribute("data-view-layers") ?? null
	);
}

describe("the rich-text Field's view in its label row", () => {
	it("sits at the right end of the form's label row, named for the Field", async () => {
		await renderFields([bodyField()], { wrap: inHost });
		const view = fieldView("Body");
		const row = labelRowOf(view);
		expect(within(row).getByText("Body")).toBeInTheDocument();
		// The presets, Editing in the middle, and Layers.
		const presets = within(view).getAllByRole("radio");
		expect(presets).toHaveLength(3);
		expect(within(view).getByRole("radio", { name: EDITING })).toBeChecked();
		expect(view.querySelector("[data-field-view-layers]")).toBeInTheDocument();
	});

	it("sits in read mode's label row too, its middle preset reading Structure", async () => {
		await renderFields([bodyField()], { wrap: inHost, mode: "read" });
		const view = fieldView("Body");
		expect(within(labelRowOf(view)).getByText("Body")).toBeInTheDocument();
		expect(
			within(view).getByRole("radio", { name: STRUCTURE }),
		).toBeInTheDocument();
		expect(within(view).queryByRole("radio", { name: EDITING })).toBeNull();
	});

	it("gives each Field its own, and changes only that Field's view", async () => {
		const { container } = await renderFields([bodyField(), summaryField()], {
			wrap: inHost,
		});
		const body = fieldView("Body");
		const summary = fieldView("Summary");
		expect(labelRowOf(body)).not.toBe(labelRowOf(summary));
		const before = layersOf(container, "Summary");
		expect(layersOf(container, "Body")).toBe(before);

		await userEvent.click(within(body).getByRole("radio", { name: PROOF }));

		await waitFor(() =>
			expect(within(body).getByRole("radio", { name: PROOF })).toBeChecked(),
		);
		expect(layersOf(container, "Body")).not.toBe(before);
		expect(layersOf(container, "Summary")).toBe(before);
		expect(within(summary).getByRole("radio", { name: EDITING })).toBeChecked();
	});

	it("gives each of a Group's rows its own in read mode", async () => {
		const group: Field = {
			field_type: "group",
			config: {
				name: "Sections",
				api_accessor: "sections",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [bodyField()],
			system: false,
		};
		const resolved = await resolveSpec(
			[group],
			{ parts: { text_type: async () => ARTICLE_TEXT_TYPE() } },
			{ plugins },
		);
		const { container } = render(
			<ChakraProvider value={defaultSystem}>
				<EditorHost>
					<FieldKitProvider plugins={plugins} parts={resolved.parts}>
						<SpecForm
							schema={resolved.fields}
							mode="read"
							values={{
								sections: [
									{ _id: "s1", body: storedDocument() },
									{ _id: "s2", body: storedDocument() },
								],
							}}
						/>
					</FieldKitProvider>
				</EditorHost>
			</ChakraProvider>,
		);
		await waitFor(() =>
			expect(container.querySelectorAll(".ProseMirror")).toHaveLength(2),
		);
		const [first, second] = screen.getAllByRole("group", {
			name: VIEW_OF("Body"),
		});
		if (!first || !second) throw new Error("two views expected");
		await userEvent.click(within(first).getByRole("radio", { name: PROOF }));
		await waitFor(() =>
			expect(within(first).getByRole("radio", { name: PROOF })).toBeChecked(),
		);
		expect(
			within(second).getByRole("radio", { name: PROOF }),
		).not.toBeChecked();
	});

	it("acts on the host's view of the Field, which the host seeds and observes", async () => {
		const initialView: InitialView = (key) =>
			key === "body" ? ALL_LAYERS : undefined;
		const onViewChange = vi.fn();
		const { container } = await renderFields([bodyField(), summaryField()], {
			wrap: (node) => (
				<EditorHost initialView={initialView} onViewChange={onViewChange}>
					{node}
				</EditorHost>
			),
		});
		const body = fieldView("Body");
		// Seeded by the Field's accessor: a mix no preset names.
		expect(layersOf(container, "Body")).toBe(
			"structure characters typesetting review",
		);
		for (const preset of within(body).getAllByRole("radio"))
			expect(preset).not.toBeChecked();
		expect(
			within(fieldView("Summary")).getByRole("radio", { name: EDITING }),
		).toBeChecked();

		await userEvent.click(within(body).getByRole("radio", { name: READING }));
		await waitFor(() =>
			expect(onViewChange).toHaveBeenCalledWith("body", expect.any(Object)),
		);
		expect(onViewChange.mock.calls.every(([key]) => key === "body")).toBe(true);
	});

	it("is not drawn outside an EditorHost, where the editor keeps its own view menu", async () => {
		const { container } = await renderFields([bodyField()]);
		expect(screen.queryByRole("group", { name: VIEW_OF("Body") })).toBeNull();
		const slot = container.querySelector("[data-field-label-actions]");
		expect(slot?.childElementCount ?? 0).toBe(0);
	});
});
