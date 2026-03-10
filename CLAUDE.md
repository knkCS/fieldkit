# CLAUDE.md

This file provides guidance to Claude Code when working with the @knkcs/fieldkit library.

## Project Overview

Fieldkit is a specification-driven field system for the knk software group. It provides components for defining field specifications, rendering forms from specifications, and displaying specification-driven data tables. It is designed to be used across all knkCMS microservices.

## Architecture

### Package Structure

Single npm package (`@knkcs/fieldkit`) with subpath exports organized in five layers:

1. **`/schema`** — Zero React dependency. Field types, plugin registry, Zod schema generation, `defineSpec()` builder API. Core types: `Field<T>`, `FieldConfig`, `FieldValidation`, `FieldTypePlugin`, `Schema`.
2. **`/editor`** — Drag-and-drop specification editor. `SpecEditor`, `FieldModal`, `TypePicker`. Uses dnd-kit for reordering.
3. **`/renderer`** — Form renderer from specifications. `FieldRenderer`, `FieldComponent`, `FieldKitProvider`. Consumes external React Hook Form `FormProvider`.
4. **`/table`** — Spec-driven data table. `SpecDataTable` extends anker's `DataTable`. Auto-generates columns from spec. `EditDrawer` uses `FieldRenderer` for row editing.
5. **`/rich-text-spec`** — Rich text editor specification. `EditorSpec`, `EditorNodePlugin`, `EditorSpecEditor`. Configures which TipTap nodes/marks are available.

### Key Technology Choices

| Concern | Choice |
|---------|--------|
| UI foundation | @knkcs/anker (Chakra UI v3) |
| Form state | React Hook Form (external FormProvider pattern) |
| Validation | Zod (auto-generated from specifications via `toZodType()`) |
| Table engine | TanStack Table v8 (via anker's DataTable base) |
| Drag-and-drop | dnd-kit |
| Rich text | TipTap/ProseMirror (via @knkcms/knkeditor, optional peer dep) |
| Build | tsup (ESM) |
| Icons | Lucide React |

### Directory Layout

```
src/
├── schema/              # Types, registry, Zod builder, defineSpec()
│   ├── types.ts         # Field, FieldConfig, FieldValidation, Schema
│   ├── registry.ts      # Plugin registry
│   ├── zod-builder.ts   # specToZodSchema()
│   ├── define-spec.ts   # Builder API
│   └── field-types/     # Built-in field type plugin definitions
├── editor/              # Specification editor
│   ├── spec-editor.tsx
│   ├── field-modal.tsx
│   └── type-picker.tsx
├── renderer/            # Field renderer
│   ├── field-renderer.tsx
│   ├── field-component.tsx
│   ├── provider.tsx     # FieldKitProvider
│   └── fields/          # Built-in field components
├── table/               # Spec-driven data table
│   ├── spec-data-table.tsx
│   ├── edit-drawer.tsx
│   ├── get-cell-for-type.ts
│   └── cells/           # Built-in cell components
└── rich-text-spec/      # Rich text editor specification
    ├── types.ts         # EditorSpec, EditorNodePlugin
    ├── editor-spec-editor.tsx
    └── node-plugins/    # Built-in node/mark plugin definitions
```

## Design Principles

- **No domain coupling**: Fieldkit must not import from any service codebase. Backend-dependent features use the adapter pattern.
- **Plugin-first**: All field types are plugins (`FieldTypePlugin`). Built-in types use the same plugin interface as custom types.
- **Specification-driven**: One `Field[]` schema drives all three UI components (editor, renderer, table).
- **External form ownership**: Consumers create and own the React Hook Form instance. Fieldkit uses `useFormContext()`.
- **Adapter pattern for backend**: Reference, media, blueprint, and textType data comes through injected adapters, not direct API calls.
- **Composable Zod**: Each plugin provides `toZodType()`. `specToZodSchema()` composes them. Consumers can override.
- **Token-first styling**: Use anker's semantic tokens, not hardcoded colors.
- **Lucide icons only**: All icons from lucide-react.
- **displayName required**: All exported React components must have `displayName`.

## Peer Dependencies

Consuming projects must install:
- `@knkcs/anker`
- `react` >= 18, `react-dom` >= 18
- `@chakra-ui/react` ^3.0.0
- `react-hook-form` ^7.0.0, `@hookform/resolvers` ^3.0.0, `zod` ^3.0.0
- `@tanstack/react-table` ^8.0.0
- `@dnd-kit/core`, `@dnd-kit/sortable`
- `react-router-dom` ^6.0.0

Optional:
- `@knkcms/knkeditor-editor` (for rich_text field type)

## Related Repositories

- **@knkcs/anker** — Shared UI component library (peer dependency)
- **@knkcms/knkeditor** — TipTap-based rich text editor (optional peer dependency)
- **knkCMS Core** — Primary consumer; monolith being decomposed into microservices
