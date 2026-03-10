// src/renderer/__tests__/field-component.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../provider";
import { FieldComponent } from "../field-component";
import type { FieldTypePlugin, FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { z } from "zod";

function TestTextField({ field }: FieldProps) {
  return <input data-testid={`field-${field.config.api_accessor}`} placeholder={field.config.name} />;
}

const textPlugin: FieldTypePlugin = {
  id: "text",
  name: "Text",
  description: "",
  icon: () => null,
  category: "text",
  fieldComponent: TestTextField,
  toZodType: () => z.string(),
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: { name: "" } });
  return (
    <FormProvider {...methods}>
      <FieldKitProvider plugins={[textPlugin]}>{children}</FieldKitProvider>
    </FormProvider>
  );
}

describe("FieldComponent", () => {
  const field: Field = {
    field_type: "text",
    config: { name: "Name", api_accessor: "name", required: true, instructions: "" },
    settings: null,
    children: null,
    system: false,
  };

  it("should render the plugin's field component", () => {
    render(
      <Wrapper>
        <FieldComponent field={field} />
      </Wrapper>,
    );
    expect(screen.getByTestId("field-name")).toBeInTheDocument();
  });

  it("should not render hidden fields", () => {
    const hiddenField: Field = {
      ...field,
      config: { ...field.config, hidden: true },
    };
    render(
      <Wrapper>
        <FieldComponent field={hiddenField} />
      </Wrapper>,
    );
    expect(screen.queryByTestId("field-name")).not.toBeInTheDocument();
  });

  it("should render fallback for unknown field types", () => {
    const unknownField: Field = {
      ...field,
      field_type: "unknown_type",
    };
    render(
      <Wrapper>
        <FieldComponent field={unknownField} />
      </Wrapper>,
    );
    expect(screen.getByText(/unknown field type/i)).toBeInTheDocument();
  });
});
