// src/editor/__tests__/type-picker.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TypePicker } from "../type-picker";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { z } from "zod";

const DummyIcon = () => <span data-testid="icon">icon</span>;

function makePlugin(overrides: Partial<FieldTypePlugin> & { id: string; name: string }): FieldTypePlugin {
  return {
    description: `${overrides.name} description`,
    icon: DummyIcon,
    category: "text",
    fieldComponent: () => null,
    toZodType: () => z.string(),
    ...overrides,
  };
}

const textPlugin = makePlugin({ id: "text", name: "Text", category: "text" });
const numberPlugin = makePlugin({ id: "number", name: "Number", category: "number" });
const selectPlugin = makePlugin({ id: "select", name: "Select", category: "selection" });
const boolPlugin = makePlugin({ id: "boolean", name: "Boolean", category: "boolean" });

const allPlugins = [textPlugin, numberPlugin, selectPlugin, boolPlugin];

describe("TypePicker", () => {
  it("renders all plugin types grouped by category", () => {
    const onSelect = vi.fn();
    render(<TypePicker plugins={allPlugins} onSelect={onSelect} />);

    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("Boolean")).toBeInTheDocument();

    // Category headers
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("selection")).toBeInTheDocument();
    expect(screen.getByText("boolean")).toBeInTheDocument();
  });

  it("filters by search text", () => {
    const onSelect = vi.fn();
    render(<TypePicker plugins={allPlugins} onSelect={onSelect} />);

    const searchInput = screen.getByPlaceholderText("Search field types...");
    fireEvent.change(searchInput, { target: { value: "num" } });

    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.queryByText("Text")).not.toBeInTheDocument();
    expect(screen.queryByText("Select")).not.toBeInTheDocument();
  });

  it("calls onSelect when a type is clicked", () => {
    const onSelect = vi.fn();
    render(<TypePicker plugins={allPlugins} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("type-option-text"));
    expect(onSelect).toHaveBeenCalledWith("text");

    fireEvent.click(screen.getByTestId("type-option-number"));
    expect(onSelect).toHaveBeenCalledWith("number");
  });

  it("filters plugins by context", () => {
    const blueprintOnly = makePlugin({
      id: "bp",
      name: "BlueprintOnly",
      category: "text",
      availableIn: ["blueprint"],
    });
    const taskOnly = makePlugin({
      id: "task",
      name: "TaskOnly",
      category: "text",
      availableIn: ["task"],
    });
    const noRestriction = makePlugin({
      id: "any",
      name: "AnyContext",
      category: "text",
    });

    const onSelect = vi.fn();
    render(
      <TypePicker
        plugins={[blueprintOnly, taskOnly, noRestriction]}
        context="blueprint"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("BlueprintOnly")).toBeInTheDocument();
    expect(screen.getByText("AnyContext")).toBeInTheDocument();
    expect(screen.queryByText("TaskOnly")).not.toBeInTheDocument();
  });

  it("disables types at maxPerSpec limit", () => {
    const limitedPlugin = makePlugin({
      id: "limited",
      name: "Limited",
      category: "text",
      maxPerSpec: 1,
    });

    const currentSpec: Field[] = [
      {
        field_type: "limited",
        config: { name: "Existing", api_accessor: "existing", required: false, instructions: "" },
        settings: null,
        children: null,
        system: false,
      },
    ];

    const onSelect = vi.fn();
    render(
      <TypePicker
        plugins={[limitedPlugin]}
        currentSpec={currentSpec}
        onSelect={onSelect}
      />,
    );

    const btn = screen.getByTestId("type-option-limited");
    expect(btn).toBeDisabled();

    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows no matching message when search has no results", () => {
    const onSelect = vi.fn();
    render(<TypePicker plugins={allPlugins} onSelect={onSelect} />);

    const searchInput = screen.getByPlaceholderText("Search field types...");
    fireEvent.change(searchInput, { target: { value: "zzzzzzz" } });

    expect(screen.getByText("No matching field types")).toBeInTheDocument();
  });
});
