import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, LockedSetting, Schema } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { EditorCanvas } from "../editor-canvas";
import { FieldConfigPanel } from "../field-config-panel";
import { SettingLockProvider } from "../field-settings/setting-lock";
import { VirtualTableSettingsEditor } from "../field-settings/virtual-table-settings";
import { DEFAULT_EDITOR_LABELS } from "../spec-editor";
import { useSpecDraft } from "../use-spec-draft";
import { CANVAS_LABELS } from "./editor-helpers";

/** A blueprint adapter, as a Consumer that has one registers it. */
function blueprintAdapters(): FieldKitAdapters {
	return {
		blueprint: {
			getSchema: vi.fn().mockResolvedValue([]),
			getData: vi.fn(),
			list: vi
				.fn()
				.mockResolvedValue([{ id: "line_item_bp", name: "Line item" }]),
		},
	};
}

/** The Field under configuration: a 'line items' table, the neutral example. */
function lineItems(
	settings: VirtualTableSettings | null = {},
	children?: Field[],
): Field<VirtualTableSettings> {
	return {
		field_type: "virtual_table",
		config: {
			name: "Line items",
			api_accessor: "line_items",
			required: false,
			instructions: "",
		},
		settings,
		system: false,
		children,
	};
}

function rowField(accessor: string, fieldType = "text"): Field {
	return {
		field_type: fieldType,
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function renderEditor({
	settings = {},
	children,
	adapters = {},
	plugins = builtInFieldTypes,
	withChildrenChannel = true,
	locked,
}: {
	settings?: VirtualTableSettings | null;
	children?: Field[];
	adapters?: FieldKitAdapters;
	plugins?: FieldTypePlugin[];
	withChildrenChannel?: boolean;
	locked?: LockedSetting[];
} = {}) {
	const onChange = vi.fn();
	const onChildrenChange = vi.fn();
	const onDrillIntoChild = vi.fn();

	function Harness() {
		const [current, setCurrent] = useState(settings);
		const [rows, setRows] = useState(children);
		return (
			<VirtualTableSettingsEditor
				settings={current as VirtualTableSettings}
				field={lineItems(current, rows)}
				onChange={(next) => {
					onChange(next);
					setCurrent(next);
				}}
				onChildrenChange={
					withChildrenChannel
						? (next) => {
								onChildrenChange(next);
								setRows(next);
							}
						: undefined
				}
				onDrillIntoChild={onDrillIntoChild}
				plugins={plugins}
			/>
		);
	}

	render(
		<ChakraProvider value={defaultSystem}>
			<ConfirmModalProvider>
				<FieldKitProvider plugins={plugins} adapters={adapters}>
					<SettingLockProvider locked={locked}>
						<Harness />
					</SettingLockProvider>
				</FieldKitProvider>
			</ConfirmModalProvider>
		</ChakraProvider>,
	);

	return { onChange, onChildrenChange, onDrillIntoChild };
}

describe("VirtualTableSettingsEditor — choosing the Row Spec", () => {
	it("offers only an embedded Row Spec when no blueprint adapter is registered", () => {
		renderEditor();

		expect(screen.getByLabelText("Declared in this field")).toBeChecked();
		expect(
			screen.queryByLabelText("A linked blueprint"),
		).not.toBeInTheDocument();
	});

	it("offers both ways when the Consumer registers a blueprint adapter", () => {
		renderEditor({ adapters: blueprintAdapters() });

		expect(screen.getByLabelText("A linked blueprint")).toBeInTheDocument();
		expect(screen.getByLabelText("Declared in this field")).toBeInTheDocument();
	});

	it("keeps the linked option for a Field that already links one", () => {
		renderEditor({ settings: { blueprint: "line_item_bp" } });

		expect(screen.getByLabelText("A linked blueprint")).toBeChecked();
	});

	it("reads an embedded Row Spec off the Field's own children", () => {
		renderEditor({
			adapters: blueprintAdapters(),
			children: [rowField("description"), rowField("quantity", "number")],
		});

		expect(screen.getByLabelText("Declared in this field")).toBeChecked();
		expect(
			screen.getByTestId("virtual-table-row-field-description"),
		).toBeInTheDocument();
		expect(
			screen.getByTestId("virtual-table-row-field-quantity"),
		).toBeInTheDocument();
	});
});

describe("VirtualTableSettingsEditor — authoring an embedded Row Spec", () => {
	it("offers only the flat value types a Row Spec may hold", async () => {
		const user = userEvent.setup();
		renderEditor();

		await user.click(screen.getByLabelText("Add row field"));

		// A flat value type is on offer…
		expect(await screen.findByTestId("type-option-text")).toBeInTheDocument();
		expect(
			screen.getByTestId("type-option-single_reference"),
		).toBeInTheDocument();
		// …and neither a container nor a Marker is: a second level under one
		// cell, or a Tab/Card inside a row (ADR-0017).
		for (const id of [
			"group",
			"fieldset",
			"virtual_table",
			"array",
			"blocks",
			"list",
			"reference",
			"section",
			"card",
			"rich_text",
			"code",
		]) {
			expect(screen.queryByTestId(`type-option-${id}`)).not.toBeInTheDocument();
		}
	});

	it("adds the picked row field and drills straight into it", async () => {
		const user = userEvent.setup();
		const { onChildrenChange, onDrillIntoChild } = renderEditor();

		await user.click(screen.getByLabelText("Add row field"));
		await user.click(await screen.findByTestId("type-option-text"));

		expect(onChildrenChange).toHaveBeenCalledTimes(1);
		const added = onChildrenChange.mock.calls[0][0] as Field[];
		expect(added).toHaveLength(1);
		expect(added[0].field_type).toBe("text");
		expect(onDrillIntoChild).toHaveBeenCalledWith(added[0].config.api_accessor);
	});

	it("removes a row field the Author drops", async () => {
		const user = userEvent.setup();
		const { onChildrenChange } = renderEditor({
			children: [rowField("description"), rowField("quantity", "number")],
		});

		await user.click(screen.getByLabelText("Remove description"));

		expect(onChildrenChange).toHaveBeenLastCalledWith([
			rowField("quantity", "number"),
		]);
	});
});

describe("VirtualTableSettingsEditor — switching between the two", () => {
	it("clears the blueprint when the Author switches to declaring the fields here", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({
			settings: { blueprint: "line_item_bp", max_records_per_page: 25 },
			adapters: blueprintAdapters(),
		});

		await user.click(screen.getByText("Declared in this field"));

		expect(onChange).toHaveBeenLastCalledWith({
			blueprint: undefined,
			max_records_per_page: 25,
		});
	});

	it("asks before discarding an authored Row Spec, then clears it", async () => {
		const { onChildrenChange } = renderEditor({
			children: [rowField("description")],
			adapters: blueprintAdapters(),
		});

		fireEvent.click(screen.getByText("A linked blueprint"));

		const confirmButton = await screen.findByRole("button", {
			name: "Discard and link",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		expect(onChildrenChange).toHaveBeenLastCalledWith([]);
		expect(screen.getByLabelText("A linked blueprint")).toBeChecked();
	});

	it("keeps the row fields when the Author cancels", async () => {
		const { onChildrenChange } = renderEditor({
			children: [rowField("description")],
			adapters: blueprintAdapters(),
		});

		fireEvent.click(screen.getByText("A linked blueprint"));

		const cancelButton = await screen.findByRole("button", { name: "Cancel" });
		await act(async () => {
			fireEvent.click(cancelButton);
		});

		expect(onChildrenChange).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Declared in this field")).toBeChecked();
	});

	it("does not ask, or write, when there is nothing to discard", async () => {
		const user = userEvent.setup();
		const { onChange, onChildrenChange } = renderEditor({
			adapters: blueprintAdapters(),
		});

		await user.click(screen.getByText("A linked blueprint"));

		expect(
			screen.queryByRole("button", { name: "Discard and link" }),
		).not.toBeInTheDocument();
		// Nothing to clear on either side, so nothing is written: a mode the
		// Author has not acted on yet must not dirty the draft.
		expect(onChildrenChange).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByLabelText("A linked blueprint")).toBeChecked();
	});

	it("cannot link away from a Row Spec it has no way to discard", () => {
		// A settings editor mounted outside the config panel: it can read the
		// Field's children but not write them, so the switch that would discard
		// them is refused rather than offered and silently half-applied.
		renderEditor({
			adapters: blueprintAdapters(),
			children: [rowField("description")],
			withChildrenChannel: false,
		});

		expect(screen.getByLabelText("A linked blueprint")).toBeDisabled();
		// Declaring the fields here only clears a setting, so it stays open.
		expect(screen.getByLabelText("Declared in this field")).not.toBeDisabled();
	});
});

describe("VirtualTableSettingsEditor — a frozen Blueprint", () => {
	const FROZEN: LockedSetting[] = [
		{ key: "blueprint", reason: "The row spec is fixed by the service." },
	];

	it("freezes the choice of Row Spec, and the fields an embedded one holds", () => {
		renderEditor({
			adapters: blueprintAdapters(),
			children: [rowField("description")],
			locked: FROZEN,
		});

		// Freezing the Blueprint freezes the CHOICE (ADR-0011) — and with it
		// every write that changes which way the Row Spec is declared.
		expect(screen.getByLabelText("A linked blueprint")).toBeDisabled();
		expect(screen.getByLabelText("Declared in this field")).toBeDisabled();
		expect(screen.getByLabelText("Add row field")).toBeDisabled();
		expect(screen.getByLabelText("Remove description")).toBeDisabled();
		expect(
			screen.getByText("The row spec is fixed by the service."),
		).toBeInTheDocument();
	});

	it("still lets the Author configure a row field it holds", () => {
		renderEditor({
			children: [rowField("description")],
			locked: FROZEN,
		});

		// Configuring one is not a write to the Row Spec's shape; that Field's
		// own settings are its own to freeze.
		expect(
			screen.getByTestId("virtual-table-row-field-edit-description"),
		).not.toBeDisabled();
	});
});

describe("VirtualTableSettingsEditor — the caps", () => {
	it("sets the records per page", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor();

		await user.type(
			screen.getByTestId("virtual-table-max-records-input"),
			"50",
		);

		expect(onChange).toHaveBeenLastCalledWith({ max_records_per_page: 50 });
	});

	it("sets the fewest and the most rows", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor();

		await user.type(screen.getByTestId("virtual-table-min-items-input"), "1");
		expect(onChange).toHaveBeenLastCalledWith({ min_items: 1 });

		await user.type(screen.getByTestId("virtual-table-max-items-input"), "9");
		expect(onChange).toHaveBeenLastCalledWith({ min_items: 1, max_items: 9 });
	});

	it("reads an empty cap as no cap at all", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({ settings: { max_items: 9 } });

		await user.clear(screen.getByTestId("virtual-table-max-items-input"));

		expect(onChange).toHaveBeenLastCalledWith({ max_items: undefined });
	});

	it("has displayName", () => {
		expect(VirtualTableSettingsEditor.displayName).toBe(
			"VirtualTableSettingsEditor",
		);
	});
});

