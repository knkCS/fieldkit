import { describe, it, expect } from "vitest";
import { textPlugin } from "../text";
import type { Field } from "../../types";

describe("textPlugin", () => {
  it("should have correct metadata", () => {
    expect(textPlugin.id).toBe("text");
    expect(textPlugin.category).toBe("text");
  });

  it("should generate required string Zod type", () => {
    const field: Field = {
      field_type: "text",
      config: { name: "Name", api_accessor: "name", required: true, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = textPlugin.toZodType(field);
    expect(zodType.safeParse("hello").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate optional string Zod type", () => {
    const field: Field = {
      field_type: "text",
      config: { name: "Name", api_accessor: "name", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = textPlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
  });

  it("should respect min/max length validation", () => {
    const field: Field = {
      field_type: "text",
      config: { name: "Code", api_accessor: "code", required: false, instructions: "" },
      validation: { min_length: 2, max_length: 5 },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = textPlugin.toZodType(field);
    expect(zodType.safeParse("a").success).toBe(false);
    expect(zodType.safeParse("ab").success).toBe(true);
    expect(zodType.safeParse("abcde").success).toBe(true);
    expect(zodType.safeParse("abcdef").success).toBe(false);
  });

  it("should respect pattern validation", () => {
    const field: Field = {
      field_type: "text",
      config: { name: "Code", api_accessor: "code", required: false, instructions: "" },
      validation: { pattern: "^[A-Z]+$", pattern_message: "Uppercase only" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = textPlugin.toZodType(field);
    expect(zodType.safeParse("ABC").success).toBe(true);
    expect(zodType.safeParse("abc").success).toBe(false);
  });
});
