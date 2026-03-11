// src/editor/__tests__/spec-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpecEditor } from "../spec-editor";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { z } from "zod";

const DummyIcon = () => <span>icon</span>;

const textPlugin: FieldTypePlugin = {
  id: "text",
  name: "Text",
  description: "A single line of text",
  icon: DummyIcon,
  category: "text",
  fieldComponent: () => null,
  toZodType: () => z.string(),
  defaultSettings: { placeholder: "" },
};

const numberPlugin: FieldTypePlugin = {
  id: "number",
  name: "Number",
  description: "A numeric value",
  icon: DummyIcon,
  category: "number",
  fieldComponent: () => null,
  toZodType: () => z.number(),
};

const plugins = [textPlugin, numberPlugin];

function makeField(name: string, accessor: string, type = "text"): Field {
  return {
    field_type: type,
    config: {
      name,
      api_accessor: accessor,
      required: false,
      instructions: "",
    },
    settings: null,
    children: null,
    system: false,
  };
}

describe("SpecEditor", () => {
  it("renders field list with names", () => {
    const schema: Schema = [
      makeField("Title", "title"),
      makeField("Description", "description"),
      makeField("Count", "count", "number"),
    ];

    render(
      <SpecEditor
        schema={schema}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("shows api_accessor for each field", () => {
    const schema: Schema = [makeField("My Title", "my_title")];

    render(
      <SpecEditor
        schema={schema}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByText("my_title")).toBeInTheDocument();
  });

  it("has add button", () => {
    render(
      <SpecEditor
        schema={[]}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByTestId("add-field-button")).toBeInTheDocument();
    expect(screen.getByText("Add field")).toBeInTheDocument();
  });

  it("has edit and remove buttons per field", () => {
    const schema: Schema = [
      makeField("Title", "title"),
      makeField("Name", "name"),
    ];

    render(
      <SpecEditor
        schema={schema}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByTestId("edit-field-title")).toBeInTheDocument();
    expect(screen.getByTestId("remove-field-title")).toBeInTheDocument();
    expect(screen.getByTestId("edit-field-name")).toBeInTheDocument();
    expect(screen.getByTestId("remove-field-name")).toBeInTheDocument();
  });

  it("calls onChange without the removed field when remove is clicked", () => {
    const onChange = vi.fn();
    const schema: Schema = [
      makeField("Title", "title"),
      makeField("Name", "name"),
    ];

    render(
      <SpecEditor
        schema={schema}
        onChange={onChange}
        plugins={plugins}
      />,
    );

    fireEvent.click(screen.getByTestId("remove-field-title"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newSchema = onChange.mock.calls[0][0] as Schema;
    expect(newSchema).toHaveLength(1);
    expect(newSchema[0].config.api_accessor).toBe("name");
  });

  it("shows type picker when add button is clicked", () => {
    render(
      <SpecEditor
        schema={[]}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    fireEvent.click(screen.getByTestId("add-field-button"));

    // TypePicker should now be visible
    expect(screen.getByTestId("type-picker")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
  });

  it("shows empty state when no fields", () => {
    render(
      <SpecEditor
        schema={[]}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
  });

  it("renders field items with correct test ids", () => {
    const schema: Schema = [
      makeField("Title", "title"),
      makeField("Body", "body"),
    ];

    render(
      <SpecEditor
        schema={schema}
        onChange={vi.fn()}
        plugins={plugins}
      />,
    );

    expect(screen.getByTestId("field-item-title")).toBeInTheDocument();
    expect(screen.getByTestId("field-item-body")).toBeInTheDocument();
  });

  it("has displayName set", () => {
    expect(SpecEditor.displayName).toBe("SpecEditor");
  });
});
