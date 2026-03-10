import { describe, it, expect } from "vitest";
import { sectionPlugin } from "../section";
import type { Field } from "../../types";

describe("sectionPlugin", () => {
  it("should have correct metadata", () => {
    expect(sectionPlugin.id).toBe("section");
    expect(sectionPlugin.category).toBe("structural");
  });

  it("should return z.never() from toZodType", () => {
    const field: Field = {
      field_type: "section",
      config: { name: "General", api_accessor: "general", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = sectionPlugin.toZodType(field);
    // z.never() should reject any value
    expect(zodType.safeParse("anything").success).toBe(false);
    expect(zodType.safeParse(undefined).success).toBe(false);
    expect(zodType.safeParse(null).success).toBe(false);
  });
});
