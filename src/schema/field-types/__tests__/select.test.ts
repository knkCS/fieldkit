import { describe, it, expect } from "vitest";
import { selectPlugin } from "../select";
import type { Field } from "../../types";
import type { SelectSettings } from "../select";

describe("selectPlugin", () => {
  it("should have correct metadata", () => {
    expect(selectPlugin.id).toBe("select");
    expect(selectPlugin.category).toBe("selection");
  });

  it("should generate required single-select Zod type", () => {
    const field: Field<SelectSettings> = {
      field_type: "select",
      config: { name: "Status", api_accessor: "status", required: true, instructions: "" },
      settings: { options: { draft: "Draft", published: "Published" } },
      children: null,
      system: false,
    };
    const zodType = selectPlugin.toZodType(field);
    expect(zodType.safeParse("draft").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate optional single-select Zod type", () => {
    const field: Field<SelectSettings> = {
      field_type: "select",
      config: { name: "Status", api_accessor: "status", required: false, instructions: "" },
      settings: { options: { draft: "Draft", published: "Published" } },
      children: null,
      system: false,
    };
    const zodType = selectPlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse("draft").success).toBe(true);
  });

  it("should generate multiple-select Zod type", () => {
    const field: Field<SelectSettings> = {
      field_type: "select",
      config: { name: "Tags", api_accessor: "tags", required: false, instructions: "" },
      settings: { options: { a: "A", b: "B" }, multiple: true },
      children: null,
      system: false,
    };
    const zodType = selectPlugin.toZodType(field);
    expect(zodType.safeParse(["a", "b"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse("a").success).toBe(false);
  });

  it("should generate required multiple-select Zod type with min(1)", () => {
    const field: Field<SelectSettings> = {
      field_type: "select",
      config: { name: "Tags", api_accessor: "tags", required: true, instructions: "" },
      settings: { options: { a: "A", b: "B" }, multiple: true },
      children: null,
      system: false,
    };
    const zodType = selectPlugin.toZodType(field);
    expect(zodType.safeParse(["a"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(false);
  });
});
