// src/editor/__tests__/choice-settings.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { checkboxesPlugin } from "../../schema/field-types/checkboxes";
import { radioPlugin } from "../../schema/field-types/radio";
import { selectPlugin } from "../../schema/field-types/select";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import {
	DEFAULT_EDITOR_LABELS,
	type EditorLabels,
	SpecEditor,
} from "../spec-editor";
import { EditorWrap, testPlugins } from "./editor-helpers";

/**
 * The choice types' Options, authored in a rendered SpecEditor the way an
 * Author does (ADR-0028): through the config panel's Type settings tab, saved
 * through the header's Save, and checked against the same validateSpec a
 * host runs on what it receives.
 */
const PLUGINS: FieldTypePlugin[] = [
	...testPlugins,
	selectPlugin,
	radioPlugin,
	checkboxesPlugin,
];
const PLUGIN_MAP = new Map(PLUGINS.map((p) => [p.id, p]));

function choiceField(
	type: string,
	settings: Record<string, unknown> | null = null,
): Field {
	return {
		field_type: type,
		config: {
			name: "Size",
			api_accessor: "size",
			required: false,
			instructions: "",
		},
		settings,
		system: false,
	};
}

async function openEditor(
	field: Field,
	labels?: EditorLabels,
): Promise<{
	user: ReturnType<typeof userEvent.setup>;
	onCommit: ReturnType<typeof vi.fn>;
}> {
	const user = userEvent.setup();
	const onCommit = vi.fn();
	render(
		<EditorWrap plugins={PLUGINS}>
			<SpecEditor
				schema={[field]}
				onCommit={onCommit}
				plugins={PLUGINS}
				labels={labels}
			/>
		</EditorWrap>,
	);
	await user.click(screen.getByTestId("shell-size"));
	await user.click(screen.getByRole("tab", { name: "Type settings" }));
	return { user, onCommit };
}

async function save(): Promise<void> {
	await act(async () => {
		fireEvent.click(
			screen.getByRole("button", { name: DEFAULT_EDITOR_LABELS.save }),
		);
	});
}

function committedSettings(onCommit: ReturnType<typeof vi.fn>): unknown {
	expect(onCommit).toHaveBeenCalledTimes(1);
	const committed = onCommit.mock.calls[0][0] as Schema;
	expect(validateSpec(committed, PLUGIN_MAP).fieldErrors).toEqual([]);
	return committed[0].settings;
}