describe("a Virtual Table in the config panel", () => {
	function PanelHarness({
		onFieldChange,
		initial = lineItems({}),
	}: {
		onFieldChange: (f: Field) => void;
		initial?: Field;
	}) {
		const [field, setField] = useState<Field>(initial);
		// The very errors SpecEditor feeds the panel, from the real validator
		// rather than a hand-written list.
		const { fieldErrors } = validateSpec(
			[field],
			new Map(builtInFieldTypes.map((p) => [p.id, p])),
		);
		return (
			<ConfirmModalProvider>
				<FieldConfigPanel
					field={field}
					plugin={builtInFieldTypes.find((p) => p.id === "virtual_table")}
					draft={[field]}
					fieldErrors={fieldErrors}
					onFieldChange={(next) => {
						onFieldChange(next);
						setField(next);
					}}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor="line_items"
					labels={DEFAULT_EDITOR_LABELS}
					plugins={builtInFieldTypes}
				/>
			</ConfirmModalProvider>
		);
	}

	function renderPanel(initial?: Field) {
		const onFieldChange = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
					<PanelHarness onFieldChange={onFieldChange} initial={initial} />
				</FieldKitProvider>
			</ChakraProvider>,
		);
		return onFieldChange;
	}

	it("writes an added row field into the Field's children", async () => {
		const user = userEvent.setup();
		const onFieldChange = renderPanel();

		await user.click(
			screen.getByRole("tab", { name: DEFAULT_EDITOR_LABELS.panelTabType }),
		);
		await user.click(screen.getByLabelText("Add row field"));
		await user.click(await screen.findByTestId("type-option-text"));

		const next = onFieldChange.mock.calls.at(-1)?.[0] as Field;
		expect(next.children).toHaveLength(1);
		expect(next.children?.[0].field_type).toBe("text");
		// …and the panel drilled into it, so the Author names it straight away.
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
	});

	it("surfaces the missing-Row-Spec error where the Row Spec is chosen", () => {
		renderPanel();

		expect(screen.getByTestId("panel-field-errors")).toHaveTextContent(
			/has no Row Spec/,
		);
	});

	it("surfaces a row field of a type a Row Spec may not hold", () => {
		// Hand-authored, since the picker will not offer a container: the Author
		// still has to be told why the draft will not save, and the canvas only
		// outlines top-level shells — this error names the row field.
		renderPanel(lineItems({}, [rowField("addresses", "group")]));

		expect(screen.getByTestId("panel-field-errors")).toHaveTextContent(
			/is not allowed in a Row Spec/,
		);
	});

	it("says nothing about a Field whose Row Spec is sound", () => {
		renderPanel(lineItems({}, [rowField("description")]));

		expect(screen.queryByTestId("panel-field-errors")).not.toBeInTheDocument();
	});
});

