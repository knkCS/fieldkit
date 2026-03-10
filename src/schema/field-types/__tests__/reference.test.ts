import { describe, it, expect } from "vitest";
import { referencePlugin } from "../reference";
import type { Field } from "../../types";
import type { ReferenceSettings } from "../reference";

describe("referencePlugin", () => {
  it("should have correct metadata", () => {
    expect(referencePlugin.id).toBe("reference");
    expect(referencePlugin.category).toBe("reference");
  });

  it("should generate single reference Zod type when max_items is 1", () => {
    const field: Field<ReferenceSettings> = {
      field_type: "reference",
      config: { name: "Author", api_accessor: "author", required: false, instructions: "" },
      settings: { max_items: 1 },
      children: null,
      system: false,
    };
    const zodType = referencePlugin.toZodType(field);
    expect(zodType.safeParse("some-id").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse(["id"]).success).toBe(false);
  });

  it("should generate required single reference Zod type", () => {
    const field: Field<ReferenceSettings> = {
      field_type: "reference",
      config: { name: "Author", api_accessor: "author", required: true, instructions: "" },
      settings: { max_items: 1 },
      children: null,
      system: false,
    };
    const zodType = referencePlugin.toZodType(field);
    expect(zodType.safeParse("some-id").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate multi-reference Zod type by default", () => {
    const field: Field<ReferenceSettings> = {
      field_type: "reference",
      config: { name: "Tags", api_accessor: "tags", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = referencePlugin.toZodType(field);
    expect(zodType.safeParse(["id-1", "id-2"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse("single-string").success).toBe(false);
  });

  it("should generate required multi-reference Zod type", () => {
    const field: Field<ReferenceSettings> = {
      field_type: "reference",
      config: { name: "Tags", api_accessor: "tags", required: true, instructions: "" },
      settings: { blueprints: ["article"] },
      children: null,
      system: false,
    };
    const zodType = referencePlugin.toZodType(field);
    expect(zodType.safeParse(["id-1"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(false);
  });

  it("should generate multi-reference when max_items > 1", () => {
    const field: Field<ReferenceSettings> = {
      field_type: "reference",
      config: { name: "Related", api_accessor: "related", required: false, instructions: "" },
      settings: { max_items: 5 },
      children: null,
      system: false,
    };
    const zodType = referencePlugin.toZodType(field);
    expect(zodType.safeParse(["id-1", "id-2"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(true);
  });
});
