import { describe, it, expect } from "vitest";
import { blocksPlugin } from "../blocks";
import type { Field } from "../../types";
import type { BlocksSettings } from "../blocks";

describe("blocksPlugin", () => {
  it("should have correct metadata", () => {
    expect(blocksPlugin.id).toBe("blocks");
    expect(blocksPlugin.category).toBe("structural");
  });

  it("should generate array of objects with _type field", () => {
    const field: Field<BlocksSettings> = {
      field_type: "blocks",
      config: { name: "Content", api_accessor: "content", required: false, instructions: "" },
      settings: {
        allowed_blocks: [
          { type: "hero", name: "Hero", fields: [] },
          { type: "text", name: "Text Block", fields: [] },
        ],
      },
      children: null,
      system: false,
    };
    const zodType = blocksPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse([{ _type: "hero", title: "Hello" }]).success).toBe(true);
    expect(zodType.safeParse([{ _type: "text" }]).success).toBe(true);
    expect(zodType.safeParse("not an array").success).toBe(false);
  });

  it("should accept objects with _type and additional properties", () => {
    const field: Field<BlocksSettings> = {
      field_type: "blocks",
      config: { name: "Content", api_accessor: "content", required: false, instructions: "" },
      settings: { allowed_blocks: [] },
      children: null,
      system: false,
    };
    const zodType = blocksPlugin.toZodType(field);
    expect(zodType.safeParse([{ _type: "hero", heading: "test", image: "/img.png" }]).success).toBe(true);
  });
});