describe("a Virtual Table with no Row Spec on the canvas", () => {
	const virtualTableStub: FieldTypePlugin = {
		...(builtInFieldTypes.find(
			(p) => p.id === "virtual_table",
		) as FieldTypePlugin),
		fieldComponent: () => null,
	};
	const textStub: FieldTypePlugin = {
		...(builtInFieldTypes.find((p) => p.id === "text") as FieldTypePlugin),
		fieldComponent: () => null,
	};
	const plugins = [textStub, virtualTableStub];

	function Harness({ schema }: { schema: Schema }) {
		const spec = useSpecDraft(schema, plugins, vi.fn());
		const [selected, setSelected] = useState<string | null>(null);
		return (
			<ConfirmModalProvider>
				<EditorCanvas
					spec={spec}
					plugins={plugins}
					selectedAccessor={selected}
					onSelect={setSelected}
					onEdit={setSelected}
					labels={CANVAS_LABELS}
					activeTabIndex={0}
					onActiveTabChange={vi.fn()}
				/>
			</ConfirmModalProvider>
		);
	}

	it("surfaces validateSpec's Row Spec error on the Field's shell", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={plugins} adapters={{}}>
					<Harness schema={[lineItems({}), rowField("title")]} />
				</FieldKitProvider>
			</ChakraProvider>,
		);

		expect(screen.getByTestId("shell-line_items")).toHaveAttribute(
			"data-invalid",
			"true",
		);
		expect(screen.getByTestId("shell-title")).not.toHaveAttribute(
			"data-invalid",
		);
	});
});
