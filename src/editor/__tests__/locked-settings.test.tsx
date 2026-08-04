// src/editor/__tests__/locked-settings.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import { fieldsetPlugin } from "../../schema/field-types/fieldset";
import { listPlugin } from "../../schema/field-types/list";
import { referencePlugin } from "../../schema/field-types/reference";
import type { FieldTypePlugin, SettingsProps } from "../../schema/plugin";
import type { Field, LockedSetting, Schema } from "../../schema/types";
import { createFakeReferenceAdapter } from "../../test/fake-reference-adapter";
import { FieldConfigPanel } from "../field-config-panel";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { EditorWrap, testPlugins } from "./editor-helpers";

/** The Consumer's own sentence — prose fieldkit never wrote and cannot
 * translate, which is the whole point of ADR-0011's `reason`. */
const PINS_EXIST = "12 contents already pin through this field";

function frozen(key: string, reason = PINS_EXIST): LockedSetting[] {
	return [{ key, reason }];
}

function referenceField(locked?: LockedSetting[]): Field {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: "related",
			required: false,
			instructions: "",
			...(locked ? { locked_settings: locked } : {}),
		},
		settings: { blueprints: [], pin_mode: "version", max_items: 3 },
		children: null,
		system: false,
	};
}

/** The Field as the panel currently holds it. */
function panelField(): Field {
	return JSON.parse(screen.getByTestId("dump").textContent ?? "null") as Field;
}

function renderPanel(
	initial: Field,
	plugin: FieldTypePlugin,
	labels = DEFAULT_EDITOR_LABELS,
) {
	function Harness() {
		const [field, setField] = useState<Field>(initial);
		return (
			<div>
				<FieldConfigPanel
					field={field}
					plugin={plugin}
					plugins={builtInFieldTypes}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={setField}
					onClose={() => {}}
					committedAccessors={new Set<string>()}
					baselineAccessor={initial.config.api_accessor}
					labels={labels}
				/>
				<pre data-testid="dump">{JSON.stringify(field)}</pre>
			</div>
		);
	}

	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>,
	);
}

/** Opens the Type settings tab, where a Field's own settings are authored.
 *
 * `fireEvent` reaches every control in the (still-mounted, `hidden`) tab body
 * by test id; a role query does not — `getByRole` skips a `hidden` subtree —
 * so a test asserting on a control by its accessible name uses
 * {@link openTypeSettingsFully} and drives zag's Tabs the way an Author does. */
function openTypeSettings() {
	fireEvent.click(screen.getByRole("tab", { name: "Type settings" }));
}

async function openTypeSettingsFully(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("tab", { name: "Type settings" }));
}

describe("a frozen setting in the config panel", () => {
	it("disables the control the Consumer froze", () => {
		renderPanel(referenceField(frozen("pin_mode")), referencePlugin);
		openTypeSettings();

		expect(screen.getByLabelText(/Pin references to/)).toBeDisabled();
	});

	it("shows the Consumer's reason beside that control", () => {
		renderPanel(referenceField(frozen("pin_mode")), referencePlugin);
		openTypeSettings();

		expect(screen.getByTestId("setting-locked-pin_mode")).toHaveTextContent(
			PINS_EXIST,
		);
	});

	it("leaves every other setting of the same Field editable", () => {
		renderPanel(referenceField(frozen("pin_mode")), referencePlugin);
		openTypeSettings();

		expect(screen.getByTestId("reference-blueprints-input")).not.toBeDisabled();
		expect(screen.getByTestId("reference-max-items-input")).not.toBeDisabled();
		expect(screen.getByTestId("reference-max-depth-input")).not.toBeDisabled();
		expect(screen.queryByTestId("setting-locked-max_items")).toBeNull();
	});

	it("leaves a Field with nothing frozen entirely editable", () => {
		renderPanel(referenceField(), referencePlugin);
		openTypeSettings();

		expect(screen.getByLabelText(/Pin references to/)).not.toBeDisabled();
		expect(screen.queryByTestId("setting-locked-pin_mode")).toBeNull();
	});

	it("keeps the rest of the panel editable — this is not a System Field", () => {
		// ADR-0011: `locked_settings` is the finer grain BENEATH `field.system`,
		// not a second way of reaching it. A Field with one frozen setting is
		// still an ordinary Field everywhere else in the panel.
		renderPanel(referenceField(frozen("pin_mode")), referencePlugin);

		expect(screen.queryByTestId("panel-system-notice")).toBeNull();

		fireEvent.change(screen.getByTestId("panel-name-input"), {
			target: { value: "Sources" },
		});
		expect(panelField().config.name).toBe("Sources");

		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		fireEvent.click(screen.getByTestId("panel-required-input"));
		expect(panelField().config.required).toBe(true);
	});
});

