// src/editor/__tests__/generic-settings-form.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Star } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, LockedSetting, Schema } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { FieldConfigPanel } from "../field-config-panel";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { EditorWrap, testPlugins } from "./editor-helpers";

/**
 * A Consumer's field type with a `settingsSchema` and no `settingsComponent`:
 * one key of every shape the generic form edits, and one it can only show.
 */
const ratingPlugin: FieldTypePlugin = {
	id: "rating",
	name: "Rating",
	description: "Stars out of a maximum",
	icon: Star,
	category: "number",
	fieldComponent: () => null,
	toZodType: () => z.number(),
	settingsSchema: z
		.object({
			label: z.string().describe("Shown above the stars").optional(),
			max: z.number().int().min(1).optional(),
			half_steps: z.boolean().optional(),
			shape: z.enum(["star", "heart", "circle"]).optional(),
			captions: z.array(z.string()).optional(),
			layout: z
				.object({
					columns: z.number().int().optional(),
					compact: z.boolean().optional(),
				})
				.strict()
				.optional(),
			legend: z.record(z.string()).optional(),
		})
		.strict(),
};

const PLUGINS: FieldTypePlugin[] = [...testPlugins, ratingPlugin];

function ratingField(
	settings: Record<string, unknown> | null = null,
	locked?: LockedSetting[],
): Field {
	return {
		field_type: "rating",
		config: {
			name: "Score",
			api_accessor: "score",
			required: false,
			instructions: "",
			...(locked ? { locked_settings: locked } : {}),
		},
		settings,
		system: false,
	};
}

function renderPanel(initial: Field, plugin: FieldTypePlugin = ratingPlugin) {
	function Harness() {
		const [field, setField] = useState<Field>(initial);
		return (
			<div>
				<FieldConfigPanel
					field={field}
					plugin={plugin}
					plugins={PLUGINS}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={setField}
					onClose={() => {}}
					committedAccessors={new Set<string>()}
					baselineAccessor={initial.config.api_accessor}
					labels={DEFAULT_EDITOR_LABELS}
				/>
				<pre data-testid="dump">{JSON.stringify(field)}</pre>
			</div>
		);
	}
	render(
		<EditorWrap plugins={PLUGINS}>
			<Harness />
		</EditorWrap>,
	);
}

function panelSettings(): unknown {
	return (JSON.parse(screen.getByTestId("dump").textContent ?? "null") as Field)
		.settings;
}

async function openTypeSettings(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("tab", { name: "Type settings" }));
}

describe("a field type with no settingsComponent, in the SpecEditor", () => {
	it("is fully configurable from its settingsSchema, and saves settings the schema accepts", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(
			<EditorWrap plugins={PLUGINS}>
				<SpecEditor
					schema={[ratingField()]}
					onCommit={onCommit}
					plugins={PLUGINS}
				/>
			</EditorWrap>,
		);

		await user.click(screen.getByTestId("shell-score"));
		await openTypeSettings(user);

		// string
		await user.type(screen.getByLabelText("Label"), "Hi");
		// number
		await user.type(screen.getByLabelText("Max"), "9");
		// boolean
		await user.click(screen.getByLabelText("Half steps"));
		// enum
		await user.click(screen.getByLabelText("Shape"));
		await user.click(await screen.findByText("heart"));
		// list of scalars
		await user.click(screen.getByTestId("generic-setting-captions-add"));
		await user.type(screen.getByLabelText("Captions 1"), "Lo");
		await user.click(screen.getByTestId("generic-setting-captions-add"));
		await user.type(screen.getByLabelText("Captions 2"), "Up");
		// nested object
		await user.type(screen.getByLabelText("Columns"), "2");
		await user.click(screen.getByLabelText("Compact"));

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: DEFAULT_EDITOR_LABELS.save }),
			);
		});

		expect(onCommit).toHaveBeenCalledTimes(1);
		const committed = onCommit.mock.calls[0][0] as Schema;
		expect(committed[0].settings).toEqual({
			label: "Hi",
			max: 9,
			half_steps: true,
			shape: "heart",
			captions: ["Lo", "Up"],
			layout: { columns: 2, compact: true },
		});
		const result = validateSpec(
			committed,
			new Map(PLUGINS.map((plugin) => [plugin.id, plugin])),
		);
		expect(result.fieldErrors).toEqual([]);
		expect(result.valid).toBe(true);
	});
});

