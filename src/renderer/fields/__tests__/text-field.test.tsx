import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { TextField } from "../text-field";
import type { Field } from "../../../schema/types";

function Wrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: { name: "" } });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe("TextField", () => {
  const field: Field = {
    field_type: "text",
    config: { name: "Full Name", api_accessor: "name", required: true, instructions: "Enter your full name" },
    settings: { placeholder: "John Doe" },
    children: null,
    system: false,
  };

  it("should render with a label", () => {
    render(
      <Wrapper>
        <TextField field={field} />
      </Wrapper>,
    );
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
  });

  it("should show instructions as helper text", () => {
    render(
      <Wrapper>
        <TextField field={field} />
      </Wrapper>,
    );
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
  });

  it("should apply placeholder from settings", () => {
    render(
      <Wrapper>
        <TextField field={field} />
      </Wrapper>,
    );
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
  });

  it("should render as readonly when readOnly is true", () => {
    render(
      <Wrapper>
        <TextField field={field} readOnly />
      </Wrapper>,
    );
    expect(screen.getByLabelText(/Full Name/)).toHaveAttribute("readonly");
  });

  it("should have displayName", () => {
    expect(TextField.displayName).toBe("TextField");
  });
});
