# CLAUDE.md

This file provides guidance to Claude Code when working with the @knkcs/fieldkit library.

## Project Overview

Fieldkit is a specification-driven field system for the knk software group. It provides components for defining field specifications, rendering forms from specifications, and displaying specification-driven data tables. It is designed to be used across all knkCMS microservices.

## Architecture

### Package Structure

Single npm package (`@knkcs/fieldkit`) with subpath exports organized in five layers:

1. **`/schema`** — Zero React dependency. Field types, plugin registry, Zod schema generation, `defineSpec()` builder API. Core types: `Field<T>`, `FieldConfig`, `FieldValidation`, `FieldTypePlugin`, `Schema`.
2. **`/editor`** — WYSIWYG specification editor. `SpecEditor` (draft session, Build/Preview modes, side config panel), `TypePicker`. Uses dnd-kit for reordering.
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
│   ├── partition-cards.ts # partitionTabByCards() — card layout groups within one tab
│   ├── validate-spec.ts # validateSpec() — maxPerSpec, accessor checks (recursive into group children), card-layout rule
│   ├── resolve-spec.ts  # resolveSpec() — expands fieldsets into a Resolved Spec (dedupes fetches, throws on cycles); specNeedsResolution() — internal, would it fetch anything?
│   ├── zod-builder.ts   # specToZodSchema(), getDefaultValues()
│   ├── locked-settings.ts # findLockedSetting() / restoreLockedSettings() — reading FieldConfig.locked_settings and honouring it on a write (ADR-0011)
│   ├── reference.ts     # The Reference value — id, pin, attributes, children — plus referenceTreeSchema and withPin (ADR-0008)
│   ├── reference-tree.ts # The tree model as pure functions: flatten/nest, projectDropDepth + projectInsertDepth (both answer with `adopted`), moveReferenceBranch, spliceReference, countReferences, and the fold rules (visibleReferenceRows, referenceAncestorKeys, foldsToReveal, initialReferenceFolds + the collapse threshold). Drag and fold maths live here, never in a component — two renderers draw this tree
│   ├── reference-find.ts # Find: which References in a tree match a typed query, ranked and capped, and the ancestor path placing each one. Matches client-side (ADR-0013) against both the name a row shows and the id behind it, case-insensitively and with diacritics folded (foldReferenceText — ß spelled out in its own right); one answer carries the list, the total and which of Find's three states (referenceFindState — matches, nothing, or names still arriving) the names behind it were in, so neither the count nor the empty line can claim a whole tree was searched when it was not; knows nothing about a dropdown
│   ├── reference-attributes.ts # Composes a Reference Field's Attribute Spec into each Reference's branch (ADR-0007's boundary)
│   ├── marker-convention.ts # Marker field-type conventions
│   ├── define-spec.ts   # defineSpec() API
│   ├── builders.ts      # text(), section(), … spec builders
│   └── field-types/     # Built-in field type plugin definitions
├── editor/              # WYSIWYG specification editor
│   ├── spec-editor.tsx  # Public shell: Build/Preview modes, Save/Discard, labels, insert handlers
│   ├── editor-toolbar.tsx # Unified toolbar row: + Card/+ Section, mode control, Discard/Save
│   ├── use-spec-draft.ts# Draft session (baseline = last committed content)
│   ├── draft-ops.ts     # Pure schema mutations (insert/move/duplicate/sections/createField)
│   ├── editor-canvas.tsx# Build-mode canvas: tabs, shells, dnd + overlay/live feedback, insertion boundaries
│   ├── use-spring-loaded-tab.ts # Pointer dwell before a hovered tab springs (0.12.0)
│   ├── resolve-drop-target.ts # Pure drop resolution — end handler + live feedback single source
│   ├── drag-previews.tsx# DragOverlay clones (shell interior / card header + field count)
│   ├── drop-indicator.tsx # Mid-drag insertion line (3px accent + end-dot)
│   ├── field-shell.tsx  # Per-field wrapper: persistent grip, selection, toolbar, inert content
│   ├── card-frame.tsx   # Card header-bar frame on the canvas (block drag, select)
│   ├── card-menu.tsx    # Card ⋯ menu (rename, delete-merge, delete-with-fields)
│   ├── field-config-panel.tsx  # Side panel: General/Validation/Type-settings tabs, accessor gate, drill-in
│   ├── panel-sections/  # Tab bodies (config/validation/settings) + system summary
│   ├── field-settings/  # Per-type settings editors + the controls they share (BlueprintPicker, CapInput, PinModePicker, setting-lock.tsx — the ADR-0011 lock every control honours)
│   ├── section-menu.tsx # Per-tab ⌄ menu (rename, move, delete, orientation)
│   ├── type-picker-popover.tsx  # ⊕ insertion popover (wraps TypePicker)
│   ├── type-picker.tsx
│   └── try-it-view.tsx  # Preview: resolveSpec() on the draft, then a real SpecForm on a scratch form
├── renderer/            # Field renderer
│   ├── field-renderer.tsx      # Flat field list (20px rhythm); used inside groups
│   ├── search-combobox.tsx     # SearchCombobox — the shared typeahead: listbox roles, keyboard model, window-capture Escape containment, opt-in "/" shortcut. Agnostic about what it lists; callers supply results and describe them
│   ├── spec-form/       # SpecForm: section tabs, field search, read mode, skeletons
│   │   └── tab-shell.tsx # useTabShell() + shared TabShell: state/DOM plumbing behind edit & read tabs, no RHF hooks
│   ├── field-component.tsx     # Plugin resolution + error boundary (identity-memoized)
│   ├── provider.tsx     # FieldKitProvider (plugins + adapters)
│   ├── adapters.ts      # Backend adapter interfaces
│   ├── hooks/
│   │   ├── use-resolved-content-names.ts # Names for every Reference in a tree, fetched in batches and merged; answers { names, nameState } so Find can tell "no match" from "not yet resolved" (ADR-0013)
│   │   └── batch-ids.ts # The batching rule as a pure function, plus the PROVISIONAL batch size — no Adapter is ever handed a whole tree's ids in one call
│   └── fields/          # Built-in field components
│       ├── reference-find.tsx        # Find over the shared SearchCombobox: the Field's control, since the Field owns the resolved names. Never claims "/"
│       └── reference-collapse-all.tsx # Collapse all — shared by both renderers, offered on exactly the trees that open folded
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
- **Composable Zod**: Each plugin provides `toZodType()`. `specToZodSchema()` composes them. Consumers can override. A container type gets an optional second argument that composes its own children (`ComposeChildrenSchema`, and `ComposeChildrenDefaults` for `defaultValue`) — that is how a Fieldset validates and seeds what it holds without the shared builder knowing its name.
- **Token-first styling**: Use anker's semantic tokens, not hardcoded colors.
- **Lucide icons only**: All icons from lucide-react.
- **displayName required**: All exported React components must have `displayName`.

