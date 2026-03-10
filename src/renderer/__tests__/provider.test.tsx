// src/renderer/__tests__/provider.test.tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { FieldKitProvider, useFieldKit } from "../provider";
import type { FieldTypePlugin } from "../../schema/plugin";
import { z } from "zod";

function mockPlugin(id: string): FieldTypePlugin {
  return {
    id,
    name: id,
    description: "",
    icon: () => null,
    category: "text",
    fieldComponent: () => null,
    toZodType: () => z.string(),
  };
}

describe("FieldKitProvider", () => {
  it("should provide plugins to children", () => {
    const plugins = [mockPlugin("text"), mockPlugin("number")];

    const { result } = renderHook(() => useFieldKit(), {
      wrapper: ({ children }) => (
        <FieldKitProvider plugins={plugins}>{children}</FieldKitProvider>
      ),
    });

    expect(result.current.getPlugin("text")).toBeDefined();
    expect(result.current.getPlugin("number")).toBeDefined();
    expect(result.current.getPlugin("unknown")).toBeUndefined();
  });

  it("should provide adapters to children", () => {
    const adapters = {
      reference: {
        search: async () => [],
        fetch: async () => [],
      },
    };

    const { result } = renderHook(() => useFieldKit(), {
      wrapper: ({ children }) => (
        <FieldKitProvider plugins={[]} adapters={adapters}>
          {children}
        </FieldKitProvider>
      ),
    });

    expect(result.current.adapters.reference).toBeDefined();
  });

  it("should throw when used outside provider", () => {
    expect(() => renderHook(() => useFieldKit())).toThrow(
      "useFieldKit must be used within a FieldKitProvider",
    );
  });
});
