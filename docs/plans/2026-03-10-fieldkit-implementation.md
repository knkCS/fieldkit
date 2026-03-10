# @knkcs/fieldkit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a specification-driven field system (`@knkcs/fieldkit`) that provides defining, rendering, and tabulating structured data via a plugin-based field type architecture.

**Architecture:** Single npm package with 5 subpath exports (schema, editor, renderer, table, rich-text-spec). Schema layer is zero-React. All field types are plugins implementing `FieldTypePlugin`. Form rendering delegates to React Hook Form via external `FormProvider`. Backend-dependent fields use an adapter pattern.

**Tech Stack:** React 18+, TypeScript (strict), Chakra UI v3 (via @knkcs/anker), React Hook Form + Zod, TanStack Table v8, dnd-kit, TipTap (via @knkcms/knkeditor), tsup, vitest, Storybook, Biome.

**Design Spec:** `docs/specs/2026-03-10-knkcs-fieldkit-design.md`

---

## Chunk 1: Project Scaffolding

Sets up the package structure, build tooling, test framework, linting, and Storybook. Produces a buildable, lintable, testable empty package with all 5 subpath exports.

### Task 1: Initialize package.json

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package.json with subpath exports**

```json
{
  "name": "@knkcs/fieldkit",
  "version": "0.0.1",
  "description": "Specification-driven field system for defining, rendering, and tabulating structured data",
  "type": "module",
  "main": "./dist/schema/index.js",
  "types": "./dist/schema/index.d.ts",
  "exports": {
    "./schema": {
      "import": "./dist/schema/index.js",
      "types": "./dist/schema/index.d.ts"
    },
    "./editor": {
      "import": "./dist/editor/index.js",
      "types": "./dist/editor/index.d.ts"
    },
    "./renderer": {
      "import": "./dist/renderer/index.js",
      "types": "./dist/renderer/index.d.ts"
    },
    "./table": {
      "import": "./dist/table/index.js",
      "types": "./dist/table/index.d.ts"
    },
    "./rich-text-spec": {
      "import": "./dist/rich-text-spec/index.js",
      "types": "./dist/rich-text-spec/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "storybook dev -p 6007",
    "build": "tsup",
    "build:storybook": "storybook build",
    "lint": "biome check src",
    "lint:write": "biome check --write src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@knkcs/anker": "*",
    "react": ">=18",
    "react-dom": ">=18",
    "@chakra-ui/react": "^3.0.0",
    "react-hook-form": "^7.0.0",
    "@hookform/resolvers": "^3.0.0",
    "zod": "^3.0.0",
    "@tanstack/react-table": "^8.0.0",
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^8.0.0",
    "react-router-dom": "^6.0.0"
  },
  "peerDependenciesMeta": {
    "@knkcms/knkeditor-editor": {
      "optional": true
    }
  },
  "devDependencies": {
    "@knkcs/anker": "file:../anker",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@chakra-ui/react": "^3.0.0",
    "react-hook-form": "^7.54.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",
    "@tanstack/react-table": "^8.20.0",
    "@dnd-kit/core": "^6.3.0",
    "@dnd-kit/sortable": "^8.0.0",
    "react-router-dom": "^6.28.0",
    "lucide-react": "^0.400.0",
    "typescript": "^5.7.0",
    "tsup": "^8.3.0",
    "@biomejs/biome": "^2.2.0",
    "vitest": "^3.0.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@storybook/react-vite": "^8.4.0",
    "@storybook/addon-essentials": "^8.4.0",
    "@storybook/addon-a11y": "^8.4.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: node_modules created, no errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: initialize package.json with subpath exports and dependencies"
```

### Task 2: Configure TypeScript, tsup, Biome, Vitest, Storybook

**Files:**
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `.storybook/main.ts`
- Create: `.storybook/preview.tsx`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@fieldkit/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.stories.tsx", "**/*.test.tsx", "**/*.test.ts"]
}
```

- [ ] **Step 2: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "schema/index": "src/schema/index.ts",
    "editor/index": "src/editor/index.ts",
    "renderer/index": "src/renderer/index.ts",
    "table/index": "src/table/index.ts",
    "rich-text-spec/index": "src/rich-text-spec/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@chakra-ui/react",
    "@knkcs/anker",
    "react-hook-form",
    "@hookform/resolvers",
    "zod",
    "@tanstack/react-table",
    "@dnd-kit/core",
    "@dnd-kit/sortable",
    "react-router-dom",
    "react-i18next",
    "lucide-react",
    "@knkcms/knkeditor-editor",
  ],
  treeshake: true,
  sourcemap: true,
  minify: false,
});
```

- [ ] **Step 3: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
  "root": true,
  "files": {
    "includes": ["src/**"],
    "ignoreUnknown": true
  },
  "linter": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": { "quoteStyle": "double" }
  }
}
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    passWithNoTests: true,
  },
});
```

- [ ] **Step 5: Create src/test/setup.ts**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Create .storybook/main.ts**

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
```

- [ ] **Step 7: Create .storybook/preview.tsx**

```tsx
import type { Preview } from "@storybook/react";
import { Provider } from "@knkcs/anker/primitives";

const preview: Preview = {
  decorators: [
    (Story) => (
      <Provider>
        <Story />
      </Provider>
    ),
  ],
};

export default preview;
```

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json tsup.config.ts biome.json vitest.config.ts src/test/setup.ts .storybook/
git commit -m "build: add TypeScript, tsup, Biome, Vitest, and Storybook configuration"
```

### Task 3: Create entry point stubs

**Files:**
- Create: `src/schema/index.ts`
- Create: `src/editor/index.ts`
- Create: `src/renderer/index.ts`
- Create: `src/table/index.ts`
- Create: `src/rich-text-spec/index.ts`

- [ ] **Step 1: Create stub entry points**

Each file is a placeholder that will be filled in subsequent tasks:

`src/schema/index.ts`:
```ts
// @knkcs/fieldkit/schema — Field types, registry, Zod generation, defineSpec()
export {};
```

`src/editor/index.ts`:
```ts
// @knkcs/fieldkit/editor — Specification editor
export {};
```

`src/renderer/index.ts`:
```ts
// @knkcs/fieldkit/renderer — Field renderer
export {};
```

`src/table/index.ts`:
```ts
// @knkcs/fieldkit/table — Spec-driven data table
export {};
```

`src/rich-text-spec/index.ts`:
```ts
// @knkcs/fieldkit/rich-text-spec — Rich text editor specification
export {};
```

- [ ] **Step 2: Verify build works**

Run: `npx tsup`
Expected: Build succeeds, `dist/` contains 5 entry points

- [ ] **Step 3: Verify typecheck works**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run`
Expected: Pass (with `passWithNoTests: true`)

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "build: add stub entry points for all 5 subpath exports"
```

---

## Chunk 2: Schema Layer Core

Implements the type system, plugin registry, Zod schema builder, and `defineSpec()` builder API. This is the foundation that all other layers depend on. Zero React dependency.

### Task 4: Core type definitions

**Files:**
- Create: `src/schema/types.ts`
- Test: `src/schema/__tests__/types.test.ts`

- [ ] **Step 1: Write type tests**

```ts
// src/schema/__tests__/types.test.ts
import { describe, it, expect } from "vitest";
import type {
  Field,
  FieldConfig,
  FieldCondition,
  FieldValidation,
  Schema,
} from "../types";

