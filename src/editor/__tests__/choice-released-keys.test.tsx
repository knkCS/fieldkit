// src/editor/__tests__/choice-released-keys.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { groupPlugin } from "../../schema/field-types/group";
import { radioPlugin } from "../../schema/field-types/radio";
import { selectPlugin } from "../../schema/field-types/select";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import {
	DEFAULT_EDITOR_LABELS,
	type EditorLabels,
	SpecEditor,
} from "../spec-editor";
import {
	EditorWrap,
	keyboardMoveOption,
	mockOptionRects,
	shownOptionLabels,
	testPlugins,
} from "./editor-helpers";

/**
 * A released Option's Key is fixed in the editor (ADR-0028, fieldkit#365):
 * Content stores Keys, so renaming one orphans them. Authored through a
 * rendered SpecEditor given the latest Release's Spec as `releasedSpec`.
 */
const PLUGINS: FieldTypePlugin[] = [
	...testPlugins,
	selectPlugin,
	radioPlugin,
	groupPlugin,
];

const NOTE = DEFAULT_EDITOR_LABELS.choiceOptionKeyReleased;

function choiceField(
	accessor: string,
	options: { key: string; label: string }[],
	type = "select",
): Field {
	return {
		field_type: type,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: { options },
		system: false,
	};
}

const RELEASED: Schema = [
	choiceField("size", [
		{ key: "s", label: "Small" },
		{ key: "m", label: "Medium" },
	]),
];

