import { describe, it, expect } from "vitest";
import { urlPlugin } from "../url";
import type { Field } from "../../types";

describe("urlPlugin", () => {
  it("should have correct metadata", () => {
    expect(urlPlugin.id).toBe("url");
    expect(urlPlugin.category).toBe("text");
  });

  it("should validate URL format when required", () => {
    const field: Field = {
      field_type: "url",
      config: { name: "Website", api_accessor: "website", required: true, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = urlPlugin.toZodType(field);
    expect(zodType.safeParse("https://example.com").success).toBe(true);
    expect(zodType.safeParse("not-a-url").success).toBe(false);
    expect(zodType.safeParse("").success).toBe(false);
  });

  it("should allow empty string when optional", () => {
    const field: Field = {
      field_type: "url",
      config: { name: "Website", api_accessor: "website", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = urlPlugin.toZodType(field);
    expect(zodType.safeParse("").success).toBe(true);
    expect(zodType.safeParse("https://example.com").success).toBe(true);
    expect(zodType.safeParse("not-a-url").success).toBe(false);
  });
});
