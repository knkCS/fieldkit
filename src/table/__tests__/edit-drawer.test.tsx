// src/table/__tests__/edit-drawer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditDrawer } from "../edit-drawer";
import type { FieldTypePlugin, FieldProps } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { z } from "zod";
import { useFormContext } from "react-hook-form";

function TestField({ field }: FieldProps) {
  const { register } = useFormContext();
  return (
    <div data-testid={`field-${field.config.api_accessor}`}>
      <label>{field.config.name}</label>
      <input {...register(field.config.api_accessor)} />
    </div>
  );
}
TestField.displayName = "TestField";

const plugins: FieldTypePlugin[] = [
  {
    id: "text",
    name: "Text",
    description: "",
    icon: () => null,
    category: "text",
    fieldComponent: TestField,
    toZodType: () => z.string(),
  },
  {
    id: "section",
    name: "Section",
    description: "",
    icon: () => null,
    category: "structural",
    fieldComponent: () => null,
    toZodType: () => z.never(),
  },
];

function makeField(overrides: Partial<Field> & { field_type: string; config: Field["config"] }): Field {
  return {
    settings: null,
    children: null,
    system: false,
    ...overrides,
  };
}

const schema: Schema = [
  makeField({
    field_type: "text",
    config: { name: "Title", api_accessor: "title", required: true, instructions: "" },
  }),
  makeField({
    field_type: "text",
    config: { name: "Description", api_accessor: "description", required: false, instructions: "" },
  }),
];

describe("EditDrawer", () => {
  it("should render when isOpen is true", () => {
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId("edit-drawer")).toBeInTheDocument();
  });

  it("should not render when isOpen is false", () => {
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("edit-drawer")).not.toBeInTheDocument();
  });

  it("should show field labels from schema", () => {
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("should show custom title when provided", () => {
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        title="Edit Record"
      />,
    );

    expect(screen.getByText("Edit Record")).toBeInTheDocument();
  });

  it("should call onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should call onSave with form values when Save is clicked", async () => {
    const onSave = vi.fn();
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        initialValues={{ title: "Test", description: "Desc" }}
      />,
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Test", description: "Desc" }),
    );
  });

  it("should render Save and Cancel buttons", () => {
    render(
      <EditDrawer
        schema={schema}
        plugins={plugins}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});