## Patterns

### Adding a New Field Type Plugin

1. Create `src/schema/field-types/<name>.ts`:
   - Export a `FieldTypePlugin` with `id`, `name`, `description`, `icon` (Lucide), `category`, `toZodType()`, `defaultSettings`, and — when a safe one exists — `defaultValue` (function returning the value-level form default; see #38)
   - Define a `<Name>Settings` interface if the field has configurable settings (plus a `settingsComponent` for the editor's config panel)
   - Add tests in `src/schema/field-types/__tests__/<name>.test.ts`
2. Register the plugin in `src/schema/field-types/index.ts`
3. Create renderer component: `src/renderer/fields/<name>-field.tsx` and set it as the plugin's `fieldComponent`
   - Use anker form components for simple inputs; `Controller` for complex values (see `docs/react-hook-form-reference.md`)
   - Set `displayName` on the exported component
   - Add Storybook story (`.stories.tsx`) and MDX documentation (`.mdx`)
4. Create table cell: `src/table/cells/<name>-cell.tsx`, set it as the plugin's `cellComponent` (SpecForm's read mode renders through it too, unless the plugin declares a `readComponent`), and set `displayName`
5. Nothing to register for the table. `getCellForFieldType()` builds a map from the plugins it is given and resolves `cellComponent` off it at render time, falling back to string rendering where a plugin declares none — so a registered plugin already has its column. (This step used to say "register the cell in `src/table/get-cell-for-type.tsx`"; there has never been anything there to register.)
6. Only when reading wants more than a cell can give — a cell has neither adapter access nor async and one row of height — add a `readComponent` (`ReadProps`: `field`, `value`, and a `renderChild` that renders a child value the same way). `group`, `reference` and `single_reference` are the built-ins that do.

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

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `knkCS/fieldkit`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

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
- **`docs/dnd-kit-reference.md`** — Sensor config, sortable pattern, drag handle conventions. Read before modifying drag-and-drop anywhere: the editor canvas, or the renderer's Reference Tree.
- **`docs/knkeditor-reference.md`** — EditorSpec types, plugin ID alignment, planned integration contract. Read before modifying rich-text-spec or RichTextField.
- **`docs/anker-reference.md`** — ⚠️ Historical: written against anker 0.0.2. Superseded by CLAUDE-ANKER.md above; do not trust its API details.
