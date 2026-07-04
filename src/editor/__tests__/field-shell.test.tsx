import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { fireEvent, render, screen } from "@testing-library/react";
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
	drag: "Drag to reorder",
	edit: "Edit field",
	duplicate: "Duplicate field",
	delete: "Delete field",
	systemLocked: "System field",
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

	it("keyboard drag lifecycle works from the toolbar drag handle", async () => {
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
							selected
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
		const handle = screen.getByLabelText("Drag to reorder");
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

	it("system fields show a lock and no delete button", () => {
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
		expect(screen.getByLabelText("System field")).toBeInTheDocument();
		expect(screen.queryByLabelText("Delete field")).not.toBeInTheDocument();
	});
});
