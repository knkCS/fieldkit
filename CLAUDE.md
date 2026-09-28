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

Beside the five layers, **`/publishing`** is the opt-in publishing package (ADR-0002, amended): `publishingFieldTypes` (`reference_filter`, `outline_tree`, `template_text` so far), which nothing registers — a Consumer opts in by adding them to the plugins it passes. Its Catalogue section ships as `/publishing/catalogue.json`.

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
│   ├── validate-spec.ts # validateSpec() — maxPerSpec, accessor checks incl. reserved `_` Accessors (recursive into children and every Spec a plugin names in `heldSpecs`: a Block Type's Fields, a Reference Spec), card-layout rule, duplicate Block Types, the Virtual Table Row Spec rule (ADR-0017), unknown Field Types and each type's settings against its `settingsSchema` (ADR-0018), the one Position check and `config.search` (ADR-0022), and a caller's optional `policy`. Every error carries a `/`-separated `path` shared with Go
│   ├── validate-settings.ts # validateSettings() — one Field's settings against a strict `settingsSchema` (`unknown_setting`, `invalid_setting`), Unset stripped first (ADR-0021); the path grammar
│   ├── resolve-spec.ts  # resolveSpec() — every Pin (read from the plugins' Catalogue `pins`, a key being a settings path where `*` is every list item) into the Resolved Spec envelope `{catalogue, vocabulary, fields, parts}` (ADR-0020): Blueprint Releases inlined as children — or, for a Pin inside a settings entry (a linked Reference Spec), as that entry's `spec` — opaque parts stored once; walks children and `heldSpecs`; fetches each Release once, rejects with ResolveSpecError on a cycle or past RESOLVE_CAPS; specPins() — Go's Pins; specNeedsResolution() — internal, would it fetch anything?
│   ├── catalogue-version.ts # CATALOGUE_VERSION — written into go/catalogue.json by scripts/catalogue.ts and stamped on every Resolved Spec
│   ├── vocabulary-version.ts # The Resolved Spec's `vocabulary`: the highest `minimumVocabularyVersion` among its Text Types, compared as knkeditor compares versions
│   ├── validate-value.ts # validateValue() — stored data against a Spec, as `{path, code}`, with Go's answers: each type's toZodType, plus Unset/`required`, `not_canonical` and the VALUE_CAPS (ADR-0021); `targetBlueprint` (ValueContext) says which Reference Spec a Reference follows
│   ├── unset.ts         # isUnset(), canonicalValue(), canonicalSpecSettings() — Unset is one state, stored as absent (ADR-0021)
│   ├── zod-builder.ts   # specToZodSchema() — its parsed output is canonical, Unset keys stripped — and getDefaultValues()
│   ├── locked-settings.ts # findLockedSetting() / restoreLockedSettings() — reading FieldConfig.locked_settings and honouring it on a write (ADR-0011)
│   ├── reference.ts     # The Reference value — _id, id, pin, values, children (ADR-0008, amended) — its settings (`blueprints` entries, `spec`, `pin_mode`), referenceSpecFor() (the one Reference Spec per target: embedded, or replaced by a linked one), normalizeReference() (legacy values on load), referenceTreeSchema and withPin
│   ├── reference-plugin.ts # What `reference`, `single_reference` and every createReferencePlugin type share: the settings schema, heldSpecs and settingsRules, the tree Zod array (tree-wide `_id`s, caps), mintIds, edges and records
│   ├── reference-tree.ts # The tree model as pure functions: flatten/nest, projectDropDepth + projectInsertDepth (both answer with `adopted`), moveReferenceBranch, spliceReference, countReferences, and the fold rules (visibleReferenceRows, referenceAncestorKeys, foldsToReveal, initialReferenceFolds + the collapse threshold). Drag and fold maths live here, never in a component — two renderers draw this tree
│   ├── reference-find.ts # Find: which References in a tree match a typed query, ranked and capped, and the ancestor path placing each one. Matches client-side (ADR-0013) against both the name a row shows and the id behind it, case-insensitively and with diacritics folded (foldReferenceText — ß spelled out in its own right); one answer carries the list, the total and which of Find's three states (referenceFindState — matches, nothing, or names still arriving) the names behind it were in, so neither the count nor the empty line can claim a whole tree was searched when it was not; knows nothing about a dropdown
│   ├── reference-spec.ts # Composes a Reference Spec into each Reference's `values` (ADR-0007's boundary); validateSpec walks it as the `reference_spec` Position
│   ├── blueprint-link.ts # linkedBlueprintId() — the Blueprint Release a Fieldset or a linked Virtual Table pins, read in ONE place so the validator, the resolver and the renderer cannot disagree; BLUEPRINT_PIN, the Catalogue's record of that key; pinnedRelease(), how every Pin setting is read
│   ├── block-types.ts   # blockTypeSpecs() / duplicateBlockTypes() — a Blocks Field's settings read as the Specs its Block Types hold, so validateSpec walks them without learning the settings' shape
│   ├── row-array.ts     # rowArrayZodType() — the Zod type shared by every Field holding an array of rows all shaped alike (group, virtual_table), plus the RowArrayCaps (min_items/max_items) both offer
│   ├── row-ids.ts       # Row `_id`s (ADR-0023): mintId(), rowIdSchema + RowZodArray (duplicate_id), mintMissingIds() — the normalisation SpecForm, EditDrawer and SpecDataTable share — copyRows() for paste/duplicate, and toIdPath(), Zod issue paths as `_id` paths. Each container mints through its plugin's `mintIds`
│   ├── virtual-table-row-spec.ts # ADR-0017's rule as a pure function: which of the two ways a Virtual Table declares its Row Spec (linked, embedded, both, neither) — shared by validateSpec and the renderer. What a Row Spec may hold is the `row` Position
│   ├── positions.ts     # ADR-0022: POSITIONS, CONSUMERS, DEFAULT_POSITIONS, positionsOf() / allowedInPosition() (enforced) and offeredToConsumer() (picker advice). Each plugin declares `positions`, `consumers` and, for a container, `childrenPosition` / `heldSpecs`
│   ├── search.ts        # SearchWeight — `config.search`'s values (off, A–D)
│   ├── content-walk.ts  # edges() / texts() / valueText() — a Content's data walked against its Resolved Spec, Go's Edges/Texts/ValueText: each Field read by its plugin's `text`/`edges`, containers — and a Reference's values — entered through their `records` (ADR-0007)
│   ├── value-text.ts    # The `text()` the types with text share (string, List, Array)
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
│   ├── field-settings/  # Per-type settings editors + the controls they share (BlueprintPicker, CapInput, PinModePicker, setting-lock.tsx — the ADR-0011 lock every control honours), and generic-settings-form.tsx — the form for a type with no settingsComponent, read from its settingsSchema by settings-schema-model.ts
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
├── publishing/          # The opt-in publishing package (@knkcs/fieldkit/publishing): publishingFieldTypes, one file per type in field-types/, and in fields/ the stopgap UI of a type no built-in component can stand in for (outline_tree's read-only node count and cell) — its Catalogue section is go/publishing/catalogue.json
└── rich-text-spec/      # Rich text editor specification
    ├── types.ts         # EditorSpec, EditorNodePlugin
    ├── editor-spec-editor.tsx
    └── node-plugins/    # Built-in node/mark plugin definitions
