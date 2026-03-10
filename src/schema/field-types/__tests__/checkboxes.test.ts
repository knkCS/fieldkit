import { describe, it, expect } from "vitest";
import { checkboxesPlugin } from "../checkboxes";
import type { Field } from "../../types";
import type { CheckboxesSettings } from "../checkboxes";

describe("checkboxesPlugin", () => {
  it("should have correct metadata", () => {
    expect(checkboxesPlugin.id).toBe("checkboxes");
    expect(checkboxesPlugin.category).toBe("selection");
  });

  it("should generate required array Zod type with min(1)", () => {
    const field: Field<CheckboxesSettings> = {
      field_type: "checkboxes",
      config: { name: "Features", api_accessor: "features", required: true, instructions: "" },
      settings: { options: { a: "A", b: "B", c: "C" } },
      children: null,
      system: false,
    };
    const zodType = checkboxesPlugin.toZodType(field);
    expect(zodType.safeParse(["a"]).success).toBe(true);
    expect(zodType.safeParse(["a", "b"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(false);
  });

  it("should generate optional array Zod type", () => {
    const field: Field<CheckboxesSettings> = {
      field_type: "checkboxes",
      config: { name: "Features", api_accessor: "features", required: false, instructions: "" },
      settings: { options: { a: "A", b: "B" } },
      children: null,
      system: false,
    };
    const zodType = checkboxesPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse(["a"]).success).toBe(true);
    expect(zodType.safeParse("a").success).toBe(false);
  });
});
