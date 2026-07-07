# CLAUDE.md

This file provides guidance to Claude Code when working with the @knkcs/fieldkit library.

## Project Overview

Fieldkit is a specification-driven field system for the knk software group. It provides components for defining field specifications, rendering forms from specifications, and displaying specification-driven data tables. It is designed to be used across all knkCMS microservices.

## Architecture

### Package Structure

Single npm package (`@knkcs/fieldkit`) with subpath exports organized in five layers:

1. **`/schema`** — Zero React dependency. Field types, plugin registry, Zod schema generation, `defineSpec()` builder API. Core types: `Field<T>`, `FieldConfig`, `FieldValidation`, `FieldTypePlugin`, `Schema`.
2. **`/editor`** — WYSIWYG specification editor. `SpecEditor` (draft session, Build/Try-it modes, side config panel), `TypePicker`. Uses dnd-kit for reordering.
3. **`/renderer`** — Form renderer from specifications. `FieldRenderer`, `SpecForm` (section tabs, field search, read mode), `FieldComponent`, `FieldKitProvider`. Consumes external React Hook Form `FormProvider`.
4. **`/table`** — Spec-driven data table. `SpecDataTable` extends anker's `DataTable`. Auto-generates columns from spec. `EditDrawer` uses `SpecForm` for row editing.
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
├── schema/              # Zero-React layer
│   ├── types.ts         # Field, FieldConfig, FieldValidation, Schema
│   ├── plugin.ts        # FieldTypePlugin, FieldProps, CellProps, SettingsProps
│   ├── registry.ts      # Plugin registry
│   ├── partition.ts     # partitionSchemaBySections() — shared by SpecForm + editor
│   ├── validate-spec.ts # validateSpec() — maxPerSpec, accessor checks (recursive into group children)
│   ├── zod-builder.ts   # specToZodSchema(), getDefaultValues()
│   ├── define-spec.ts   # defineSpec() API
│   ├── builders.ts      # text(), section(), … spec builders
│   └── field-types/     # Built-in field type plugin definitions
├── editor/              # WYSIWYG specification editor
│   ├── spec-editor.tsx  # Public shell: header, Build/Try-it, Save/Discard, labels
│   ├── use-spec-draft.ts# Draft session (baseline = last committed content)
│   ├── draft-ops.ts     # Pure schema mutations (insert/move/duplicate/sections/createField)
│   ├── editor-canvas.tsx# Build-mode canvas: tabs, shells, dnd, insertion boundaries
│   ├── field-shell.tsx  # Per-field wrapper: selection, toolbar, inert content
│   ├── field-config-panel.tsx  # Side panel (live edits, accessor gate, group drill-in)
│   ├── panel-sections/  # Config / validation / type-settings panel sections
│   ├── section-menu.tsx # Per-tab ⌄ menu (rename, move, delete, orientation)
│   ├── type-picker-popover.tsx  # ⊕ insertion popover (wraps TypePicker)
│   ├── type-picker.tsx
│   └── try-it-view.tsx  # Real SpecForm on a scratch form
├── renderer/            # Field renderer
│   ├── field-renderer.tsx      # Flat field list (20px rhythm); used inside groups
│   ├── spec-form/       # SpecForm: section tabs, field search, read mode, skeletons
│   │   └── tab-shell.tsx # useTabShell() + shared TabShell: state/DOM plumbing behind edit & read tabs, no RHF hooks
│   ├── field-component.tsx     # Plugin resolution + error boundary (identity-memoized)
│   ├── provider.tsx     # FieldKitProvider (plugins + adapters)
│   ├── adapters.ts      # Backend adapter interfaces
│   └── fields/          # Built-in field components
├── table/               # Spec-driven data table
│   ├── spec-data-table.tsx
│   ├── edit-drawer.tsx  # Renders through SpecForm
│   ├── get-cell-for-type.tsx
│   └── cells/           # Built-in cell components
└── rich-text-spec/      # Rich text editor specification
    ├── types.ts         # EditorSpec, EditorNodePlugin
    ├── editor-spec-editor.tsx
    └── node-plugins/    # Built-in node/mark plugin definitions
