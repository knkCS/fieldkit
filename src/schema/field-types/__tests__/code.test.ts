import { describe, it, expect } from "vitest";
import { codePlugin } from "../code";
import type { Field } from "../../types";
import type { CodeSettings } from "../code";

describe("codePlugin", () => {
  it("should have correct metadata", () => {
    expect(codePlugin.id).toBe("code");
    expect(codePlugin.category).toBe("text");
  });

  it("should generate required string Zod type", () => {
    const field: Field<CodeSettings> = {
      field_type: "code",
      config: { name: "Source", api_accessor: "source", required: true, instructions: "" },
      settings: { language: "typescript" },
      children: null,
      system: false,
    };
    const zodType = codePlugin.toZodType(field);
    expect(zodType.safeParse("const x = 1;").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate optional string Zod type", () => {
    const field: Field<CodeSettings> = {
      field_type: "code",
      config: { name: "Source", api_accessor: "source", required: false, instructions: "" },
      settings: { language: "javascript" },
      children: null,
      system: false,
    };
    const zodType = codePlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse("console.log('hello')").success).toBe(true);
  });

  it("should have language in default settings", () => {
    expect(codePlugin.defaultSettings).toBeDefined();
  });

  it("should respect min/max length validation", () => {
    const field: Field<CodeSettings> = {
      field_type: "code",
      config: { name: "Source", api_accessor: "source", required: false, instructions: "" },
      validation: { min_length: 3, max_length: 50 },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = codePlugin.toZodType(field);
    expect(zodType.safeParse("ab").success).toBe(false);
    expect(zodType.safeParse("abc").success).toBe(true);
    expect(zodType.safeParse("a".repeat(51)).success).toBe(false);
  });
});