describe("the choice types' Options in the SpecEditor", () => {
	it.each([
		"select",
		"radio",
		"checkboxes",
	])("%s: adds Options whose Keys follow their Labels, and saves them in order", async (type) => {
		const { user, onCommit } = await openEditor(choiceField(type));
		expect(screen.getByTestId("choice-options-empty")).toBeInTheDocument();

		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 1"), "Sehr groß");
		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 2"), "12 Monate");
		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 3"), "Low");

		expect(screen.getByLabelText("Key of option 1")).toHaveValue("sehr-gross");
		expect(screen.getByLabelText("Key of option 2")).toHaveValue("12-monate");

		await save();
		expect(committedSettings(onCommit)).toEqual({
			options: [
				{ key: "sehr-gross", label: "Sehr groß" },
				{ key: "12-monate", label: "12 Monate" },
				{ key: "low", label: "Low" },
			],
		});
	});

	it("stops suggesting a Key once the Author edits it by hand", async () => {
		const { user, onCommit } = await openEditor(choiceField("radio"));

		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 1"), "Medium");
		const key = screen.getByLabelText("Key of option 1");
		await user.clear(key);
		await user.type(key, "m");
		await user.type(screen.getByLabelText("Label of option 1"), " size");

		expect(screen.getByLabelText("Label of option 1")).toHaveValue(
			"Medium size",
		);
		expect(key).toHaveValue("m");

		await save();
		expect(committedSettings(onCommit)).toEqual({
			options: [{ key: "m", label: "Medium size" }],
		});
	});

	it("relabels a stored Option without touching its Key, edits a Key and removes an Option", async () => {
		const { user, onCommit } = await openEditor(
			choiceField("checkboxes", {
				options: [
					{ key: "s", label: "Small" },
					{ key: "m", label: "Medium" },
					{ key: "l", label: "Large" },
				],
			}),
		);

		const label = screen.getByLabelText("Label of option 1");
		await user.clear(label);
		await user.type(label, "Tiny");
		expect(screen.getByLabelText("Key of option 1")).toHaveValue("s");

		const key = screen.getByLabelText("Key of option 3");
		await user.clear(key);
		await user.type(key, "xl");

		await user.click(screen.getByRole("button", { name: "Remove option 2" }));

		await save();
		expect(committedSettings(onCommit)).toEqual({
			options: [
				{ key: "s", label: "Tiny" },
				{ key: "xl", label: "Large" },
			],
		});
	});

	it("offers select's Multiple toggle, and only select's", async () => {
		const { user, onCommit } = await openEditor(
			choiceField("select", { options: [{ key: "a", label: "A" }] }),
		);

		await user.click(screen.getByLabelText("Multiple"));
		await save();
		expect(committedSettings(onCommit)).toEqual({
			options: [{ key: "a", label: "A" }],
			multiple: true,
		});
	});

	it.each([
		"radio",
		"checkboxes",
	])("%s has no Multiple toggle", async (type) => {
		await openEditor(
			choiceField(type, { options: [{ key: "a", label: "A" }] }),
		);
		expect(screen.queryByTestId("choice-multiple")).toBeNull();
		expect(screen.getByLabelText("Key of option 1")).toHaveValue("a");
	});

	it("shows invalid rows inline, from the rules validateSpec applies", async () => {
		const { user } = await openEditor(
			choiceField("select", {
				options: [
					{ key: "Bad Key", label: "Bad" },
					{ key: "ok", label: "Ok" },
					{ key: "ok", label: "Ok again" },
					{ key: "fine", label: "Fine" },
				],
			}),
		);

		expect(screen.getByTestId("choice-option-0-key-error")).toHaveTextContent(
			DEFAULT_EDITOR_LABELS.choiceOptionErrorKey,
		);
		expect(screen.queryByTestId("choice-option-1-key-error")).toBeNull();
		expect(screen.getByTestId("choice-option-2-key-error")).toHaveTextContent(
			'Key "ok" is used by an earlier option',
		);
		expect(screen.getByLabelText("Key of option 3")).toHaveAttribute(
			"aria-invalid",
			"true",
		);

		await user.clear(screen.getByLabelText("Label of option 4"));
		expect(screen.getByTestId("choice-option-3-label-error")).toHaveTextContent(
			DEFAULT_EDITOR_LABELS.choiceOptionErrorLabel,
		);

		// A row just added is blank, and says nothing until it is filled in.
		await user.click(screen.getByTestId("choice-option-add"));
		expect(screen.queryByTestId("choice-option-4-key-error")).toBeNull();
		expect(screen.queryByTestId("choice-option-4-label-error")).toBeNull();

		// Fixing a row clears its error.
		const key = screen.getByLabelText("Key of option 1");
		await user.clear(key);
		await user.type(key, "bad-key");
		expect(screen.queryByTestId("choice-option-0-key-error")).toBeNull();
	});

	it("renders every string from the editor's labels", async () => {
		const { user } = await openEditor(choiceField("select"), {
			choiceOptions: "Optionen",
			choiceOptionsEmpty: "Noch keine Optionen",
			choiceOptionAdd: "Option hinzufügen",
			choiceOptionLabelOf: "Bezeichnung von Option {n}",
			choiceOptionKeyOf: "Schlüssel von Option {n}",
			choiceOptionRemove: "Option {n} entfernen",
			choiceMultiple: "Mehrfach",
			choiceOptionErrorDuplicateKey: 'Schlüssel "{key}" ist vergeben',
		});

		expect(screen.getByText("Optionen")).toBeInTheDocument();
		expect(screen.getByText("Noch keine Optionen")).toBeInTheDocument();
		expect(screen.getByLabelText("Mehrfach")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Option hinzufügen" }));
		await user.type(screen.getByLabelText("Bezeichnung von Option 1"), "A");
		await user.click(screen.getByRole("button", { name: "Option hinzufügen" }));
		await user.type(screen.getByLabelText("Bezeichnung von Option 2"), "A");
		expect(screen.getByLabelText("Schlüssel von Option 2")).toHaveValue("a");
		expect(screen.getByText('Schlüssel "a" ist vergeben')).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Option 2 entfernen" }),
		).toBeInTheDocument();
	});

	it("honours a frozen options or multiple setting (ADR-0011)", async () => {
		const field = choiceField("select", {
			options: [{ key: "a", label: "A" }],
		});
		field.config.locked_settings = [
			{ key: "options", reason: "Content uses these" },
			{ key: "multiple", reason: "Fixed by the app" },
		];
		await openEditor(field);

		expect(screen.getByLabelText("Label of option 1")).toBeDisabled();
		expect(screen.getByLabelText("Key of option 1")).toBeDisabled();
		expect(screen.getByTestId("choice-option-add")).toBeDisabled();
		expect(screen.getByLabelText("Multiple")).toBeDisabled();
		expect(screen.getByText("Content uses these")).toBeInTheDocument();
		expect(screen.getByText("Fixed by the app")).toBeInTheDocument();
	});
});
