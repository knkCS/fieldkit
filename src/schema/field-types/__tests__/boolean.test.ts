import { describe, it, expect } from "vitest";
import { booleanPlugin } from "../boolean";
import type { Field } from "../../types";

describe("booleanPlugin", () => {
  it("should have correct metadata", () => {
    expect(booleanPlugin.id).toBe("boolean");
    expect(booleanPlugin.category).toBe("boolean");
  });

  it("should generate boolean Zod type", () => {
    const field: Field = {
      field_type: "boolean",
      config: { name: "Active", api_accessor: "active", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = booleanPlugin.toZodType(field);
    expect(zodType.safeParse(true).success).toBe(true);
    expect(zodType.safeParse(false).success).toBe(true);
    expect(zodType.safeParse("true").success).toBe(false);
    expect(zodType.safeParse(1).success).toBe(false);
  });
});