```

Beside `src/`, the data contract the Go services share (ADR-0018):

```
go/                      # Go module github.com/knkcs/fieldkit/go (package fieldkit)
├── catalogue.json       # THE Catalogue's core section — generated by scripts/catalogue.ts, committed; embedded here, shipped by npm as @knkcs/fieldkit/catalogue.json
├── extension.go         # Catalogue sections: TypeCode (a type's Settings/HeldSpecs/ChildrenPosition/Value/Edges/Text/Compare/Merge hooks, exported; `TypeEnv.ValidateFields` is the composer a section container hands its records to), NewCatalogue, Catalogue.With, and the lookups every operation goes through — built-in rules first, then the Catalogue's sections'
├── publishing/          # Package publishing — the opt-in publishing package: its own catalogue.json section (embedded), one file per type's TypeCode; Catalogue() and DefaultCatalogue() = fieldkit's With it. Nothing registers it
├── spec.go              # Spec/Field model, DecodeSpec (strict: an unmodelled property is an error)
├── validate.go          # ValidateSpec — unknown_field_type, settings errors, Positions, reserved `_` Accessors, config.search, a caller's Policy (WithPolicy); walks children and Block Types' Fields. ValidateResolvedSpec — the same on a Resolved Spec, so a linked part's Positions are checked
├── resolve.go           # Resolve (through a Fetcher port) and Pins — the Resolved Spec envelope, parts, the resolve_* codes and caps (ADR-0020)
├── positions.go         # The Position constants (ADR-0022) and the Catalogue lookup behind the Position check
├── cards.go             # The card-marker rule (loose_field_in_carded_tab), as TS's checkCardLayout
├── settings.go          # ValidateSettings — generic over the Catalogue's JSON Schemas
├── rules.go             # The per-type hooks for rules a schema cannot state (virtual_table's Row Spec and its children's `row` Position, blocks' Block Types in `block_type`, the Reference types' in reference.go); linkedBlueprint/pinReleases read Pins by the Catalogue's keys
├── reference.go         # reference/single_reference: settings rules (duplicate_blueprint), the Reference Specs held in settings, referenceSpecFor, node values (WithTargetBlueprints), edges and records
├── reference_compare.go # Compare/Merge of a Reference Tree per node by `_id`, parent (`_parent`) and position as fields; a Single Reference per field
├── values.go            # ValidateValue — Unset/required, not_canonical, the caps (items, bytes, depth), and validateFields, the composer a container hands its children to (ADR-0007)
├── value_containers.go  # group/virtual_table/blocks/fieldset value rules, the rows' `_id`s (missing_id, duplicate_id) and itemSegments — the `_id` path grammar (ADR-0023)
├── walk.go              # The walk Edges and Texts share: every Field with its value, containers entered through heldRecords (ADR-0007)
├── edges.go             # Edges — Content Graph edges {path, kind, target} (contenthub ADR 0009); one edgeRule per type that points at something (media, reference, single_reference, rich_text)
├── texts.go             # Texts and ValueText — plain text per Field with its search weight (contenthub ADR 0019); one textRule per type the Catalogue marks has_text
├── mint.go              # MintIDs — deterministic UUIDv5 `_id`s for importers, from a seed and each row's or node's place; nothing else mints
├── schemas.go           # SchemaFields — the versionkit adapter: Settings = the whole resolved Field + its pinned parts, Type = Comparer/Merger, versionkit's interfaces by shape, never imported (docs/compare-and-merge.md)
├── compare.go           # Compare/Merge composer (ADR-0023): whole values by equality; rows by `_id` (detail, per-child merge, `_order`), a Fieldset per child, Reference trees (reference_compare.go) — finerRuleFor is where rich_text plugs in
├── value_types.go       # One value rule per type, each the Go reading of that type's toZodType
├── rich_text.go         # rich_text delegated to knkeditor's Go module (github.com/knkcms/knkeditor/go, the module's one external dependency): validation (invalid_rich_text), edges, text, Compare/Merge, the Text Type read from the Resolved Spec's parts
└── url.go               # isURL — the success half of the WHATWG URL parser, as Zod's url() uses it (testdata/urls.json recorded from Node)
conformance/             # Shared fixtures, replayed by Vitest and go test — format in conformance/README.md
├── unreleased/<area>/*.json
└── <X.Y.Z>/             # A release's frozen fixtures + catalogue.json (+ catalogue.publishing.json) — never edited; only its valid cases bind (ADR-0019)
scripts/catalogue.ts     # Generates each Catalogue section — go/catalogue.json, go/publishing/catalogue.json — from its plugins' settingsSchema; --check fails when one is stale
scripts/lib/catalogue-sections.ts # The sections: their files and frozen names, judged together as one Catalogue with one version
scripts/catalogue-compat.ts # The Catalogue may only grow: compares it with the last release's frozen one
scripts/release.ts       # The release train (docs/releasing.md); prints tag commands, never pushes
scripts/verify-go.sh     # gofmt, go vet, go test (the performance budgets in go/budget_test.go included) and a short fuzz — the Go half of `npm run verify`
scripts/fuzz-go.sh       # Fuzzes every Go Fuzz target for a bounded time each (go/fuzz_test.go; seeds from the conformance fixtures); a failing input lands in go/testdata/fuzz/ as a regression case
```

The Catalogue lives inside `go/` because Go's `embed` cannot reach outside the
module; the npm package ships that same file, so there is no second copy.

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
   - Define a `<Name>Settings` interface if the field has configurable settings. A `settingsComponent` for the editor's config panel is optional: without one, the panel renders a form generated from the `settingsSchema` (strings, numbers, booleans, enums, lists of scalars, nested objects; anything else read-only)
   - Declare a strict Zod `settingsSchema` (every key optional — Unset is stripped before it is checked) and the `catalogue` facts (`since`, `hasText`, `pins`) — a type with `hasText` declares `text()` (and Go a `textRule`), a type whose value points at something `edges()` (Go an `edgeRule`), a container `records()` (Go `heldRecords`), plus `consumers` (picker advice) and `positions` (enforced, ADR-0022 — list `row` or `reference_spec` only for a flat value type fit for a cell or a drawer); then run `npm run catalogue` and commit `go/catalogue.json`. A type in the Catalogue is validated by Go too, so add conformance fixtures under `conformance/unreleased/` (ADR-0018)
   - Add tests in `src/schema/field-types/__tests__/<name>.test.ts`
2. Register the plugin in `src/schema/field-types/index.ts`
3. Create renderer component: `src/renderer/fields/<name>-field.tsx` and set it as the plugin's `fieldComponent`
   - Use anker form components for simple inputs; `Controller` for complex values (see `docs/react-hook-form-reference.md`)
   - Set `displayName` on the exported component
   - Add Storybook story (`.stories.tsx`) and MDX documentation (`.mdx`)
4. Create table cell: `src/table/cells/<name>-cell.tsx`, set it as the plugin's `cellComponent` (SpecForm's read mode renders through it too, unless the plugin declares a `readComponent`), and set `displayName`
5. Nothing to register for the table. `getCellForFieldType()` builds a map from the plugins it is given and resolves `cellComponent` off it at render time, falling back to string rendering where a plugin declares none — so a registered plugin already has its column. (This step used to say "register the cell in `src/table/get-cell-for-type.tsx`"; there has never been anything there to register.)
6. Only when reading wants more than a cell can give — a cell has neither adapter access nor async and one row of height — add a `readComponent` (`ReadProps`: `field`, `value`, and a `renderChild` that renders a child value the same way). `group`, `reference` and `single_reference` are the built-ins that do.

A **publishing type** (ADR-0002, amended) follows the same steps with other homes: the plugin in `src/publishing/field-types/<name>.ts`, listed in `publishingFieldTypes` (`src/publishing/index.ts`) and never in `builtInFieldTypes`; `npm run catalogue` writes it into `go/publishing/catalogue.json`; its Go half is a `fieldkit.TypeCode` in `go/publishing/<name>.go`, added to `code` in `go/publishing/publishing.go` (the Go values/edges/text/compare hooks all live on `TypeCode`, not in the root package's maps); its fixtures carry `"packages": ["publishing"]` (`conformance/README.md`). Its UI is optional until ported: reuse a built-in component, as `reference_filter` reuses the List's.

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

## Conventions

The org's shared ground is in [docs/conventions.md](./docs/conventions.md), with fieldkit's deviations marked **This repo**. These bind every change:

- **Conventional Commits, always**: `type(scope): subject`. Commit types decide the next version and the changelog; fieldkit has no `release-please` yet, so a person reads them for a `chore(release)` commit and its `vX.Y.Z` + `go/vX.Y.Z` tags (`docs/releasing.md`; `publish-fieldkit.yml` publishes to npm) — a mislabelled commit still ships a wrong version. The shared commitlint workflow (`.github/workflows/commitlint.yml`) gates it once Actions run again; until then, review does.
  - **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
  - **Scopes:** `schema`, `editor`, `renderer`, `table`, `rich-text-spec`, or omit for cross-cutting changes
  - Keep the subject line under 72 characters, in the imperative mood ("add feature" not "added feature")
  - The API stays on 0.x and the data contract only grows (ADR-0019)
- **Reuse CI from [`knkCS/workflows`](https://github.com/knkCS/workflows).** Pin `@v1`, or a commit when you depend on a recently added input, because a reusable workflow *silently ignores* an input it doesn't declare. If CI needs something new, change it **there**, not here. fieldkit's own `ci.yml`, `publish-fieldkit.yml` and `storybook.yml` predate this and are a deviation, not a precedent.
- **The merge bar is `npm run verify`, run locally, while Actions is blocked** — see the local-gate paragraph under [Commands](#commands).
- **Reach for [`knkCS/commons`](https://github.com/knkCS/commons) first** in Go. Only `commons/fieldspec` overlaps fieldkit, and it stays in commons (ADR-0018).
- **UI follows anker.** Read `node_modules/@knkcs/anker/CLAUDE-ANKER.md` (see [Reference Docs](#reference-docs)) before any UI work. Semantic tokens, never hex; anker components before raw Chakra. See principle 8 in `docs/conventions.md`.

And the house style, in full in `docs/conventions.md`:
- a `CONTEXT.md` glossary with `_Avoid_` lines;
- numbered ADRs cited by number (`ADR-0014`), and contradicted only explicitly;
- comments that record *why* rather than *what*;
- a data contract that only grows, fieldkit's counterpart to survivable migrations (ADR-0019).

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
| `npm run verify` | **The local gate**: lint, typecheck, the Catalogue staleness and compatibility checks, build, verify-exports, the full test suite and the Go checks, as `ci.yml` runs them |
| `npm run catalogue` | Regenerate `go/catalogue.json` from the plugins' `settingsSchema`s |
| `npm run catalogue:check` | Fail when the committed Catalogue is stale |
| `npm run catalogue:compat` | Fail when the Catalogue breaks the last released one — it may only grow (ADR-0019); passes before the first release |
| `npm run release -- prepare <X.Y.Z[-rc.N]>` / `-- tags` | The release train (`docs/releasing.md`): prepare bumps the version and freezes a final release's fixtures; tags checks the release commit and **prints** the `vX.Y.Z` + `go/vX.Y.Z` tag-push commands — it never pushes |
| `npm run verify:go` | The Go module's checks: gofmt, `go vet`, `go test` — the performance budgets included — and every Fuzz target for 3s (`FIELDKIT_FUZZTIME`), all with `GOWORK=off`, so a workspace above the checkout cannot take the module over |
| `npm run verify:full` | `npm run verify` with 60s of fuzzing per Go Fuzz target: run before a release (`docs/releasing.md`) and before landing a change to the fuzz targets, the budgets or what they cover |
| `npm run test:gate` | The full suite as the gate runs it: 30s per test and one retry |

Always run `npm run typecheck` and `npm run lint` before committing.

**The merge bar is `npm run verify`, run locally, while GitHub Actions is blocked.** The org's Actions are blocked by a billing issue, so a PR's checks stay pending for ever and are **not** a gate. A PR merges only when `npm run verify` is green **at the merge commit**: when the base has moved, merge it into the branch first and run the gate again. `npm run verify` runs the Go module's checks too (`verify:go`), so it stays one command; it needs the Go toolchain `go/go.mod` names. Workflow files are still committed, so the gate moves back to CI the moment Actions run again; update this paragraph then. The gate's suite allows 30s per test and retries a failure once (`test:gate`), because the jsdom suite is load-sensitive: on a busy machine, or with several auto-implement lanes each running it, 5–10 different tests time out per run at the default 5s. A real failure fails twice; a test that only passes on retry is still worth a look. A fresh worktree or checkout runs `npm ci` first, because `node_modules` is not shared and a stale install fails typecheck against the lockfile's anker.

Tests use Vitest with jsdom environment and `@testing-library/react`. Test files are colocated with source in `__tests__/` directories.

## Peer Dependencies

Consuming projects must install:
- `@knkcs/anker` ^5.4.0
- `react` >= 19, `react-dom` >= 19
- `@chakra-ui/react` ^3.0.0
- `react-hook-form` ^7.0.0, `@hookform/resolvers` ^3.0.0, `zod` ^3.0.0
- `@tanstack/react-table` ^8.0.0
- `@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^8.0.0, `@dnd-kit/utilities` ^3.2.2 —
  fieldkit imports all three itself, and since anker 5.4.0 anker declares them
  as peers too, at these same floors
- `react-router-dom` ^6.0.0 || ^7.0.0

Optional:
- `@knkcms/knkeditor-editor` (for rich_text field type)

Note: `react-grid-layout` is NOT needed — since anker 3.0.0 it is only
resolved by consumers importing `@knkcs/anker/dashboard`.

Note: the `@knkcs/anker` **devDependency equals the peer floor** (`^5.4.0`
both). fieldkit compiles against the oldest anker it promises, so that using
newer-only API fails typecheck here rather than at runtime in a consumer. The
range used to span three majors with the devDependency pinned to the lowest
defensible leg; it narrowed to one major when the `lookup` field type took a
hard dependency on `LookupSelect`, which first ships in anker 5.1.0
(`docs/adr/0015-lookup-is-generic-and-keyed-by-source.md`). `single_reference`
renders through that same atom now
(`docs/adr/0016-one-async-select-and-the-staleness-it-costs.md`), so the floor
holds even if `lookup` were ever dropped — two field types depend on it, not
one. It moved on again to `^5.4.0` when the Virtual Table took `DataTable`'s
`onRowReorder`, which first ships in anker 5.4.0 — both legs moved together and
stayed equal, which is the rule, not an exception to it. Read
`docs/adr/0014-compile-against-the-oldest-anker-we-promise.md` before raising
either — the rule is unchanged, and raising the devDependency past the peer
floor is still the mistake it warns about.

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