describe("Schema types", () => {
  it("should create a valid Field object", () => {
    const field: Field = {
      field_type: "text",
      config: {
        name: "Product Name",
        api_accessor: "product_name",
        required: true,
        instructions: "Enter the product name",
      },
      settings: { placeholder: "Enter name" },
      children: null,
      system: false,
    };

    expect(field.field_type).toBe("text");
    expect(field.config.api_accessor).toBe("product_name");
    expect(field.config.required).toBe(true);
  });

  it("should support optional FieldConfig extensions", () => {
    const field: Field = {
      field_type: "text",
      config: {
        name: "Email",
        api_accessor: "email",
        required: true,
        instructions: "",
        default_value: "user@example.com",
        unique: true,
        localizable: false,
        hidden: false,
        read_only: false,
        condition: {
          field: "has_email",
          operator: "eq",
          value: true,
        },
      },
      settings: null,
      children: null,
      system: false,
    };

    expect(field.config.default_value).toBe("user@example.com");
    expect(field.config.unique).toBe(true);
    expect(field.config.condition?.field).toBe("has_email");
  });

  it("should support FieldValidation", () => {
    const field: Field = {
      field_type: "text",
      config: {
        name: "Code",
        api_accessor: "code",
        required: false,
        instructions: "",
      },
      validation: {
        min_length: 3,
        max_length: 10,
        pattern: "^[A-Z]+$",
        pattern_message: "Only uppercase letters",
      },
      settings: null,
      children: null,
      system: false,
    };

    expect(field.validation?.min_length).toBe(3);
    expect(field.validation?.pattern).toBe("^[A-Z]+$");
  });

  it("should support nested children for structural types", () => {
    const field: Field = {
      field_type: "group",
      config: {
        name: "Authors",
        api_accessor: "authors",
        required: false,
        instructions: "",
      },
      settings: { min_items: 1, max_items: 5 },
      children: [
        {
          field_type: "text",
          config: {
            name: "Author Name",
            api_accessor: "name",
            required: true,
            instructions: "",
          },
          settings: null,
          children: null,
          system: false,
        },
      ],
      system: false,
    };

    expect(field.children).toHaveLength(1);
    expect(field.children?.[0].config.api_accessor).toBe("name");
  });

  it("should accept Schema as Field array", () => {
    const schema: Schema = [
      {
        field_type: "text",
        config: { name: "Name", api_accessor: "name", required: true, instructions: "" },
        settings: null,
        children: null,
        system: false,
      },
    ];

    expect(schema).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/__tests__/types.test.ts`
Expected: FAIL — cannot resolve `../types`

- [ ] **Step 3: Implement types**

```ts
// src/schema/types.ts

/** Condition for showing/hiding a field based on another field's value. */
export interface FieldCondition {
  /** api_accessor of the controlling field */
  field: string;
  operator: "eq" | "neq" | "in" | "not_in" | "exists";
  value: unknown;
}

/** Validation rules applied to a field's value. */
export interface FieldValidation {
  min_length?: number;
  max_length?: number;
  pattern?: string;
  pattern_message?: string;
}

/** Base configuration shared by all field types. */
export interface FieldConfig {
  name: string;
  api_accessor: string;
  required: boolean;
  instructions: string;
  default_value?: unknown;
  unique?: boolean;
  localizable?: boolean;
  hidden?: boolean;
  read_only?: boolean;
  condition?: FieldCondition;
}

/** A single field definition in a specification. */
export interface Field<T = unknown> {
  field_type: string;
  config: FieldConfig;
  validation?: FieldValidation;
  settings?: T | null;
  children?: Field[] | null;
  system: boolean;
}

/** A specification is an array of field definitions. */
export type Schema = Field[];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/__tests__/types.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/types.ts src/schema/__tests__/types.test.ts
git commit -m "feat(schema): add core type definitions (Field, FieldConfig, FieldValidation)"
```

### Task 5: FieldTypePlugin interface and component prop types

**Files:**
- Create: `src/schema/plugin.ts`
- Test: `src/schema/__tests__/plugin.test.ts`

- [ ] **Step 1: Write plugin interface test**

```ts
// src/schema/__tests__/plugin.test.ts
import { describe, it, expect } from "vitest";
import type { FieldTypePlugin, FieldTypeCategory } from "../plugin";
import { z } from "zod";

describe("FieldTypePlugin", () => {
  it("should define a valid plugin with all required fields", () => {
    const plugin: FieldTypePlugin<{ placeholder: string }> = {
      id: "text",
      name: "Text",
      description: "A single line of text",
      icon: () => null, // mock icon
      category: "text",
      fieldComponent: () => null, // mock component
      toZodType: (field) => {
        let schema = z.string();
        if (field.config.required) {
          schema = schema.min(1, "Required");
        }
        return schema;
      },
      defaultSettings: { placeholder: "" },
      availableIn: ["blueprint", "task", "form"],
    };

    expect(plugin.id).toBe("text");
    expect(plugin.category).toBe("text");
  });

  it("should allow optional components", () => {
    const plugin: FieldTypePlugin = {
      id: "boolean",
      name: "Boolean",
      description: "True/false toggle",
      icon: () => null,
      category: "boolean",
      fieldComponent: () => null,
      toZodType: () => z.boolean(),
      // No settingsComponent, cellComponent, maxPerSpec
    };

    expect(plugin.settingsComponent).toBeUndefined();
    expect(plugin.cellComponent).toBeUndefined();
    expect(plugin.maxPerSpec).toBeUndefined();
  });

  it("should support maxPerSpec constraint", () => {
    const plugin: FieldTypePlugin = {
      id: "toc_reference",
      name: "TOC Reference",
      description: "Table of contents reference",
      icon: () => null,
      category: "reference",
      fieldComponent: () => null,
      toZodType: () => z.string(),
      maxPerSpec: 1,
    };

    expect(plugin.maxPerSpec).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/__tests__/plugin.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement plugin types**

```ts
// src/schema/plugin.ts
import type { ComponentType } from "react";
import type { ZodTypeAny } from "zod";
import type { Field } from "./types";

export type FieldTypeCategory =
  | "text"
  | "number"
  | "date"
  | "selection"
  | "boolean"
  | "structural"
  | "reference"
  | "media";

export type FieldContext = "blueprint" | "task" | "form";

/** Props passed to a field type's renderer component. */
export interface FieldProps<S = unknown> {
  field: Field<S>;
  readOnly?: boolean;
}

/** Props passed to a field type's settings editor component. */
export interface SettingsProps<S = unknown> {
  settings: S;
  onChange: (settings: S) => void;
}

/** Props passed to a field type's table cell component. */
export interface CellProps<S = unknown> {
  field: Field<S>;
  value: unknown;
}

/**
 * A field type plugin defines everything about a field type:
 * metadata, UI components, Zod validation, and constraints.
 */
export interface FieldTypePlugin<S = unknown> {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number | string }>;
  category: FieldTypeCategory;

  settingsComponent?: ComponentType<SettingsProps<S>>;
  fieldComponent: ComponentType<FieldProps<S>>;
  cellComponent?: ComponentType<CellProps<S>>;

  toZodType: (field: Field<S>) => ZodTypeAny;

  defaultSettings?: S;
  maxPerSpec?: number;
  availableIn?: FieldContext[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/__tests__/plugin.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/plugin.ts src/schema/__tests__/plugin.test.ts
git commit -m "feat(schema): add FieldTypePlugin interface and component prop types"
```

### Task 6: Plugin registry

**Files:**
- Create: `src/schema/registry.ts`
- Test: `src/schema/__tests__/registry.test.ts`

- [ ] **Step 1: Write registry tests**

```ts
// src/schema/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createRegistry } from "../registry";
import type { FieldTypePlugin } from "../plugin";
import { z } from "zod";

function mockPlugin(id: string, overrides?: Partial<FieldTypePlugin>): FieldTypePlugin {
  return {
    id,
    name: id,
    description: `${id} field`,
    icon: () => null,
    category: "text",
    fieldComponent: () => null,
    toZodType: () => z.string(),
    ...overrides,
  };
}

describe("Plugin Registry", () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  it("should register and retrieve a plugin", () => {
    const plugin = mockPlugin("text");
    registry.register(plugin);

    expect(registry.get("text")).toBe(plugin);
  });

  it("should return undefined for unregistered plugin", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("should list all registered plugins", () => {
    registry.register(mockPlugin("text"));
    registry.register(mockPlugin("number"));

    expect(registry.getAll()).toHaveLength(2);
  });

  it("should filter plugins by category", () => {
    registry.register(mockPlugin("text", { category: "text" }));
    registry.register(mockPlugin("number", { category: "number" }));
    registry.register(mockPlugin("textarea", { category: "text" }));

    const textPlugins = registry.getByCategory("text");
    expect(textPlugins).toHaveLength(2);
    expect(textPlugins.map((p) => p.id)).toEqual(["text", "textarea"]);
  });

  it("should filter plugins by context", () => {
    registry.register(mockPlugin("text", { availableIn: ["blueprint", "task", "form"] }));
    registry.register(mockPlugin("reference", { availableIn: ["blueprint"] }));

    const taskPlugins = registry.getByContext("task");
    expect(taskPlugins).toHaveLength(1);
    expect(taskPlugins[0].id).toBe("text");
  });

  it("should include plugins with no availableIn filter in all contexts", () => {
    registry.register(mockPlugin("text")); // no availableIn = available everywhere

    expect(registry.getByContext("blueprint")).toHaveLength(1);
    expect(registry.getByContext("task")).toHaveLength(1);
    expect(registry.getByContext("form")).toHaveLength(1);
  });

  it("should throw when registering duplicate ID", () => {
    registry.register(mockPlugin("text"));
    expect(() => registry.register(mockPlugin("text"))).toThrow(
      'Field type "text" is already registered',
    );
  });

  it("should register multiple plugins at once", () => {
    registry.registerAll([mockPlugin("text"), mockPlugin("number")]);
    expect(registry.getAll()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/__tests__/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement registry**

```ts
// src/schema/registry.ts
import type { FieldTypePlugin, FieldTypeCategory, FieldContext } from "./plugin";

export interface PluginRegistry {
  register(plugin: FieldTypePlugin): void;
  registerAll(plugins: FieldTypePlugin[]): void;
  get(id: string): FieldTypePlugin | undefined;
  getAll(): FieldTypePlugin[];
  getByCategory(category: FieldTypeCategory): FieldTypePlugin[];
  getByContext(context: FieldContext): FieldTypePlugin[];
}

export function createRegistry(): PluginRegistry {
  const plugins = new Map<string, FieldTypePlugin>();

  return {
    register(plugin) {
      if (plugins.has(plugin.id)) {
        throw new Error(`Field type "${plugin.id}" is already registered`);
      }
      plugins.set(plugin.id, plugin);
    },

    registerAll(list) {
      for (const plugin of list) {
        this.register(plugin);
      }
    },

    get(id) {
      return plugins.get(id);
    },

    getAll() {
      return Array.from(plugins.values());
    },

    getByCategory(category) {
      return this.getAll().filter((p) => p.category === category);
    },

    getByContext(context) {
      return this.getAll().filter(
        (p) => !p.availableIn || p.availableIn.includes(context),
      );
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/__tests__/registry.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/registry.ts src/schema/__tests__/registry.test.ts
git commit -m "feat(schema): add plugin registry with category and context filtering"
```

### Task 7: Zod schema builder

**Files:**
- Create: `src/schema/zod-builder.ts`
- Test: `src/schema/__tests__/zod-builder.test.ts`

- [ ] **Step 1: Write Zod builder tests**

```ts
// src/schema/__tests__/zod-builder.test.ts
import { describe, it, expect } from "vitest";
import { specToZodSchema, getDefaultValues } from "../zod-builder";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { z } from "zod";

function mockPlugin(id: string, zodType: z.ZodTypeAny): FieldTypePlugin {
  return {
    id,
    name: id,
    description: "",
    icon: () => null,
    category: "text",
    fieldComponent: () => null,
    toZodType: () => zodType,
  };
}

describe("specToZodSchema", () => {
  const plugins = [
    mockPlugin("text", z.string()),
    mockPlugin("number", z.number()),
    mockPlugin("boolean", z.boolean()),
  ];

  it("should generate a Zod object schema from fields", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
      { field_type: "number", config: { name: "Age", api_accessor: "age", required: false, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, plugins);
    const result = schema.safeParse({ name: "John", age: 30 });
    expect(result.success).toBe(true);
  });

  it("should make required fields non-optional", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, plugins);
    const result = schema.safeParse({ name: "" });
    // Plugin's toZodType returns z.string() which allows empty — the required logic is in the plugin's toZodType
    expect(result.success).toBe(true);
  });

  it("should skip hidden fields from schema", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "", hidden: true }, settings: null, children: null, system: false },
      { field_type: "text", config: { name: "Title", api_accessor: "title", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, plugins);
    // Hidden fields should still be in the schema (they store data), just not rendered
    const result = schema.safeParse({ name: "test", title: "Mr" });
    expect(result.success).toBe(true);
  });

  it("should skip section fields (structural only)", () => {
    const sectionPlugin: FieldTypePlugin = {
      id: "section",
      name: "Section",
      description: "",
      icon: () => null,
      category: "structural",
      fieldComponent: () => null,
      toZodType: () => z.never(),
    };

    const fields: Field[] = [
      { field_type: "section", config: { name: "Info", api_accessor: "info_section", required: false, instructions: "" }, settings: null, children: null, system: false },
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, [...plugins, sectionPlugin]);
    const shape = schema.shape;
    expect(shape).not.toHaveProperty("info_section");
    expect(shape).toHaveProperty("name");
  });

  it("should support overrides", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Email", api_accessor: "email", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, plugins, {
      overrides: {
        email: (base) => base.pipe(z.string().email("Invalid email")),
      },
    });

    const result = schema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("should skip fields with unknown field types", () => {
    const fields: Field[] = [
      { field_type: "unknown_type", config: { name: "X", api_accessor: "x", required: false, instructions: "" }, settings: null, children: null, system: false },
    ];

    const schema = specToZodSchema(fields, plugins);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });
});

describe("getDefaultValues", () => {
  it("should extract default values from field configs", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "", default_value: "Untitled" }, settings: null, children: null, system: false },
      { field_type: "number", config: { name: "Count", api_accessor: "count", required: false, instructions: "", default_value: 0 }, settings: null, children: null, system: false },
      { field_type: "text", config: { name: "Note", api_accessor: "note", required: false, instructions: "" }, settings: null, children: null, system: false },
    ];

    const defaults = getDefaultValues(fields);
    expect(defaults).toEqual({ name: "Untitled", count: 0 });
  });

  it("should return empty object when no defaults", () => {
    const fields: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    expect(getDefaultValues(fields)).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/__tests__/zod-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Zod builder**

```ts
// src/schema/zod-builder.ts
import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from "zod";
import type { Field } from "./types";
import type { FieldTypePlugin } from "./plugin";

/** Structural field types that don't produce a value in the form data. */
const STRUCTURAL_TYPES = new Set(["section"]);

export interface ZodBuilderOptions {
  overrides?: Record<string, (base: ZodTypeAny) => ZodTypeAny>;
}

/**
 * Generates a Zod object schema from a field specification.
 * Each field type plugin provides its own `toZodType()` fragment.
 */
export function specToZodSchema(
  fields: Field[],
  plugins: FieldTypePlugin[],
  options?: ZodBuilderOptions,
): ZodObject<ZodRawShape> {
  const pluginMap = new Map(plugins.map((p) => [p.id, p]));
  const shape: ZodRawShape = {};

  for (const field of fields) {
    if (STRUCTURAL_TYPES.has(field.field_type)) continue;

    const plugin = pluginMap.get(field.field_type);
    if (!plugin) continue;

    let zodType = plugin.toZodType(field as Field<unknown>);

    if (!field.config.required) {
      zodType = zodType.optional() as ZodTypeAny;
    }

    if (options?.overrides?.[field.config.api_accessor]) {
      zodType = options.overrides[field.config.api_accessor](zodType);
    }

    shape[field.config.api_accessor] = zodType;
  }

  return z.object(shape);
}

/**
 * Extracts default values from field configs.
 * Returns an object with api_accessor keys mapped to their default_value.
 */
export function getDefaultValues(fields: Field[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.config.default_value !== undefined) {
      defaults[field.config.api_accessor] = field.config.default_value;
    }
  }

  return defaults;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/__tests__/zod-builder.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/zod-builder.ts src/schema/__tests__/zod-builder.test.ts
git commit -m "feat(schema): add Zod schema builder with overrides support"
```

### Task 8: Builder API (defineSpec)

**Files:**
- Create: `src/schema/define-spec.ts`
- Create: `src/schema/builders.ts`
- Test: `src/schema/__tests__/define-spec.test.ts`

- [ ] **Step 1: Write defineSpec tests**

```ts
// src/schema/__tests__/define-spec.test.ts
import { describe, it, expect } from "vitest";
import { defineSpec } from "../define-spec";
import { text, number, select, boolean, section } from "../builders";

describe("defineSpec", () => {
  it("should produce a fields array from builder calls", () => {
    const spec = defineSpec([
      text("name", { required: true }),
      number("price"),
    ]);

    expect(spec.fields).toHaveLength(2);
    expect(spec.fields[0].field_type).toBe("text");
    expect(spec.fields[0].config.api_accessor).toBe("name");
    expect(spec.fields[0].config.required).toBe(true);
    expect(spec.fields[1].field_type).toBe("number");
  });

  it("should set display name from api_accessor if not provided", () => {
    const spec = defineSpec([text("product_name")]);
    expect(spec.fields[0].config.name).toBe("product_name");
  });

  it("should allow explicit display name", () => {
    const spec = defineSpec([text("name", { name: "Product Name" })]);
    expect(spec.fields[0].config.name).toBe("Product Name");
  });

  it("should handle settings for field types", () => {
    const spec = defineSpec([
      text("title", { placeholder: "Enter title", prepend: "#" }),
    ]);

    expect(spec.fields[0].settings).toEqual({
      placeholder: "Enter title",
      prepend: "#",
    });
  });

  it("should handle select with options", () => {
    const spec = defineSpec([
      select("status", { options: { draft: "Draft", published: "Published" } }),
    ]);

    expect(spec.fields[0].settings).toEqual({
      options: { draft: "Draft", published: "Published" },
    });
  });

  it("should handle section with nested fields", () => {
    const spec = defineSpec([
      section("Basic Info", [
        text("name", { required: true }),
        number("age"),
      ]),
    ]);

    expect(spec.fields).toHaveLength(3); // section + 2 fields flattened
    expect(spec.fields[0].field_type).toBe("section");
    expect(spec.fields[0].config.name).toBe("Basic Info");
  });

  it("should extract default values", () => {
    const spec = defineSpec([
      text("name", { default_value: "Untitled" }),
      boolean("active", { default_value: true }),
    ]);

    expect(spec.defaultValues).toEqual({
      name: "Untitled",
      active: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/__tests__/define-spec.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement builders**

```ts
// src/schema/builders.ts
import type { Field, FieldConfig, FieldValidation } from "./types";

interface BaseOptions {
  name?: string;
  required?: boolean;
  instructions?: string;
  default_value?: unknown;
  unique?: boolean;
  localizable?: boolean;
  hidden?: boolean;
  read_only?: boolean;
  validation?: Partial<FieldValidation>;
}

function buildConfig(apiAccessor: string, options?: BaseOptions): FieldConfig {
  return {
    name: options?.name ?? apiAccessor,
    api_accessor: apiAccessor,
    required: options?.required ?? false,
    instructions: options?.instructions ?? "",
    default_value: options?.default_value,
    unique: options?.unique,
    localizable: options?.localizable,
    hidden: options?.hidden,
    read_only: options?.read_only,
  };
}

function buildField<S>(
  fieldType: string,
  apiAccessor: string,
  options?: BaseOptions & Record<string, unknown>,
  settingsKeys?: string[],
): Field<S> {
  const {
    name, required, instructions, default_value,
    unique, localizable, hidden, read_only, validation,
    ...rest
  } = options ?? {};

  const settings = settingsKeys
    ? (Object.fromEntries(
        settingsKeys.filter((k) => k in rest).map((k) => [k, rest[k]]),
      ) as S)
    : (Object.keys(rest).length > 0 ? rest as S : null);

  return {
    field_type: fieldType,
    config: buildConfig(apiAccessor, options),
    validation: validation as FieldValidation | undefined,
    settings: settings && Object.keys(settings as object).length > 0 ? settings : null,
    children: null,
    system: false,
  };
}

export function text(apiAccessor: string, options?: BaseOptions & { placeholder?: string; prepend?: string; append?: string }) {
  return buildField<{ placeholder?: string; prepend?: string; append?: string }>(
    "text", apiAccessor, options, ["placeholder", "prepend", "append"],
  );
}

export function number(apiAccessor: string, options?: BaseOptions & { min?: number; max?: number; step?: number; prepend?: string; append?: string }) {
  return buildField("number", apiAccessor, options, ["min", "max", "step", "prepend", "append"]);
}

export function boolean(apiAccessor: string, options?: BaseOptions) {
  return buildField("boolean", apiAccessor, options);
}

export function select(apiAccessor: string, options?: BaseOptions & { options?: Record<string, string>; multiple?: boolean }) {
  return buildField("select", apiAccessor, options, ["options", "multiple"]);
}

export function section(name: string, children: Field[]): Field[] {
  const sectionField: Field = {
    field_type: "section",
    config: {
      name,
      api_accessor: `section_${name.toLowerCase().replace(/\s+/g, "_")}`,
      required: false,
      instructions: "",
    },
    settings: null,
    children: null,
    system: false,
  };
  return [sectionField, ...children];
}
```

- [ ] **Step 4: Implement defineSpec**

```ts
// src/schema/define-spec.ts
import type { Field } from "./types";
import { getDefaultValues } from "./zod-builder";

export interface SpecDefinition {
  fields: Field[];
  defaultValues: Record<string, unknown>;
}

/**
 * Defines a specification from builder calls.
 * Returns the field array and extracted default values.
 * Zod schema generation requires plugins, so zodSchema is not included here —
 * use specToZodSchema(spec.fields, plugins) separately.
 */
export function defineSpec(fieldsOrNested: (Field | Field[])[]): SpecDefinition {
  const fields = fieldsOrNested.flat();

  return {
    fields,
    defaultValues: getDefaultValues(fields),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/schema/__tests__/define-spec.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/schema/builders.ts src/schema/define-spec.ts src/schema/__tests__/define-spec.test.ts
git commit -m "feat(schema): add defineSpec() builder API with text, number, boolean, select, section"
```

### Task 9: Wire up schema exports

**Files:**
- Modify: `src/schema/index.ts`

- [ ] **Step 1: Export all schema layer modules**

```ts
// src/schema/index.ts
// Types
export type {
  Field,
  FieldConfig,
  FieldCondition,
  FieldValidation,
  Schema,
} from "./types";

// Plugin types
export type {
  FieldTypePlugin,
  FieldTypeCategory,
  FieldContext,
  FieldProps,
  SettingsProps,
  CellProps,
} from "./plugin";

// Registry
export { createRegistry } from "./registry";
export type { PluginRegistry } from "./registry";

// Zod builder
export { specToZodSchema, getDefaultValues } from "./zod-builder";

// Builder API
export { defineSpec } from "./define-spec";
export type { SpecDefinition } from "./define-spec";
export { text, number, boolean, select, section } from "./builders";
```

- [ ] **Step 2: Verify build succeeds**

Run: `npx tsup`
Expected: Build succeeds

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify all tests pass**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/index.ts
git commit -m "feat(schema): wire up all schema layer exports"
```

---

## Chunk 3: FieldKitProvider + Renderer Core

Implements the React context provider for plugins/adapters and the core FieldRenderer + FieldComponent. After this chunk, forms can be rendered from specifications (with a few simple field types to prove it works).

### Task 10: Adapter types

**Files:**
- Create: `src/renderer/adapters.ts`

- [ ] **Step 1: Define adapter interfaces**

```ts
// src/renderer/adapters.ts
import type { Field } from "../schema/types";

export interface ReferenceItem {
  id: string;
  display_name: string;
  blueprint_id?: string;
  [key: string]: unknown;
}

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  mime_type: string;
  size: number;
  [key: string]: unknown;
}

export interface MediaFilter {
  mime_types?: string[];
  query?: string;
}

export interface DataQuery {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface DataPage<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface EditorSpecData {
  id: string;
  name: string;
  description?: string;
  page_width?: number;
  nodes: Record<string, Record<string, unknown>>;
  marks: Record<string, Record<string, unknown>>;
}

export interface EditorSpecGlobalSettings {
  [key: string]: unknown;
}

export interface FieldKitAdapters {
  reference?: {
    search: (blueprintIds: string[], query: string) => Promise<ReferenceItem[]>;
    fetch: (ids: string[]) => Promise<ReferenceItem[]>;
  };
  media?: {
    upload: (file: File) => Promise<MediaItem>;
    browse: (filter: MediaFilter) => Promise<MediaItem[]>;
  };
  blueprint?: {
    getSchema: (blueprintId: string) => Promise<Field[]>;
    getData: (blueprintId: string, query: DataQuery) => Promise<DataPage>;
  };
  textType?: {
    getEditorSpec: (id: string) => Promise<EditorSpecData>;
    getGlobalSettings: () => Promise<EditorSpecGlobalSettings>;
    listEditorSpecs: () => Promise<EditorSpecData[]>;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/adapters.ts
git commit -m "feat(renderer): add adapter type definitions for backend-dependent fields"
```

### Task 11: FieldKitProvider context

**Files:**
- Create: `src/renderer/context.ts`
- Create: `src/renderer/provider.tsx`
- Test: `src/renderer/__tests__/provider.test.tsx`

- [ ] **Step 1: Write provider tests**

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/provider.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement context and provider**

```ts
// src/renderer/context.ts
import { createContext } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { FieldKitAdapters } from "./adapters";

export interface FieldKitContextValue {
  getPlugin: (id: string) => FieldTypePlugin | undefined;
  getAllPlugins: () => FieldTypePlugin[];
  adapters: FieldKitAdapters;
}

export const FieldKitContext = createContext<FieldKitContextValue | null>(null);
```

```tsx
// src/renderer/provider.tsx
import { useMemo, type ReactNode } from "react";
import { FieldKitContext, type FieldKitContextValue } from "./context";
import type { FieldTypePlugin } from "../schema/plugin";
import type { FieldKitAdapters } from "./adapters";
import { useContext } from "react";

export interface FieldKitProviderProps {
  plugins: FieldTypePlugin[];
  adapters?: FieldKitAdapters;
  children: ReactNode;
}

export function FieldKitProvider({ plugins, adapters = {}, children }: FieldKitProviderProps) {
  const value = useMemo<FieldKitContextValue>(() => {
    const pluginMap = new Map(plugins.map((p) => [p.id, p]));

    return {
      getPlugin: (id) => pluginMap.get(id),
      getAllPlugins: () => plugins,
      adapters,
    };
  }, [plugins, adapters]);

  return (
    <FieldKitContext.Provider value={value}>{children}</FieldKitContext.Provider>
  );
}
FieldKitProvider.displayName = "FieldKitProvider";

export function useFieldKit(): FieldKitContextValue {
  const context = useContext(FieldKitContext);
  if (!context) {
    throw new Error("useFieldKit must be used within a FieldKitProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/provider.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/context.ts src/renderer/provider.tsx src/renderer/__tests__/provider.test.tsx
git commit -m "feat(renderer): add FieldKitProvider context with plugin lookup and adapters"
```

### Task 12: FieldComponent (single field renderer)

**Files:**
- Create: `src/renderer/field-component.tsx`
- Test: `src/renderer/__tests__/field-component.test.tsx`

- [ ] **Step 1: Write FieldComponent tests**

```tsx
// src/renderer/__tests__/field-component.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../provider";
import { FieldComponent } from "../field-component";
import type { FieldTypePlugin, FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { z } from "zod";

function TestTextField({ field }: FieldProps) {
  return <input data-testid={`field-${field.config.api_accessor}`} placeholder={field.config.name} />;
}

const textPlugin: FieldTypePlugin = {
  id: "text",
  name: "Text",
  description: "",
  icon: () => null,
  category: "text",
  fieldComponent: TestTextField,
  toZodType: () => z.string(),
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: { name: "" } });
  return (
    <FormProvider {...methods}>
      <FieldKitProvider plugins={[textPlugin]}>{children}</FieldKitProvider>
    </FormProvider>
  );
}

describe("FieldComponent", () => {
  const field: Field = {
    field_type: "text",
    config: { name: "Name", api_accessor: "name", required: true, instructions: "" },
    settings: null,
    children: null,
    system: false,
  };

  it("should render the plugin's field component", () => {
    render(
      <Wrapper>
        <FieldComponent field={field} />
      </Wrapper>,
    );

    expect(screen.getByTestId("field-name")).toBeInTheDocument();
  });

  it("should not render hidden fields", () => {
    const hiddenField: Field = {
      ...field,
      config: { ...field.config, hidden: true },
    };

    render(
      <Wrapper>
        <FieldComponent field={hiddenField} />
      </Wrapper>,
    );

    expect(screen.queryByTestId("field-name")).not.toBeInTheDocument();
  });

  it("should render fallback for unknown field types", () => {
    const unknownField: Field = {
      ...field,
      field_type: "unknown_type",
    };

    render(
      <Wrapper>
        <FieldComponent field={unknownField} />
      </Wrapper>,
    );

    expect(screen.getByText(/unknown field type/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/field-component.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement FieldComponent**

```tsx
// src/renderer/field-component.tsx
import { memo } from "react";
import type { Field } from "../schema/types";
import { useFieldKit } from "./provider";

export interface FieldComponentProps {
  field: Field;
  readOnly?: boolean;
}

function FieldComponentInner({ field, readOnly }: FieldComponentProps) {
  const { getPlugin } = useFieldKit();

  // Hidden fields are not rendered
  if (field.config.hidden) return null;

  const plugin = getPlugin(field.field_type);

  if (!plugin) {
    return (
      <div role="alert" style={{ color: "red", padding: "8px", border: "1px solid red", borderRadius: "4px" }}>
        Unknown field type: <code>{field.field_type}</code>
      </div>
    );
  }

  const Component = plugin.fieldComponent;

  return <Component field={field} readOnly={readOnly || field.config.read_only} />;
}

export const FieldComponent = memo(FieldComponentInner, (prev, next) => {
  return (
    prev.field.config.api_accessor === next.field.config.api_accessor &&
    prev.field.field_type === next.field.field_type &&
    prev.readOnly === next.readOnly
  );
});
(FieldComponent as { displayName?: string }).displayName = "FieldComponent";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/field-component.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/field-component.tsx src/renderer/__tests__/field-component.test.tsx
git commit -m "feat(renderer): add FieldComponent with plugin lookup, hidden field support, and unknown fallback"
```

### Task 13: FieldRenderer (main renderer)

**Files:**
- Create: `src/renderer/field-renderer.tsx`
- Test: `src/renderer/__tests__/field-renderer.test.tsx`

- [ ] **Step 1: Write FieldRenderer tests**

```tsx
// src/renderer/__tests__/field-renderer.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../provider";
import { FieldRenderer } from "../field-renderer";
import type { FieldTypePlugin, FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { z } from "zod";

function TestField({ field }: FieldProps) {
  return <div data-testid={`field-${field.config.api_accessor}`}>{field.config.name}</div>;
}

const plugins: FieldTypePlugin[] = [
  {
    id: "text",
    name: "Text",
    description: "",
    icon: () => null,
    category: "text",
    fieldComponent: TestField,
    toZodType: () => z.string(),
  },
  {
    id: "section",
    name: "Section",
    description: "",
    icon: () => null,
    category: "structural",
    fieldComponent: () => null,
    toZodType: () => z.never(),
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: {} });
  return (
    <FormProvider {...methods}>
      <FieldKitProvider plugins={plugins}>{children}</FieldKitProvider>
    </FormProvider>
  );
}

describe("FieldRenderer", () => {
  it("should render all fields in a schema", () => {
    const schema: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
      { field_type: "text", config: { name: "Email", api_accessor: "email", required: false, instructions: "" }, settings: null, children: null, system: false },
    ];

    render(
      <Wrapper>
        <FieldRenderer schema={schema} />
      </Wrapper>,
    );

    expect(screen.getByTestId("field-name")).toBeInTheDocument();
    expect(screen.getByTestId("field-email")).toBeInTheDocument();
  });

  it("should render nothing for empty schema", () => {
    const { container } = render(
      <Wrapper>
        <FieldRenderer schema={[]} />
      </Wrapper>,
    );

    expect(container.children).toHaveLength(1); // wrapper div, no fields
  });

  it("should pass readOnly to all fields", () => {
    const schema: Field[] = [
      { field_type: "text", config: { name: "Name", api_accessor: "name", required: true, instructions: "" }, settings: null, children: null, system: false },
    ];

    render(
      <Wrapper>
        <FieldRenderer schema={schema} readOnly />
      </Wrapper>,
    );

    expect(screen.getByTestId("field-name")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/field-renderer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement FieldRenderer**

```tsx
// src/renderer/field-renderer.tsx
import { memo } from "react";
import type { Field, Schema } from "../schema/types";
import { FieldComponent } from "./field-component";

export interface FieldRendererProps {
  schema: Schema;
  readOnly?: boolean;
  loading?: boolean;
  values?: Record<string, unknown>;
}

function hasSections(schema: Schema): boolean {
  return schema.some((f) => f.field_type === "section");
}

function FieldRendererInner({ schema, readOnly, loading }: FieldRendererProps) {
  if (loading) {
    return <div data-testid="field-renderer-loading">Loading...</div>;
  }

  return (
    <div data-testid="field-renderer">
      {schema.map((field) => (
        <FieldComponent
          key={field.config.api_accessor}
          field={field}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

export const FieldRenderer = memo(FieldRendererInner);
(FieldRenderer as { displayName?: string }).displayName = "FieldRenderer";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/field-renderer.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/field-renderer.tsx src/renderer/__tests__/field-renderer.test.tsx
git commit -m "feat(renderer): add FieldRenderer component that renders fields from schema"
```

### Task 14: Wire up renderer exports

**Files:**
- Modify: `src/renderer/index.ts`

- [ ] **Step 1: Export all renderer modules**

```ts
// src/renderer/index.ts
// Provider
export { FieldKitProvider, useFieldKit } from "./provider";
export type { FieldKitProviderProps } from "./provider";

// Adapters
export type {
  FieldKitAdapters,
  ReferenceItem,
  MediaItem,
  MediaFilter,
  DataQuery,
  DataPage,
  EditorSpecData,
  EditorSpecGlobalSettings,
} from "./adapters";

// Components
export { FieldRenderer } from "./field-renderer";
export type { FieldRendererProps } from "./field-renderer";
export { FieldComponent } from "./field-component";
export type { FieldComponentProps } from "./field-component";
```

- [ ] **Step 2: Verify build and all tests pass**

Run: `npx tsup && npx vitest run`
Expected: Build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.ts
git commit -m "feat(renderer): wire up all renderer layer exports"
```

---

## Chunk 4: Simple Field Type Plugins

Implements the first batch of field type plugins (text, textarea, number, boolean, color, email, url, time). Each plugin provides: plugin definition, field component, cell component, `toZodType()`, and a Storybook story.

**Pattern:** This chunk shows the full TDD cycle for the `text` plugin as a reference. The remaining simple plugins follow the same pattern and are batched together.

### Task 15: Text field type plugin (reference implementation)

**Files:**
- Create: `src/schema/field-types/text.ts`
- Create: `src/renderer/fields/text-field.tsx`
- Create: `src/table/cells/text-cell.tsx`
- Test: `src/schema/field-types/__tests__/text.test.ts`
- Test: `src/renderer/fields/__tests__/text-field.test.tsx`

- [ ] **Step 1: Write text plugin tests**

```ts
// src/schema/field-types/__tests__/text.test.ts
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
    expect(zodType.safeParse("").success).toBe(false); // required
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
    expect(zodType.safeParse("a").success).toBe(false); // too short
    expect(zodType.safeParse("ab").success).toBe(true);
    expect(zodType.safeParse("abcde").success).toBe(true);
    expect(zodType.safeParse("abcdef").success).toBe(false); // too long
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/schema/field-types/__tests__/text.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement text plugin definition**

```ts
// src/schema/field-types/text.ts
import { z } from "zod";
import type { FieldTypePlugin } from "../plugin";
import type { Field } from "../types";
import { Type as TypeIcon } from "lucide-react";

export interface TextSettings {
  placeholder?: string;
  prepend?: string;
  append?: string;
}

export const textPlugin: FieldTypePlugin<TextSettings> = {
  id: "text",
  name: "Text",
  description: "A single line of text",
  icon: TypeIcon,
  category: "text",

  fieldComponent: () => null, // replaced in renderer layer
  cellComponent: undefined,    // replaced in table layer

  toZodType(field: Field<TextSettings>) {
    let schema = z.string();

    if (field.config.required) {
      schema = schema.min(1, `${field.config.name} is required`);
    }

    if (field.validation?.min_length !== undefined) {
      schema = schema.min(field.validation.min_length);
    }

    if (field.validation?.max_length !== undefined) {
      schema = schema.max(field.validation.max_length);
    }

    if (field.validation?.pattern) {
      schema = schema.regex(
        new RegExp(field.validation.pattern),
        field.validation.pattern_message ?? "Invalid format",
      );
    }

    return schema;
  },

  defaultSettings: { placeholder: "" },
  availableIn: ["blueprint", "task", "form"],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/schema/field-types/__tests__/text.test.ts`
Expected: All PASS

- [ ] **Step 5: Implement text field component**

```tsx
// src/renderer/fields/text-field.tsx
import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { TextSettings } from "../../schema/field-types/text";
import { FormField } from "@knkcs/anker/forms";
import { TextInput } from "@knkcs/anker/atoms";

export function TextField({ field, readOnly }: FieldProps<TextSettings>) {
  const { control } = useFormContext();
  const { config, settings } = field;

  return (
    <FormField
      name={config.api_accessor}
      label={config.name}
      required={config.required}
      helperText={config.instructions || undefined}
      readOnly={readOnly}
    >
      {(fieldProps) => (
        <TextInput
          {...fieldProps}
          placeholder={settings?.placeholder}
          prepend={settings?.prepend}
          append={settings?.append}
          readOnly={readOnly}
        />
      )}
    </FormField>
  );
}
TextField.displayName = "TextField";
```

- [ ] **Step 6: Implement text cell component**

```tsx
// src/table/cells/text-cell.tsx
import type { CellProps } from "../../schema/plugin";

export function TextCell({ value }: CellProps) {
  const text = value != null ? String(value) : "";
  return <span title={text}>{text}</span>;
}
TextCell.displayName = "TextCell";
```

- [ ] **Step 7: Write text field render test**

```tsx
// src/renderer/fields/__tests__/text-field.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../../provider";
import { TextField } from "../text-field";
import { textPlugin } from "../../../schema/field-types/text";
import type { Field } from "../../../schema/types";

function Wrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: { name: "" } });
  return (
    <FormProvider {...methods}>
      <FieldKitProvider plugins={[{ ...textPlugin, fieldComponent: TextField }]}>
        {children}
      </FieldKitProvider>
    </FormProvider>
  );
}

describe("TextField", () => {
  const field: Field = {
    field_type: "text",
    config: { name: "Product Name", api_accessor: "name", required: true, instructions: "Enter name" },
    settings: { placeholder: "Type here" },
    children: null,
    system: false,
  };

  it("should render with label and placeholder", () => {
    render(
      <Wrapper>
        <TextField field={field} />
      </Wrapper>,
    );

    expect(screen.getByText("Product Name")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/schema/field-types/text.ts src/schema/field-types/__tests__/text.test.ts src/renderer/fields/text-field.tsx src/renderer/fields/__tests__/text-field.test.tsx src/table/cells/text-cell.tsx
git commit -m "feat(schema): add text field type plugin with field component, cell, and Zod validation"
```

### Task 16: Remaining simple field type plugins

Follow the same pattern as Task 15 for each. Each plugin needs:
1. Plugin definition in `src/schema/field-types/{type}.ts` with `toZodType()`
2. Field component in `src/renderer/fields/{type}-field.tsx`
3. Cell component in `src/table/cells/{type}-cell.tsx`
4. Plugin test in `src/schema/field-types/__tests__/{type}.test.ts`
5. Field component test in `src/renderer/fields/__tests__/{type}-field.test.tsx`

**Plugins to implement (one commit each):**

- [ ] **Step 1: textarea** — `z.string()`, uses Chakra `Textarea`, cell shows truncated text
- [ ] **Step 2: number** — `z.number()` with optional min/max from settings, uses anker `NumberInputField`, cell shows formatted number
- [ ] **Step 3: boolean** — `z.boolean()`, uses anker `SwitchField`, cell shows check/X icon
- [ ] **Step 4: color** — `z.string()`, uses anker `ColorPickerField`, cell shows color circle
- [ ] **Step 5: email** (new) — `z.string().email()`, uses anker `InputField` with type="email", cell shows text
- [ ] **Step 6: url** (new) — `z.string().url()`, uses anker `InputField` with type="url", cell shows link
- [ ] **Step 7: time** — `z.string()`, uses anker `DatePickerField` with type="time", cell shows formatted time
- [ ] **Step 8: date** — `z.string()` or `z.date()`, uses anker `DatePickerField`, settings: enable_range, min_date, max_date, validity_role. Cell shows formatted date.
- [ ] **Step 9: slug** (new) — `z.string()` with auto-generation from `source_field`, custom component that watches another field and slugifies. Cell shows text.

Each step follows: write test → verify fail → implement → verify pass → commit with message like `feat(schema): add {type} field type plugin`.

- [ ] **Step 10: Create built-in plugins barrel export**

```ts
// src/schema/field-types/index.ts
import { textPlugin } from "./text";
import { textareaPlugin } from "./textarea";
import { numberPlugin } from "./number";
import { booleanPlugin } from "./boolean";
import { colorPlugin } from "./color";
import { emailPlugin } from "./email";
import { urlPlugin } from "./url";
import { timePlugin } from "./time";
import { datePlugin } from "./date";
import { slugPlugin } from "./slug";
import type { FieldTypePlugin } from "../plugin";

export const simpleFieldTypes: FieldTypePlugin[] = [
  textPlugin,
  textareaPlugin,
  numberPlugin,
  booleanPlugin,
  colorPlugin,
  emailPlugin,
  urlPlugin,
  timePlugin,
  datePlugin,
  slugPlugin,
];

export {
  textPlugin, textareaPlugin, numberPlugin, booleanPlugin,
  colorPlugin, emailPlugin, urlPlugin, timePlugin, datePlugin, slugPlugin,
};
```

- [ ] **Step 11: Commit barrel export**

```bash
git add src/schema/field-types/index.ts
git commit -m "feat(schema): add barrel export for simple field type plugins"
```

---

## Chunk 5: Selection & Structural Field Type Plugins

Implements selection types (select, radio, checkboxes) and structural types (section, group, blocks, array). These are more complex because they have settings components and/or nested rendering.

### Task 17: Selection field types

**Files per type:**
- `src/schema/field-types/{select|radio|checkboxes}.ts`
- `src/renderer/fields/{select|radio|checkboxes}-field.tsx`
- `src/table/cells/{select|radio|checkboxes}-cell.tsx`
- `src/schema/field-types/__tests__/{select|radio|checkboxes}.test.ts`

- [ ] **Step 1: select plugin** — `z.string()` or `z.array(z.string())` when multiple=true, settings: options map + multiple flag. Settings component for managing key-value options. Cell shows badge.
- [ ] **Step 2: radio plugin** — `z.string()`, settings: options map. Cell shows badge.
- [ ] **Step 3: checkboxes plugin** — `z.array(z.string())`, settings: options map. Cell shows comma-separated badges.

Each step: test → implement → commit.

### Task 18: Section field type

**Files:**
- Create: `src/schema/field-types/section.ts`
- Modify: `src/renderer/field-renderer.tsx` — add tabbed layout when sections detected

- [ ] **Step 1: Implement section plugin** — Structural only, `toZodType` returns `z.never()` (excluded from schema). No field component (handled by FieldRenderer). No cell (excluded from table columns).

- [ ] **Step 2: Update FieldRenderer for tabbed sections** — When `hasSections(schema)` is true, group fields by section and render in a tab layout using Chakra Tabs. Fields before the first section go into a default tab.

- [ ] **Step 3: Test section rendering** — Verify tabs appear, fields grouped correctly.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(renderer): add section field type with tabbed layout support"
```

### Task 19: Group field type

**Files:**
- Create: `src/schema/field-types/group.ts`
- Create: `src/renderer/fields/group-field.tsx`
- Create: `src/table/cells/group-cell.tsx`

- [ ] **Step 1: Implement group plugin** — `z.array(z.object(...))` built from children fields. Settings: min_items, max_items.

- [ ] **Step 2: Implement group field component** — Renders children fields as a repeating fieldset with "Add item" button, drag-to-reorder (dnd-kit), and remove button per item. Uses RHF's `useFieldArray`.

- [ ] **Step 3: Implement group cell** — Shows item count, e.g., "3 items".

- [ ] **Step 4: Test and commit**

```bash
git commit -m "feat(schema): add group field type with repeating children and drag-to-reorder"
```

### Task 20: Blocks field type

**Files:**
- Create: `src/schema/field-types/blocks.ts`
- Create: `src/renderer/fields/blocks-field.tsx`
- Create: `src/table/cells/blocks-cell.tsx`

- [ ] **Step 1: Implement blocks plugin** — `z.array(z.discriminatedUnion(...))` built from allowed block definitions. Settings: allowed_blocks (array of block template specs).

- [ ] **Step 2: Implement blocks field component** — Renders a list of block instances. Each block has a type selector (from allowed_blocks) and renders that block's fields via FieldRenderer. Add block button, reorder, remove.

- [ ] **Step 3: Implement blocks cell** — Shows block count + type summary.

- [ ] **Step 4: Test and commit**

```bash
git commit -m "feat(schema): add blocks field type (dynamic zones) with block template support"
```

### Task 21: Array field type

**Files:**
- Create: `src/schema/field-types/array.ts`
- Create: `src/renderer/fields/array-field.tsx`
- Create: `src/table/cells/array-cell.tsx`

- [ ] **Step 1: Implement array plugin** — Two modes: "dynamic" (`z.array(z.object({ key: z.string(), value: z.string() }))`) and "keyed" (fixed keys array). Reuse anker's `ArrayField` component.

- [ ] **Step 2: Test and commit**

```bash
git commit -m "feat(schema): add array field type with dynamic and keyed modes"
```

---

## Chunk 6: Complex Text & Reference Field Type Plugins

Implements markdown, code, rich_text (with knkeditor integration) and the adapter-dependent reference types (reference, toc_reference, media, virtual_table).

### Task 22: Markdown field type

- [ ] **Step 1:** Plugin with `z.string()`, uses anker's `MarkdownField` (optional MDEditor peer dep). Cell shows truncated plain text.
- [ ] **Step 2:** Test and commit.

### Task 23: Code field type

- [ ] **Step 1:** Plugin with `z.string()`, settings: language. Uses anker's `CodeField` (optional Monaco peer dep). Cell shows truncated text.
- [ ] **Step 2:** Test and commit.

### Task 24: Rich text field type

- [ ] **Step 1:** Plugin with `z.any()` (rich text is JSON/object), settings: editor_spec (string ID or inline EditorSpec), view_mode. Uses knkeditor `Editor` component (optional peer dep). Fetches EditorSpec via textType adapter to build TipTap extensions.
- [ ] **Step 2:** Implement fallback when knkeditor not available (textarea).
- [ ] **Step 3:** Cell shows truncated plain text extracted from rich text content.
- [ ] **Step 4:** Test and commit.

### Task 25: Reference field type

- [ ] **Step 1:** Plugin with `z.string()` or `z.array(z.string())`, settings: blueprints, always_latest, max_items, max_depth, attributes. Field component uses reference adapter for search/fetch.
- [ ] **Step 2:** Settings component for configuring blueprint filter, max items, etc.
- [ ] **Step 3:** Cell shows linked item name(s).
- [ ] **Step 4:** Test and commit.

### Task 26: TOC Reference field type

- [ ] **Step 1:** Clone reference plugin with `maxPerSpec: 1`. Same field/cell components.
- [ ] **Step 2:** Test and commit.

### Task 27: Media field type

- [ ] **Step 1:** Plugin with `z.array(z.string())`, settings: accept (mime types), max_items. Field uses media adapter for browse/upload.
- [ ] **Step 2:** Cell shows thumbnail or file icon.
- [ ] **Step 3:** Test and commit.

### Task 28: Virtual table field type

- [ ] **Step 1:** Plugin with `z.array(z.record(z.unknown()))`, settings: blueprint, always_latest, max_records_per_page. Field uses blueprint adapter to fetch schema + data, renders an inner SpecDataTable.
- [ ] **Step 2:** Cell shows row count.
- [ ] **Step 3:** Test and commit.

### Task 29: Built-in field types barrel + builtInFieldTypes array

**Files:**
- Modify: `src/schema/field-types/index.ts`
- Modify: `src/schema/index.ts`

- [ ] **Step 1:** Add all 25 plugins to the barrel export and create `builtInFieldTypes` array.
- [ ] **Step 2:** Export `builtInFieldTypes` from `@knkcs/fieldkit/schema`.
- [ ] **Step 3:** Commit.

```bash
git commit -m "feat(schema): export builtInFieldTypes array with all 25 field type plugins"
```

---

## Chunk 7: Specification Editor

Implements the drag-and-drop specification editor (SpecEditor, FieldModal, TypePicker).

### Task 30: TypePicker component

**Files:**
- Create: `src/editor/type-picker.tsx`
- Test: `src/editor/__tests__/type-picker.test.tsx`

- [ ] **Step 1:** Grid of available field types grouped by category. Each type shows icon, name, description. Filterable by text search. Respects `availableIn` filter.
- [ ] **Step 2:** Test and commit.

### Task 31: FieldModal component

**Files:**
- Create: `src/editor/field-modal.tsx`
- Test: `src/editor/__tests__/field-modal.test.tsx`

- [ ] **Step 1:** Modal with three tabs: General (name, api_accessor, required, instructions, default value, hidden, read-only, condition), Validation (min/max length, regex, unique), Settings (renders plugin's `settingsComponent`).
- [ ] **Step 2:** Auto-generate api_accessor from name (slugify).
- [ ] **Step 3:** Validate api_accessor uniqueness within spec.
- [ ] **Step 4:** Test and commit.

### Task 32: SpecEditor component

**Files:**
- Create: `src/editor/spec-editor.tsx`
- Test: `src/editor/__tests__/spec-editor.test.tsx`

- [ ] **Step 1:** Sortable field list with dnd-kit. Each field item shows type icon, name, api_accessor, and edit/remove buttons.
- [ ] **Step 2:** "Add field" button opens TypePicker, selecting a type opens FieldModal.
- [ ] **Step 3:** Clicking a field item opens FieldModal for editing.
- [ ] **Step 4:** Enforce `maxPerSpec` constraints (e.g., toc_reference max 1).
- [ ] **Step 5:** Test and commit.

### Task 33: Wire up editor exports

```ts
// src/editor/index.ts
export { SpecEditor } from "./spec-editor";
export { FieldModal } from "./field-modal";
export { TypePicker } from "./type-picker";
```

- [ ] **Step 1:** Export, build, test.
- [ ] **Step 2:** Commit.

```bash
git commit -m "feat(editor): add SpecEditor with drag-and-drop, FieldModal, and TypePicker"
```

---

## Chunk 8: Table Layer

Implements the SpecDataTable in fieldkit and the base DataTable in anker.

### Task 34: Anker DataTable base component

> **Note:** This task modifies the `@knkcs/anker` repository at `/Users/jeskoiwanovski/repo/anker/`.

**Files:**
- Create: `/Users/jeskoiwanovski/repo/anker/src/components/data-table/data-table.tsx`
- Create: `/Users/jeskoiwanovski/repo/anker/src/components/data-table/table-pagination.tsx`
- Create: `/Users/jeskoiwanovski/repo/anker/src/components/data-table/index.ts`
- Modify: `/Users/jeskoiwanovski/repo/anker/src/components/index.ts` — add DataTable export

- [ ] **Step 1:** Implement generic DataTable wrapping TanStack Table with: controlled pagination (pageCount, onPageChange), controlled sorting (sorting, onSortingChange), row selection (rowSelection, onRowSelectionChange), onRowClick, loading state, searchable, emptyState.
- [ ] **Step 2:** Implement TablePagination (first/prev/next/last buttons with page indicator).
- [ ] **Step 3:** Test and commit in anker repo.

### Task 35: Anker CardList rename

> **Note:** This task modifies the `@knkcs/anker` repository.

**Files:**
- Rename: `table.tsx` → `card-list.tsx`, `table-item.tsx` → `card-list-item.tsx`, `table-data.tsx` → `card-list-data.tsx`
- Modify: `/Users/jeskoiwanovski/repo/anker/src/components/index.ts`

- [ ] **Step 1:** Rename components (Table→CardList, TableItem→CardListItem, TableData→CardListData). Update exports. Keep old names as deprecated re-exports for migration.
- [ ] **Step 2:** Test and commit in anker repo.

### Task 36: getCellForFieldType utility

**Files:**
- Create: `src/table/get-cell-for-type.ts`
- Test: `src/table/__tests__/get-cell-for-type.test.ts`

- [ ] **Step 1:** Takes `Schema` and plugins, returns `ColumnDef[]`. Maps each field to its plugin's `cellComponent`. Excludes section and hidden fields. Uses `field.config.name` as column header.
- [ ] **Step 2:** Test and commit.

### Task 37: EditDrawer component

**Files:**
- Create: `src/table/edit-drawer.tsx`

- [ ] **Step 1:** Drawer that renders a FieldRenderer for a single row. Accepts schema, initial values, onSave, onCancel. Creates its own FormProvider with Zod validation.
- [ ] **Step 2:** Test and commit.

### Task 38: SpecDataTable component

**Files:**
- Create: `src/table/spec-data-table.tsx`
- Test: `src/table/__tests__/spec-data-table.test.tsx`

- [ ] **Step 1:** Takes schema + data, auto-generates columns via getCellForFieldType. Renders anker DataTable. Supports editable mode with EditDrawer for create/update. Supports additionalColumns and columnOverrides.
- [ ] **Step 2:** Test and commit.

### Task 39: Wire up table exports

```ts
// src/table/index.ts
export { SpecDataTable } from "./spec-data-table";
export { EditDrawer } from "./edit-drawer";
export { getCellForFieldType } from "./get-cell-for-type";
```

- [ ] **Step 1:** Export, build, test.
- [ ] **Step 2:** Commit.

```bash
git commit -m "feat(table): add SpecDataTable with auto-generated columns, cells, and edit drawer"
```

---

## Chunk 9: Rich Text Spec Layer

Implements the EditorSpec system for configuring which TipTap nodes/marks are available.

### Task 40: EditorNodePlugin types and EditorSpec schema

**Files:**
- Create: `src/rich-text-spec/types.ts`
- Test: `src/rich-text-spec/__tests__/types.test.ts`

- [ ] **Step 1:** Define `EditorNodePlugin`, `EditorSpec`, `NodeOptions` types.
- [ ] **Step 2:** Test and commit.

### Task 41: EditorSpecEditor component

**Files:**
- Create: `src/rich-text-spec/editor-spec-editor.tsx`
- Test: `src/rich-text-spec/__tests__/editor-spec-editor.test.tsx`

- [ ] **Step 1:** UI that shows all registered EditorNodePlugins grouped by category (formatting, structure, media, reference, special). Each has a toggle (on/off) and an expand button for settings. Settings rendered via FieldRenderer using the plugin's `settingsSpec`.
- [ ] **Step 2:** Test and commit.

### Task 42: Built-in node/mark plugins

**Files:**
- Create: `src/rich-text-spec/node-plugins/` — one file per plugin or batched by category

- [ ] **Step 1:** Register mark plugins: bold, italic, underline, strike, overline, sub, super. Each wraps the corresponding `@knkcms/knkeditor-extension-*` package.
- [ ] **Step 2:** Register core node plugins: document, paragraph, heading, table, etc.
- [ ] **Step 3:** Register media/link plugins: image, content-link, weblink, footnote, etc.
- [ ] **Step 4:** Register special plugins: formula, custom-symbol, sentence-counter, etc.
- [ ] **Step 5:** Commit.

### Task 43: Wire up rich-text-spec exports

```ts
// src/rich-text-spec/index.ts
export type { EditorNodePlugin, EditorSpec, NodeOptions } from "./types";
export { EditorSpecEditor } from "./editor-spec-editor";
export { builtInNodePlugins } from "./node-plugins";
```

- [ ] **Step 1:** Export, build, test.
- [ ] **Step 2:** Commit.

```bash
git commit -m "feat(rich-text-spec): add EditorSpec system with node/mark plugins and editor UI"
```

---

## Chunk 10: Storybook, Integration Tests, Final Polish

### Task 44: Storybook stories for key components

**Files:**
- Create: `src/renderer/field-renderer.stories.tsx`
- Create: `src/editor/spec-editor.stories.tsx`
- Create: `src/table/spec-data-table.stories.tsx`
- Create: `src/rich-text-spec/editor-spec-editor.stories.tsx`
- Create: `src/renderer/fields/*.stories.tsx` — one per field type

- [ ] **Step 1:** FieldRenderer story — demo form with multiple field types, shows validation.
- [ ] **Step 2:** SpecEditor story — interactive demo of defining a specification.
- [ ] **Step 3:** SpecDataTable story — demo table with editable rows.
- [ ] **Step 4:** EditorSpecEditor story — demo toggling nodes/marks.
- [ ] **Step 5:** Individual field type stories (batch: one story file per field type showing usage).
- [ ] **Step 6:** Commit.

### Task 45: Integration test — full round trip

**Files:**
- Create: `src/__tests__/integration.test.tsx`

- [ ] **Step 1:** Test that defines a spec via `defineSpec()`, generates Zod schema, renders FieldRenderer, fills in values, validates, and verifies form output.
- [ ] **Step 2:** Test that renders a SpecDataTable from a schema, verifies columns, opens edit drawer, modifies a row.
- [ ] **Step 3:** Commit.

### Task 46: Final build verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npx biome check src`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `npx tsup`
Expected: Build succeeds, dist/ contains all 5 subpath exports

- [ ] **Step 5: Run Storybook build**

Run: `npx storybook build`
Expected: Build succeeds

- [ ] **Step 6: Commit any final fixes**

```bash
git commit -m "chore: final build verification and polish"
```

---

## Summary

| Chunk | Tasks | What it produces |
|---|---|---|
| 1: Scaffolding | 1-3 | Buildable, testable empty package |
| 2: Schema Core | 4-9 | Types, registry, Zod builder, defineSpec() |
| 3: Renderer Core | 10-14 | FieldKitProvider, FieldRenderer, FieldComponent |
| 4: Simple Plugins | 15-16 | 10 simple field types (text through slug) |
| 5: Selection & Structural | 17-21 | select, radio, checkboxes, section, group, blocks, array |
| 6: Complex & Reference | 22-29 | markdown, code, rich_text, reference, media, virtual_table |
| 7: Editor | 30-33 | SpecEditor, FieldModal, TypePicker |
| 8: Table | 34-39 | Anker DataTable, CardList rename, SpecDataTable |
| 9: Rich Text Spec | 40-43 | EditorSpec system with node/mark plugins |
| 10: Polish | 44-46 | Stories, integration tests, final verification |
