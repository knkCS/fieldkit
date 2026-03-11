import { describe, it, expect } from "vitest";
import { mediaPlugin } from "../media";
import type { Field } from "../../types";
import type { MediaSettings } from "../media";

describe("mediaPlugin", () => {
  it("should have correct metadata", () => {
    expect(mediaPlugin.id).toBe("media");
    expect(mediaPlugin.category).toBe("media");
  });

  it("should generate array of strings Zod type", () => {
    const field: Field<MediaSettings> = {
      field_type: "media",
      config: { name: "Images", api_accessor: "images", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = mediaPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse(["id-1", "id-2"]).success).toBe(true);
    expect(zodType.safeParse("not-an-array").success).toBe(false);
  });

  it("should generate required array with min(1)", () => {
    const field: Field<MediaSettings> = {
      field_type: "media",
      config: { name: "Images", api_accessor: "images", required: true, instructions: "" },
      settings: { accept: ["image/*"] },
      children: null,
      system: false,
    };
    const zodType = mediaPlugin.toZodType(field);
    expect(zodType.safeParse(["id-1"]).success).toBe(true);
    expect(zodType.safeParse([]).success).toBe(false);
  });

  it("should accept empty array when optional", () => {
    const field: Field<MediaSettings> = {
      field_type: "media",
      config: { name: "Attachments", api_accessor: "attachments", required: false, instructions: "" },
      settings: null,
      children: null,
      system: false,
    };
    const zodType = mediaPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(true);
  });
});
