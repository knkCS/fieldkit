import { describe, it, expect } from "vitest";
import { datePlugin } from "../date";
import type { Field } from "../../types";

describe("datePlugin", () => {
  it("should have correct metadata", () => {
    expect(datePlugin.id).toBe("date");
    expect(datePlugin.category).toBe("date");
  });

  it("should generate required string Zod type", () => {
    const field: Field = {
      field_type: "date",
      config: { name: "Birth Date", api_accessor: "birth_date", required: true, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = datePlugin.toZodType(field);
    expect(zodType.safeParse("2024-01-15").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate optional string Zod type", () => {
    const field: Field = {
      field_type: "date",
      config: { name: "End Date", api_accessor: "end_date", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = datePlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse("2024-12-31").success).toBe(true);
  });
});