describe("the mechanism is generic", () => {
	it("freezes a setting on a Field type that has nothing to do with references", () => {
		const listField: Field = {
			field_type: "list",
			config: {
				name: "Tags",
				api_accessor: "tags",
				required: false,
				instructions: "",
				locked_settings: frozen(
					"max_items_per_page",
					"Paging is fixed by the publication template",
				),
			},
			settings: { max_items_per_page: 10 },
			children: null,
			system: false,
		};

		renderPanel(listField, listPlugin as FieldTypePlugin);
		openTypeSettings();

		expect(screen.getByTestId("list-max-items-per-page-input")).toBeDisabled();
		expect(
			screen.getByTestId("setting-locked-max_items_per_page"),
		).toHaveTextContent("Paging is fixed by the publication template");
	});

	it("freezes one setting of a Field and not its neighbour", () => {
		const fieldsetField: Field = {
			field_type: "fieldset",
			config: {
				name: "Address",
				api_accessor: "address",
				required: false,
				instructions: "",
				locked_settings: frozen("blueprint", "Contents already embed it"),
			},
			settings: { blueprint: "address", collapsible: false },
			children: null,
			system: false,
		};

		renderPanel(fieldsetField, fieldsetPlugin as FieldTypePlugin);
		openTypeSettings();

		expect(screen.getByTestId("fieldset-blueprint-input")).toBeDisabled();
		expect(screen.getByTestId("fieldset-collapsible-input")).not.toBeDisabled();
	});

	it("freezes a settings-nested Spec, drill-in included", async () => {
		const user = userEvent.setup();
		const withAttributes: Field = {
			...referenceField(frozen("attributes", "Attribute data already saved")),
			settings: {
				blueprints: [],
				pin_mode: "none",
				attributes: [
					{
						field_type: "text",
						config: {
							name: "Note",
							api_accessor: "note",
							required: false,
							instructions: "",
						},
						settings: null,
						system: false,
					},
				],
			},
		};

		renderPanel(withAttributes, referencePlugin);
		await openTypeSettingsFully(user);

		expect(
			screen.getByRole("button", { name: "Add attribute" }),
		).toBeDisabled();
		expect(screen.getByTestId("attribute-edit-note")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Remove Note" })).toBeDisabled();
		expect(screen.getByTestId("setting-locked-attributes")).toHaveTextContent(
			"Attribute data already saved",
		);
	});
});

describe("the reason is the Consumer's own prose", () => {
	it("is displayed as given, never looked up in the editor's label table", () => {
		// The reason is spelled exactly like one of the editor's own label KEYS.
		// A panel that routed it through `labels` would render that key's value
		// ("No additional settings"); one that displays Consumer prose as given
		// renders the string itself.
		renderPanel(
			referenceField(frozen("pin_mode", "panelNoSettings")),
			referencePlugin,
		);
		openTypeSettings();

		expect(screen.getByTestId("setting-locked-pin_mode")).toHaveTextContent(
			"panelNoSettings",
		);
		expect(screen.getByTestId("setting-locked-pin_mode")).not.toHaveTextContent(
			DEFAULT_EDITOR_LABELS.panelNoSettings,
		);
	});

	it("is unchanged by a host that translates every label it can", () => {
		const translated = Object.fromEntries(
			Object.keys(DEFAULT_EDITOR_LABELS).map((key) => [key, `«${key}»`]),
		) as typeof DEFAULT_EDITOR_LABELS;

		renderPanel(
			referenceField(frozen("pin_mode")),
			referencePlugin,
			translated,
		);
		fireEvent.click(screen.getByRole("tab", { name: "«panelTabType»" }));

		expect(screen.getByTestId("setting-locked-pin_mode")).toHaveTextContent(
			PINS_EXIST,
		);
	});
});

describe("a settings editor that ignores the list", () => {
	/** The failure ADR-0011 predicts: a Consumer-written settings component that
	 * never consults `locked_settings` and offers a control over a frozen
	 * setting anyway. */
	function RogueSettings({ settings, onChange }: SettingsProps) {
		return (
			<button
				type="button"
				onClick={() =>
					onChange({
						...(settings as Record<string, unknown>),
						pin_mode: "none",
						max_items: 9,
					})
				}
			>
				Rewrite settings
			</button>
		);
	}
	RogueSettings.displayName = "RogueSettings";

	const roguePlugin: FieldTypePlugin = {
		id: "reference",
		name: "Reference",
		description: "A Consumer's own settings editor",
		icon: Link2,
		category: "reference",
		settingsComponent: RogueSettings,
		fieldComponent: () => null,
		toZodType: () => z.unknown(),
	};

	it("still cannot write the frozen setting", async () => {
		const user = userEvent.setup();
		renderPanel(referenceField(frozen("pin_mode")), roguePlugin);
		await openTypeSettingsFully(user);

		await user.click(screen.getByRole("button", { name: "Rewrite settings" }));

		const settings = panelField().settings as Record<string, unknown>;
		expect(settings.pin_mode).toBe("version");
		// The rest of the same write lands: the lock freezes one setting, not
		// the whole editor.
		expect(settings.max_items).toBe(9);
	});
});

describe("freezing the pin mode, end to end", () => {
	const PLUGINS: FieldTypePlugin[] = [...testPlugins, referencePlugin];

	function renderEditor(schema: Schema, onCommit = vi.fn()) {
		render(
			<EditorWrap
				plugins={PLUGINS}
				adapters={{ reference: createFakeReferenceAdapter() }}
			>
				<SpecEditor schema={schema} onCommit={onCommit} plugins={PLUGINS} />
			</EditorWrap>,
		);
		return onCommit;
	}

	it("disables the pin mode with the Consumer's reason, and saves the rest", async () => {
		const user = userEvent.setup();
		const onCommit = renderEditor([referenceField(frozen("pin_mode"))]);

		await user.click(screen.getByTestId("shell-related"));
		await user.click(screen.getByRole("tab", { name: "Type settings" }));

		expect(screen.getByLabelText(/Pin references to/)).toBeDisabled();
		expect(screen.getByTestId("setting-locked-pin_mode")).toHaveTextContent(
			PINS_EXIST,
		);

		// The Field is otherwise fully editable, and what the Author does change
		// commits normally.
		const maxItems = screen.getByTestId("reference-max-items-input");
		await user.clear(maxItems);
		await user.type(maxItems, "8");

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: DEFAULT_EDITOR_LABELS.save }),
			);
		});

		const committed = onCommit.mock.calls[0][0] as Schema;
		const settings = committed[0].settings as Record<string, unknown>;
		expect(settings.max_items).toBe(8);
		expect(settings.pin_mode).toBe("version");
	});
});
