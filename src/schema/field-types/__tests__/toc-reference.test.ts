import { describe, it, expect } from "vitest";
import { tocReferencePlugin } from "../toc-reference";
import type { Field } from "../../types";
import type { TocReferenceSettings } from "../toc-reference";

describe("tocReferencePlugin", () => {
  it("should have correct metadata", () => {
    expect(tocReferencePlugin.id).toBe("toc_reference");
    expect(tocReferencePlugin.category).toBe("reference");
  });

  it("should have maxPerSpec of 1", () => {
    expect(tocReferencePlugin.maxPerSpec).toBe(1);
  });

  it("should generate required string Zod type", () => {
    const field: Field<TocReferenceSettings> = {
      field_type: "toc_reference",
      config: { name: "Parent", api_accessor: "parent", required: true, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = tocReferencePlugin.toZodType(field);
    expect(zodType.safeParse("some-id").success).toBe(true);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should generate optional string Zod type", () => {
    const field: Field<TocReferenceSettings> = {
      field_type: "toc_reference",
      config: { name: "Parent", api_accessor: "parent", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = tocReferencePlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse("some-id").success).toBe(true);
  });

  it("should always produce a string type (not array)", () => {
    const field: Field<TocReferenceSettings> = {
      field_type: "toc_reference",
      config: { name: "Parent", api_accessor: "parent", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = tocReferencePlugin.toZodType(field);
    expect(zodType.safeParse(["id"]).success).toBe(false);
  });
});
