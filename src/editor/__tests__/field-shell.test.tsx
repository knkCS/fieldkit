import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../schema/types";
import { FieldShell } from "../field-shell";

const field: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "",
	},
	settings: null,
	system: false,
};

function Wrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<DndContext>
				<SortableContext items={["title"]}>{children}</SortableContext>
			</DndContext>
		</ChakraProvider>
	);
}

const noop = () => {};
const shellLabels = {
	dragField: "Drag to reorder",
	editField: "Edit field",
	duplicateField: "Duplicate field",
	deleteField: "Delete field",
	viewField: "View definition",
};

describe("FieldShell", () => {
	it("renders children inert (inert wrapper blocks focus and hides from AT)", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<input data-testid="inner" />
				</FieldShell>
			</Wrap>,
		);
		const inner = screen.getByTestId("inner");
		expect(inner.closest("[inert]")).not.toBeNull();
	});

	it("click selects", () => {
		const onSelect = vi.fn();
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={onSelect}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.click(screen.getByTestId("shell-title"));
		expect(onSelect).toHaveBeenCalledWith("title");
	});

	it("shows the toolbar only when selected; actions fire without re-selecting", () => {
		const onDelete = vi.fn();
		const onSelect = vi.fn();
		const { rerender } = render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={onSelect}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={onDelete}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.queryByLabelText("Delete field")).not.toBeInTheDocument();
		rerender(
			<Wrap>
				<FieldShell
					field={field}
					selected
					onSelect={onSelect}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={onDelete}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.click(screen.getByLabelText("Delete field"));
		expect(onDelete).toHaveBeenCalledWith("title");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("keyboard toolbar actions do not leak to shell selection", () => {
		const onSelect = vi.fn();
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected
					onSelect={onSelect}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.keyDown(screen.getByLabelText("Delete field"), { key: "Enter" });
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("keyboard drag lifecycle works from the grip of an UNSELECTED shell", async () => {
		const onDragStart = vi.fn();
		const onDragCancel = vi.fn();
		const second: Field = {
			...field,
			config: { ...field.config, name: "Body", api_accessor: "body" },
		};
		render(
			<ChakraProvider value={defaultSystem}>
				<DndContext onDragStart={onDragStart} onDragCancel={onDragCancel}>
					<SortableContext items={["title", "body"]}>
						<FieldShell
							field={field}
							selected={false}
							onSelect={noop}
							onEdit={noop}
							onDuplicate={noop}
							onDelete={noop}
							labels={shellLabels}
						>
							<span>x</span>
						</FieldShell>
						<FieldShell
							field={second}
							selected={false}
							onSelect={noop}
							onEdit={noop}
							onDuplicate={noop}
							onDelete={noop}
							labels={shellLabels}
						>
							<span>y</span>
						</FieldShell>
					</SortableContext>
				</DndContext>
			</ChakraProvider>,
		);
		// Two shells render, each with its own persistent grip — scope to the
		// one under test.
		const handle = within(screen.getByTestId("shell-title")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { key: "Enter", code: "Enter" });
		expect(onDragStart).toHaveBeenCalledTimes(1);
		// dnd-kit's KeyboardSensor attaches its document keydown listener in a
		// setTimeout after activation — yield a macrotask before the cancel key.
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.keyDown(document.activeElement ?? handle, {
			key: "Escape",
			code: "Escape",
		});
		expect(onDragCancel).toHaveBeenCalledTimes(1);
	});

	it("is keyboard-selectable (Enter and Space)", () => {
		const onSelect = vi.fn();
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={onSelect}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		const shell = screen.getByTestId("shell-title");
		expect(shell).toHaveAttribute("tabindex", "0");
		fireEvent.keyDown(shell, { key: "Enter" });
		fireEvent.keyDown(shell, { key: " " });
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it("carries data-invalid when invalid", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					invalid
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByTestId("shell-title")).toHaveAttribute(
			"data-invalid",
			"true",
		);
	});

	it("does not carry data-invalid when valid", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByTestId("shell-title")).not.toHaveAttribute(
			"data-invalid",
		);
	});

	it("system fields show an eye (view definition) and no delete button", () => {
		render(
			<Wrap>
				<FieldShell
					field={{ ...field, system: true }}
					selected
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByLabelText("View definition")).toBeInTheDocument();
		expect(screen.queryByLabelText("Delete field")).not.toBeInTheDocument();
	});

	it("system field: eye shown (no lock badge, no pencil), delete hidden, drag/duplicate kept", () => {
		const sysField: Field = { ...field, system: true };
		render(
			<Wrap>
				<FieldShell
					field={sysField}
					selected={true}
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByLabelText(shellLabels.viewField)).toBeInTheDocument();
		// The Lock badge is retired entirely — no aria-label exists to query for
		// it under any label, but this pins the absence of the OLD default
		// string too, in case a stale host label ever leaks through.
		expect(screen.queryByLabelText("System field")).toBeNull();
		expect(screen.queryByLabelText(shellLabels.editField)).toBeNull();
		expect(screen.queryByLabelText(shellLabels.deleteField)).toBeNull();
		expect(screen.getByLabelText(shellLabels.dragField)).toBeInTheDocument();
		expect(
			screen.getByLabelText(shellLabels.duplicateField),
		).toBeInTheDocument();
	});

	it("system field: clicking the eye selects, and does NOT call onEdit", () => {
		const onSelect = vi.fn();
		const onEdit = vi.fn();
		const sysField: Field = { ...field, system: true };
		render(
			<Wrap>
				<FieldShell
					field={sysField}
					selected={true}
					onSelect={onSelect}
					onEdit={onEdit}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		fireEvent.click(screen.getByLabelText(shellLabels.viewField));
		expect(onSelect).toHaveBeenCalledWith("title");
		expect(onEdit).not.toHaveBeenCalled();
	});

	it("custom (non-system) field: pencil still present and onEdit still fires", () => {
		const onEdit = vi.fn();
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={true}
					onSelect={noop}
					onEdit={onEdit}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		expect(screen.getByLabelText(shellLabels.editField)).toBeInTheDocument();
		expect(screen.queryByLabelText(shellLabels.viewField)).toBeNull();
		fireEvent.click(screen.getByLabelText(shellLabels.editField));
		expect(onEdit).toHaveBeenCalledWith("title");
	});

	it("renders the drag grip WITHOUT selection (persistent handle, #41)", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		const grip = screen.getByLabelText(shellLabels.dragField);
		expect(grip).toBeInTheDocument();
		// It must live OUTSIDE the inert preview wrapper — an inert grip
		// would be unfocusable and undraggable.
		expect(grip.closest("[inert]")).toBeNull();
	});

	it("the selection toolbar contains NO grip — the shell grip is the single handle", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		// The toolbar is up (Edit proves it) and grip-free; exactly ONE grip
		// exists on a selected shell — pre-0.10 the toolbar carried it.
		const toolbar = screen.getByTestId("shell-toolbar-title");
		expect(
			within(toolbar).getByLabelText(shellLabels.editField),
		).toBeInTheDocument();
		expect(within(toolbar).queryByLabelText(shellLabels.dragField)).toBeNull();
		expect(screen.getAllByLabelText(shellLabels.dragField)).toHaveLength(1);
	});
});