```

Design decision records live in `docs/superpowers/specs/` (renderer redesign,
editor redesign, canvas insertion overlay) — consult them before revisiting
an architectural choice.

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
   - Export a `FieldTypePlugin` with `id`, `name`, `description`, `icon` (Lucide), `category`, `toZodType()`, `defaultSettings`
   - Define a `<Name>Settings` interface if the field has configurable settings (plus a `settingsComponent` for the editor's config panel)
   - Add tests in `src/schema/field-types/__tests__/<name>.test.ts`
2. Register the plugin in `src/schema/field-types/index.ts`
3. Create renderer component: `src/renderer/fields/<name>-field.tsx` and set it as the plugin's `fieldComponent`
   - Use anker form components for simple inputs; `Controller` for complex values (see `docs/react-hook-form-reference.md`)
   - Set `displayName` on the exported component
   - Add Storybook story (`.stories.tsx`) and MDX documentation (`.mdx`)
4. Create table cell: `src/table/cells/<name>-cell.tsx`, set it as the plugin's `cellComponent` (also used by SpecForm's read mode), and set `displayName`
5. Register the cell in `src/table/get-cell-for-type.tsx` (SpecDataTable column mapping)

There is no manual renderer registration: `FieldComponent` resolves `plugin.fieldComponent` through the registry at render time.

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
| `npm run verify-exports` | Check tsup entries match built `.d.ts` exports |

Always run `npm run typecheck` and `npm run lint` before committing. Tests use Vitest with jsdom environment and `@testing-library/react`. Test files are colocated with source in `__tests__/` directories.

## Peer Dependencies

Consuming projects must install:
- `@knkcs/anker` ^3.1.0 || ^4.0.0
- `react` >= 19, `react-dom` >= 19
- `@chakra-ui/react` ^3.0.0
- `react-hook-form` ^7.0.0, `@hookform/resolvers` ^3.0.0, `zod` ^3.0.0
- `@tanstack/react-table` ^8.0.0
- `@dnd-kit/core`, `@dnd-kit/sortable`
- `react-router-dom` ^6.0.0 || ^7.0.0

Optional:
- `@knkcms/knkeditor-editor` (for rich_text field type)

Note: `react-grid-layout` is NOT needed — since anker 3.0.0 it is only
resolved by consumers importing `@knkcs/anker/dashboard`.

## Related Repositories

- **@knkcs/anker** — Shared UI component library (peer dependency)
- **@knkcms/knkeditor** — TipTap-based rich text editor (optional peer dependency)
- **knkCMS Core** — Primary consumer; monolith being decomposed into microservices

## Reference Docs

Read these before working on the corresponding area:

- **`node_modules/@knkcs/anker/CLAUDE-ANKER.md`** — anker's AI-consumable design-system rules (tokens, templates, component catalog). The authoritative anker reference; ships in the anker tarball and tracks the installed version.
- **`src/renderer/spec-form/spec-form.mdx`** — SpecForm behavior contract (section tabs, search, read mode, labels, schema partitioning rules).
- **`src/editor/spec-editor.mdx`** — SpecEditor contract (draft model, schema-prop stability, labels table, migration notes, known limitations).
- **`docs/react-hook-form-reference.md`** — The four integration patterns (delegation, Controller, watch+setValue, useFieldArray), nested paths, Zod wiring. Read before creating or modifying any field component.
- **`docs/dnd-kit-reference.md`** — Sensor config, sortable pattern, drag handle conventions. Read before modifying editor drag-and-drop.
- **`docs/knkeditor-reference.md`** — EditorSpec types, plugin ID alignment, planned integration contract. Read before modifying rich-text-spec or RichTextField.
- **`docs/anker-reference.md`** — ⚠️ Historical: written against anker 0.0.2. Superseded by CLAUDE-ANKER.md above; do not trust its API details.