async function openEditor(
	schema: Schema,
	releasedSpec: Schema | undefined,
	accessor = "size",
	labels?: EditorLabels,
) {
	const user = userEvent.setup();
	const onCommit = vi.fn();
	render(
		<EditorWrap plugins={PLUGINS}>
			<SpecEditor
				schema={schema}
				releasedSpec={releasedSpec}
				onCommit={onCommit}
				plugins={PLUGINS}
				labels={labels}
			/>
		</EditorWrap>,
	);
	await user.click(screen.getByTestId(`shell-${accessor}`));
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

function key(n: number): HTMLElement {
	return screen.getByLabelText(`Key of option ${n}`);
}

describe("a released Option's Key in the SpecEditor", () => {
	it("is read-only, with an explanation, while unreleased Keys stay editable", async () => {
		await openEditor(
			[
				choiceField("size", [
					{ key: "s", label: "Small" },
					{ key: "m", label: "Medium" },
					{ key: "l", label: "Large" },
				]),
			],
			RELEASED,
		);

		expect(key(1)).toHaveAttribute("readonly");
		expect(key(2)).toHaveAttribute("readonly");
		expect(key(3)).not.toHaveAttribute("readonly");
		expect(key(3)).toBeEnabled();
		expect(screen.getByText(NOTE)).toBeInTheDocument();
		expect(key(1)).toHaveAccessibleDescription(NOTE);
		expect(key(3)).not.toHaveAccessibleDescription(NOTE);
	});

	it("can't be typed over", async () => {
		const { user, onCommit } = await openEditor(RELEASED, RELEASED);
		await user.type(key(1), "x");
		expect(key(1)).toHaveValue("s");
		await save();
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("leaves the Option to be relabelled and removed, and the lock follows the Key", async () => {
		const { user, onCommit } = await openEditor(RELEASED, RELEASED);

		const label = screen.getByLabelText("Label of option 2");
		await user.clear(label);
		await user.type(label, "Mid");
		expect(key(2)).toHaveValue("m");

		await user.click(screen.getByRole("button", { name: "Remove option 1" }));
		// "m" is now the first row, and still locked: the lock is the Key's,
		// not the place's — which is what keeps it on the Option when it moves.
		expect(key(1)).toHaveValue("m");
		expect(key(1)).toHaveAttribute("readonly");

		await save();
		expect(onCommit.mock.calls[0][0][0].settings).toEqual({
			options: [{ key: "m", label: "Mid" }],
		});
	});

	it("keeps a new Option's Key editable, even when it takes a released Key", async () => {
		const { user, onCommit } = await openEditor(RELEASED, RELEASED);

		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 3"), "Large");
		expect(key(3)).toHaveValue("large");
		expect(key(3)).not.toHaveAttribute("readonly");
		await user.clear(key(3));
		await user.type(key(3), "l");
		expect(key(3)).toHaveValue("l");

		// Removed and re-added under its released Key, the Option is the
		// released one again, but the Author is mid-edit: no lock until the
		// list arrives from outside the editor.
		await user.click(screen.getByRole("button", { name: "Remove option 1" }));
		await user.click(screen.getByTestId("choice-option-add"));
		await user.type(screen.getByLabelText("Label of option 3"), "S");
		expect(key(3)).toHaveValue("s");
		expect(key(3)).not.toHaveAttribute("readonly");

		await save();
		expect(onCommit.mock.calls[0][0][0].settings).toEqual({
			options: [
				{ key: "m", label: "Medium" },
				{ key: "l", label: "Large" },
				{ key: "s", label: "S" },
			],
		});
	});

	it("stays with its Option when the Option is reordered (fieldkit#364)", async () => {
		const rects = mockOptionRects();
		try {
			const { user, onCommit } = await openEditor(RELEASED, RELEASED);

			await keyboardMoveOption(1, ["ArrowDown"]);
			expect(shownOptionLabels()).toEqual(["Medium", "Small"]);
			expect(key(1)).toHaveValue("m");
			expect(key(1)).toHaveAttribute("readonly");
			expect(key(2)).toHaveValue("s");
			expect(key(2)).toHaveAttribute("readonly");

			// An Option added in this session under a released Key stays the
			// Author's to edit wherever it moves: what was added moves with it.
			await user.click(screen.getByRole("button", { name: "Remove option 2" }));
			await user.click(screen.getByTestId("choice-option-add"));
			await user.type(screen.getByLabelText("Label of option 2"), "S");
			await keyboardMoveOption(2, ["ArrowUp"]);
			expect(shownOptionLabels()).toEqual(["S", "Medium"]);
			expect(key(1)).toHaveValue("s");
			expect(key(1)).not.toHaveAttribute("readonly");
			expect(key(2)).toHaveValue("m");
			expect(key(2)).toHaveAttribute("readonly");

			await save();
			expect(onCommit.mock.calls[0][0][0].settings).toEqual({
				options: [
					{ key: "s", label: "S" },
					{ key: "m", label: "Medium" },
				],
			});
		} finally {
			rects.mockRestore();
		}
	});

	it("leaves every Key editable without a releasedSpec", async () => {
		await openEditor(RELEASED, undefined);
		expect(key(1)).not.toHaveAttribute("readonly");
		expect(key(2)).not.toHaveAttribute("readonly");
		expect(screen.queryByText(NOTE)).toBeNull();
	});

	it("matches the same Field by its Accessor, not by its type or place", async () => {
		await openEditor(
			[
				choiceField("colour", [{ key: "s", label: "Small" }]),
				choiceField("size", [{ key: "s", label: "Small" }], "radio"),
			],
			RELEASED,
			"colour",
		);
		// "colour" holds Key "s", but the Release holds "s" for "size" only.
		expect(key(1)).not.toHaveAttribute("readonly");
	});

	it("matches a Field inside a group by its path", async () => {
		const group = (child: Field): Field => ({
			field_type: "group",
			config: {
				name: "Rows",
				api_accessor: "rows",
				required: false,
				instructions: "",
			},
			settings: null,
			children: [child],
			system: false,
		});
		const { user } = await openEditor(
			[group(RELEASED[0])],
			[group(RELEASED[0])],
			"rows",
		);
		await user.click(screen.getByRole("tab", { name: "General" }));
		await user.click(screen.getByTestId("panel-child-edit-size"));
		await user.click(screen.getByRole("tab", { name: "Type settings" }));
		expect(key(1)).toHaveAttribute("readonly");
	});

	it("renders the explanation from the editor's labels", async () => {
		await openEditor(RELEASED, RELEASED, "size", {
			choiceOptionKeyReleased: "Schlüssel ist veröffentlicht",
		});
		expect(
			screen.getByText("Schlüssel ist veröffentlicht"),
		).toBeInTheDocument();
	});
});