describe("GenericSettingsForm in the config panel", () => {
	it("shows the stored settings in their controls", async () => {
		const user = userEvent.setup();
		renderPanel(
			ratingField({
				label: "Stars",
				max: 5,
				half_steps: true,
				shape: "circle",
				captions: ["Low", "High"],
				layout: { columns: 3 },
			}),
		);
		await openTypeSettings(user);

		expect(screen.getByLabelText("Label")).toHaveValue("Stars");
		expect(screen.getByLabelText("Max")).toHaveValue(5);
		expect(screen.getByLabelText("Half steps")).toBeChecked();
		expect(screen.getByText("circle")).toBeInTheDocument();
		expect(screen.getByLabelText("Captions 1")).toHaveValue("Low");
		expect(screen.getByLabelText("Captions 2")).toHaveValue("High");
		expect(screen.getByLabelText("Columns")).toHaveValue(3);
		expect(screen.getByText("Shown above the stars")).toBeInTheDocument();
	});

	it("removes a key the Author empties, rather than storing Unset", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField({ label: "Stars", max: 5, captions: ["Low"] }));
		await openTypeSettings(user);

		await user.clear(screen.getByLabelText("Label"));
		await user.clear(screen.getByLabelText("Max"));
		await user.click(screen.getByTestId("generic-setting-captions-0-remove"));

		expect(panelSettings()).toEqual({});
	});

	it("keeps a blank list row out of the stored list until it is filled in", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField({ captions: ["Low"] }));
		await openTypeSettings(user);

		await user.click(screen.getByTestId("generic-setting-captions-add"));

		expect(screen.getByLabelText("Captions 2")).toHaveValue("");
		expect(panelSettings()).toEqual({ captions: ["Low"] });
	});

	it("writes only the keys its schema declares", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField({ legacy_key: "x", max: 5 }));
		await openTypeSettings(user);

		await user.type(screen.getByLabelText("Label"), "A");

		expect(panelSettings()).toEqual({ max: 5, label: "A" });
	});

	it("shows what it cannot edit as stored JSON, read-only", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField({ legend: { 1: "Bad", 5: "Good" } }));
		await openTypeSettings(user);

		const view = screen.getByTestId("generic-setting-legend");
		expect(view.tagName).toBe("PRE");
		expect(view).toHaveTextContent('"5": "Good"');
		expect(
			screen.getByText(DEFAULT_EDITOR_LABELS.settingsReadOnly),
		).toBeInTheDocument();

		// Editing a neighbour keeps the shown-only setting as it was.
		await user.type(screen.getByLabelText("Label"), "A");
		expect(panelSettings()).toEqual({
			legend: { 1: "Bad", 5: "Good" },
			label: "A",
		});
	});

	it("says there are no settings when the schema declares no key", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField(), {
			...ratingPlugin,
			settingsSchema: z.object({}).strict(),
		});
		await openTypeSettings(user);

		expect(
			screen.getByText(DEFAULT_EDITOR_LABELS.panelNoSettings),
		).toBeVisible();
		expect(screen.queryByTestId("generic-settings-form")).toBeNull();
	});
});

describe("a Locked Setting in the generic form (ADR-0011)", () => {
	const REASON = "Existing ratings are stored out of 5";

	it("renders the frozen control disabled, with the Consumer's reason", async () => {
		const user = userEvent.setup();
		renderPanel(ratingField({ max: 5 }, [{ key: "max", reason: REASON }]));
		await openTypeSettings(user);

		expect(screen.getByLabelText("Max")).toBeDisabled();
		expect(screen.getByTestId("setting-locked-max")).toHaveTextContent(REASON);
		expect(screen.getByLabelText("Label")).not.toBeDisabled();
		expect(screen.queryByTestId("setting-locked-label")).toBeNull();
	});

	it("freezes every control inside a frozen nested object", async () => {
		const user = userEvent.setup();
		renderPanel(
			ratingField({ layout: { columns: 2 } }, [
				{ key: "layout", reason: REASON },
			]),
		);
		await openTypeSettings(user);

		expect(screen.getByLabelText("Columns")).toBeDisabled();
		expect(screen.getByLabelText("Compact")).toBeDisabled();
		expect(screen.getByTestId("setting-locked-layout")).toHaveTextContent(
			REASON,
		);
	});

	it("freezes a list's rows and its add button", async () => {
		const user = userEvent.setup();
		renderPanel(
			ratingField({ captions: ["Low"] }, [{ key: "captions", reason: REASON }]),
		);
		await openTypeSettings(user);

		expect(screen.getByLabelText("Captions 1")).toBeDisabled();
		expect(screen.getByTestId("generic-setting-captions-add")).toBeDisabled();
		expect(
			screen.getByTestId("generic-setting-captions-0-remove"),
		).toBeDisabled();
	});
});
