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

## Patterns

### Adding a New Field Type Plugin

1. Create `src/schema/field-types/<name>.ts`:
   - Export a `FieldTypePlugin` with `id`, `name`, `icon` (Lucide), `toZodType()`, `defaultConfig`
   - Define a `<Name>Settings` interface if the field has configurable settings
   - Add tests in `src/schema/field-types/__tests__/<name>.test.ts`
2. Register the plugin in `src/schema/field-types/index.ts`
3. Create renderer component: `src/renderer/fields/<name>-field.tsx`
   - Use anker form components for simple inputs (see `docs/anker-reference.md`)
   - Use `Controller` for complex values (see `docs/react-hook-form-reference.md`)
   - Set `displayName` on the exported component
   - Add Storybook story (`.stories.tsx`) and MDX documentation (`.mdx`)
4. Create table cell: `src/table/cells/<name>-cell.tsx`
   - Set `displayName` on the exported component
5. Register the cell in `src/table/get-cell-for-type.tsx`
6. Register the renderer in `src/renderer/field-component.tsx`

### Adding a Renderer Field Component

- Prefer delegating to `@knkcs/anker/forms` components for simple inputs (Pattern A in `docs/react-hook-form-reference.md`)
- For complex values, use `Controller` from react-hook-form (Pattern B)
- Destructure the Controller render prop as `{ field: formField }` to avoid shadowing fieldkit's `field` prop
- Never call `useForm()` — always use `useFormContext()`
- Pass `readOnly` from `FieldProps`, not `disabled` (anker applies different opacity for each)
- Set `displayName` on every exported React component

### Adapter Pattern

Backend-dependent features (reference lookup, media upload, blueprint data, textType data) are injected through the `FieldKitProvider` `adapters` prop. Never import from service codebases — use the adapter interfaces defined in `src/renderer/adapters.ts`.

## Git Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages MUST follow the format:

```
<type>(<scope>): <description>
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
- **Scopes:** `schema`, `editor`, `renderer`, `table`, `rich-text-spec`, or omit for cross-cutting changes
- Keep the subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Storybook on localhost:6007 |
| `npm run build` | Build ESM + type declarations to `/dist` (via tsup) |
| `npm run build:storybook` | Build static Storybook site |
| `npm run lint` | Check linting and formatting (Biome) |
| `npm run lint:write` | Auto-fix lint and format issues |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run tests once (Vitest, jsdom environment) |
| `npm run test:watch` | Run tests in watch mode |

Always run `npm run typecheck` and `npm run lint` before committing. Tests use Vitest with jsdom environment and `@testing-library/react`. Test files are colocated with source in `__tests__/` directories.

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

## Reference Docs

Read these before working on the corresponding area:

- **`docs/anker-reference.md`** — All anker form component APIs, DataTable, DrawerRoot, semantic tokens. Read before creating or modifying any field component or table component.
- **`docs/react-hook-form-reference.md`** — The four integration patterns (delegation, Controller, watch+setValue, useFieldArray), nested paths, Zod wiring. Read before creating or modifying any field component.
- **`docs/dnd-kit-reference.md`** — Sensor config, sortable pattern, drag handle conventions. Read before modifying SpecEditor or adding drag-and-drop.
- **`docs/knkeditor-reference.md`** — EditorSpec types, plugin ID alignment, planned integration contract. Read before modifying rich-text-spec or RichTextField.
