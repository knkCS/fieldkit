import { describe, it, expect } from "vitest";
import { groupPlugin } from "../group";
import type { Field } from "../../types";
import type { GroupSettings } from "../group";

describe("groupPlugin", () => {
  it("should have correct metadata", () => {
    expect(groupPlugin.id).toBe("group");
    expect(groupPlugin.category).toBe("structural");
  });

  it("should generate array Zod type", () => {
    const field: Field<GroupSettings> = {
      field_type: "group",
      config: { name: "Items", api_accessor: "items", required: false, instructions: "" },
      settings: {},
      children: null,
      system: false,
    };
    const zodType = groupPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(true);
    expect(zodType.safeParse([{ foo: "bar" }]).success).toBe(true);
    expect(zodType.safeParse("not an array").success).toBe(false);
  });

  it("should apply min_items constraint", () => {
    const field: Field<GroupSettings> = {
      field_type: "group",
      config: { name: "Items", api_accessor: "items", required: false, instructions: "" },
      settings: { min_items: 2 },
      children: null,
      system: false,
    };
    const zodType = groupPlugin.toZodType(field);
    expect(zodType.safeParse([{ a: 1 }]).success).toBe(false);
    expect(zodType.safeParse([{ a: 1 }, { b: 2 }]).success).toBe(true);
  });

  it("should apply max_items constraint", () => {
    const field: Field<GroupSettings> = {
      field_type: "group",
      config: { name: "Items", api_accessor: "items", required: false, instructions: "" },
      settings: { max_items: 3 },
      children: null,
      system: false,
    };
    const zodType = groupPlugin.toZodType(field);
    expect(zodType.safeParse([{ a: 1 }, { b: 2 }, { c: 3 }]).success).toBe(true);
    expect(zodType.safeParse([{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]).success).toBe(false);
  });

  it("should apply both min_items and max_items constraints", () => {
    const field: Field<GroupSettings> = {
      field_type: "group",
      config: { name: "Items", api_accessor: "items", required: false, instructions: "" },
      settings: { min_items: 1, max_items: 3 },
      children: null,
      system: false,
    };
    const zodType = groupPlugin.toZodType(field);
    expect(zodType.safeParse([]).success).toBe(false);
    expect(zodType.safeParse([{ a: 1 }]).success).toBe(true);
    expect(zodType.safeParse([{ a: 1 }, { b: 2 }, { c: 3 }]).success).toBe(true);
    expect(zodType.safeParse([{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]).success).toBe(false);
  });
});
