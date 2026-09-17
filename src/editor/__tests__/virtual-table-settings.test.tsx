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
import type { Field, Schema } from "../../schema/types";
import { EditorCanvas } from "../editor-canvas";
import { FieldConfigPanel } from "../field-config-panel";
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

function column(accessor: string, fieldType = "text"): Field {
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
}: {
	settings?: VirtualTableSettings | null;
	children?: Field[];
	adapters?: FieldKitAdapters;
	plugins?: FieldTypePlugin[];
	withChildrenChannel?: boolean;
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
					<Harness />
				</FieldKitProvider>
			</ConfirmModalProvider>
		</ChakraProvider>,
	);

	return { onChange, onChildrenChange, onDrillIntoChild };
}

describe("VirtualTableSettingsEditor — choosing the Row Spec", () => {
	it("offers only an embedded Row Spec when no blueprint adapter is registered", () => {
		renderEditor();

		expect(screen.getByLabelText(/Columns in this field/)).toBeChecked();
		expect(screen.queryByLabelText(/Linked blueprint/)).not.toBeInTheDocument();
	});

	it("offers both ways when the Consumer registers a blueprint adapter", () => {
		renderEditor({ adapters: blueprintAdapters() });

		expect(screen.getByLabelText(/Linked blueprint/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Columns in this field/)).toBeInTheDocument();
	});

	it("keeps the linked option for a Field that already links one", () => {
		renderEditor({ settings: { blueprint: "line_item_bp" } });

		expect(screen.getByLabelText(/Linked blueprint/)).toBeChecked();
	});

	it("reads an embedded Row Spec off the Field's own children", () => {
		renderEditor({
			adapters: blueprintAdapters(),
			children: [column("description"), column("quantity", "number")],
		});

		expect(screen.getByLabelText(/Columns in this field/)).toBeChecked();
		expect(
			screen.getByTestId("virtual-table-column-description"),
		).toBeInTheDocument();
		expect(
			screen.getByTestId("virtual-table-column-quantity"),
		).toBeInTheDocument();
	});
});

describe("VirtualTableSettingsEditor — authoring embedded columns", () => {
	it("offers only the flat value types a Row Spec may hold", async () => {
		const user = userEvent.setup();
		renderEditor();

		await user.click(screen.getByLabelText("Add column"));

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

	it("adds the picked column and drills straight into it", async () => {
		const user = userEvent.setup();
		const { onChildrenChange, onDrillIntoChild } = renderEditor();

		await user.click(screen.getByLabelText("Add column"));
		await user.click(await screen.findByTestId("type-option-text"));

		expect(onChildrenChange).toHaveBeenCalledTimes(1);
		const added = onChildrenChange.mock.calls[0][0] as Field[];
		expect(added).toHaveLength(1);
		expect(added[0].field_type).toBe("text");
		expect(onDrillIntoChild).toHaveBeenCalledWith(added[0].config.api_accessor);
	});

	it("removes a column the Author drops", async () => {
		const user = userEvent.setup();
		const { onChildrenChange } = renderEditor({
			children: [column("description"), column("quantity", "number")],
		});

		await user.click(screen.getByLabelText("Remove description"));

		expect(onChildrenChange).toHaveBeenLastCalledWith([
			column("quantity", "number"),
		]);
	});
});

describe("VirtualTableSettingsEditor — switching between the two", () => {
	it("clears the blueprint when the Author switches to embedded columns", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({
			settings: { blueprint: "line_item_bp", max_records_per_page: 25 },
			adapters: blueprintAdapters(),
		});

		await user.click(screen.getByLabelText(/Columns in this field/));

		expect(onChange).toHaveBeenLastCalledWith({
			blueprint: undefined,
			max_records_per_page: 25,
		});
	});

	it("asks before discarding authored columns, then clears them", async () => {
		const { onChildrenChange } = renderEditor({
			children: [column("description")],
			adapters: blueprintAdapters(),
		});

		fireEvent.click(screen.getByLabelText(/Linked blueprint/));

		const confirmButton = await screen.findByRole("button", {
			name: "Discard and link",
		});
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		expect(onChildrenChange).toHaveBeenLastCalledWith([]);
		expect(screen.getByLabelText(/Linked blueprint/)).toBeChecked();
	});

	it("keeps the columns when the Author cancels", async () => {
		const { onChildrenChange } = renderEditor({
			children: [column("description")],
			adapters: blueprintAdapters(),
		});

		fireEvent.click(screen.getByLabelText(/Linked blueprint/));

		const cancelButton = await screen.findByRole("button", { name: "Cancel" });
		await act(async () => {
			fireEvent.click(cancelButton);
		});

		expect(onChildrenChange).not.toHaveBeenCalled();
		expect(screen.getByLabelText(/Columns in this field/)).toBeChecked();
	});

	it("does not ask when there are no columns to discard", async () => {
		const user = userEvent.setup();
		const { onChildrenChange } = renderEditor({
			adapters: blueprintAdapters(),
		});

		await user.click(screen.getByLabelText(/Linked blueprint/));

		expect(
			screen.queryByRole("button", { name: "Discard and link" }),
		).not.toBeInTheDocument();
		expect(onChildrenChange).toHaveBeenLastCalledWith([]);
		expect(screen.getByLabelText(/Linked blueprint/)).toBeChecked();
	});

	it("cannot switch where the Field's children cannot be written", () => {
		renderEditor({
			adapters: blueprintAdapters(),
			withChildrenChannel: false,
		});

		expect(screen.getByLabelText(/Linked blueprint/)).toBeDisabled();
		expect(screen.getByLabelText(/Columns in this field/)).toBeDisabled();
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
	}: {
		onFieldChange: (f: Field) => void;
	}) {
		const [field, setField] = useState<Field>(lineItems({}));
		return (
			<ConfirmModalProvider>
				<FieldConfigPanel
					field={field}
					plugin={builtInFieldTypes.find((p) => p.id === "virtual_table")}
					draft={[field]}
					fieldErrors={[]}
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

	it("writes an added column into the Field's children", async () => {
		const user = userEvent.setup();
		const onFieldChange = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={builtInFieldTypes} adapters={{}}>
					<PanelHarness onFieldChange={onFieldChange} />
				</FieldKitProvider>
			</ChakraProvider>,
		);

		await user.click(
			screen.getByRole("tab", { name: DEFAULT_EDITOR_LABELS.panelTabType }),
		);
		await user.click(screen.getByLabelText("Add column"));
		await user.click(await screen.findByTestId("type-option-text"));

		const next = onFieldChange.mock.calls.at(-1)?.[0] as Field;
		expect(next.children).toHaveLength(1);
		expect(next.children?.[0].field_type).toBe("text");
		// …and the panel drilled into it, so the Author names it straight away.
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
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
					<Harness schema={[lineItems({}), column("title")]} />
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
