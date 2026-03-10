# @knkcs/fieldkit — Design Specification

## Overview

`@knkcs/fieldkit` is a single npm package that provides a specification-driven field system for defining, rendering, and tabulating structured data. It extracts and redesigns the SpecificationEditor, FieldRenderer, and DataTable components from the knkCMS Core monolith into a reusable library.

Fieldkit is built on top of `@knkcs/anker` (the shared UI kit) and uses React Hook Form + Zod for form state and validation.

## Package Structure

Single npm package with five subpath exports:

```
@knkcs/fieldkit/schema           → Field types, registry, Zod generation, defineSpec()
@knkcs/fieldkit/editor           → Specification editor (drag-and-drop field definitions)
@knkcs/fieldkit/renderer         → Field renderer (forms from specifications)
@knkcs/fieldkit/table            → Spec-driven data table
@knkcs/fieldkit/rich-text-spec   → Rich text editor specification (node/mark configuration)
```

### Dependencies

**Peer dependencies:**
- `@knkcs/anker` — UI kit (theme, primitives, atoms, forms, components, feedback)
- `react`, `react-dom` >= 18
- `@chakra-ui/react` ^3.0.0
- `react-hook-form` ^7.0.0, `@hookform/resolvers` ^3.0.0, `zod` ^3.0.0
- `@tanstack/react-table` ^8.0.0
- `@dnd-kit/core`, `@dnd-kit/sortable` (for editor)

**Optional peer dependencies:**
- `@knkcms/knkeditor-editor` — TipTap-based rich text editor (for rich_text field type)

## Design Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Specification concept | Unified schema | One `Field` type for all contexts (blueprints, tasks, frontend-only forms). Contexts register which field types are available. |
| 2 | Form integration | External FormProvider | Consumers own `useForm()` and wrap with `FormProvider`. FieldRenderer uses `useFormContext()`. Matches anker's existing RHF pattern. |
| 3 | Zod generation | Composable building blocks | Each field type plugin registers `toZodType()`. A utility composes them into a full Zod object schema. Consumers can override individual field validations. |
| 4 | Server components | Client-only | Vite + Module Federation stack doesn't support RSC. FieldRenderer is inherently interactive. Lazy-loading via intersection observer handles performance. |
| 5 | Collaboration | Out of scope | Separate concern for a future library. FieldRenderer accepts controlled values and emits changes via RHF — sufficient for a collaboration layer to wrap. |
| 6 | Repository structure | Single package with subpath exports | Simpler DX, automatic version sync, easy refactoring. Can split into separate packages later if needed. |
| 7 | Custom field types | Plugin objects | One `FieldTypePlugin` interface provides metadata, components (settings, field, cell), and Zod fragment. Single registration point via `FieldKitProvider`. |
| 8 | DataTable coupling | Layered | Anker provides a generic TanStack-based `DataTable`. Fieldkit's `SpecDataTable` extends it with spec-driven columns, field-type cells, and edit drawer. |
| 9 | Backend-dependent fields | Adapter pattern | Fieldkit ships all UI. Consumers inject data adapters (reference search, media upload, blueprint fetch, etc.) via `FieldKitProvider`. |
| 10 | Frontend-only DX | Builder API + plain objects | `defineSpec()` sugar produces `Field[]`. Developers can use either the builder or raw objects. |
| 11 | Rich text configuration | Fieldkit specification | TextType concept moves into fieldkit as `EditorSpec`. Node/mark plugins register like field type plugins. Replaces backend-only TextType management. |
| 12 | Group vs Blocks | Both | `group` = repeating set of same fields. `blocks` = pick from multiple block templates. Different use cases. |

## Schema Layer (`@knkcs/fieldkit/schema`)

Zero React dependency. Contains all types, the plugin registry, and Zod schema generation.

> **Backend migration note:** The `FieldConfig` extensions (`default_value`, `unique`, `localizable`, `hidden`, `read_only`, `condition`) and the new `FieldValidation` property are **new fields** not present in the current Go `FieldConfig` and `Field` structs. Implementing these requires:
> 1. Adding the new fields to the Go structs in `pkg/model/field.go`
> 2. A database migration to store the new config/validation properties
> 3. API schema updates (OpenAPI spec + Orval regeneration)
>
> Until the backend is updated, these fields are frontend-only (used by the builder API and frontend-only forms). The `Field[]` JSON from the backend will simply omit them, and fieldkit treats missing values as defaults (no condition, not hidden, not read-only, etc.).

### Core Types

```ts
interface FieldConfig {
  name: string;                    // Display name
  api_accessor: string;            // Unique API identifier
  required: boolean;               // Field is required
  instructions: string;            // Help text for editors
  default_value?: unknown;         // Pre-fill on creation
  unique?: boolean;                // Uniqueness constraint
  localizable?: boolean;           // Per-field localization flag
  hidden?: boolean;                // Stored but not shown in UI
  read_only?: boolean;             // Permanently read-only in schema
  condition?: FieldCondition;      // Conditional visibility
}

interface FieldCondition {
  field: string;                   // api_accessor of the controlling field
  operator: "eq" | "neq" | "in" | "not_in" | "exists";
  value: unknown;                  // Value to compare against
}

interface FieldValidation {
  min_length?: number;             // Text min character count
  max_length?: number;             // Text max character count
  pattern?: string;                // Regex pattern
  pattern_message?: string;        // Custom error for pattern failure
}

interface Field<T = unknown> {
  field_type: string;              // Plugin ID
  config: FieldConfig;             // Base configuration
  validation?: FieldValidation;    // Validation rules (separated from settings)
  settings?: T | null;             // Type-specific settings
  children?: Field[] | null;       // Nested fields (group, blocks, section)
  system: boolean;                 // System field flag
}

type Schema = Field[];
```

### FieldTypePlugin Interface

```ts
interface FieldTypePlugin<S = unknown> {
  id: string;                      // Unique identifier (e.g., "text", "select")
  name: string;                    // Display name
  description: string;             // Short description for type picker
  icon: LucideIcon;                // Icon for type picker and editor
  category: "text" | "number" | "date" | "selection" | "boolean"
           | "structural" | "reference" | "media";

  // React components (lazy loaded)
  settingsComponent?: ComponentType<SettingsProps<S>>;   // For spec editor
  fieldComponent: ComponentType<FieldProps<S>>;          // For field renderer
  cellComponent?: ComponentType<CellProps<S>>;           // For data table

  // Zod schema fragment
  toZodType: (field: Field<S>) => ZodTypeAny;

  // Defaults
  defaultSettings?: S;

  // Constraints
  maxPerSpec?: number;             // e.g., toc_reference: 1
  availableIn?: ("blueprint" | "task" | "form")[];
}
```

### Builder API

```ts
import { defineSpec, text, number, select, section } from "@knkcs/fieldkit/schema";

const productForm = defineSpec([
  section("Basic Info", [
    text("name", { required: true, placeholder: "Product name" }),
    number("price", { min: 0, prepend: "$" }),
    select("category", {
      options: { electronics: "Electronics", clothing: "Clothing" },
    }),
  ]),
]);

// productForm.fields   → Field[]
// productForm.zodSchema → z.object({ name: z.string().min(1), ... })
// productForm.defaultValues → { name: "", price: 0, category: "" }
```

The builder API is sugar — it produces the same `Field[]` that the backend returns. Developers can use either the builder or raw `Field[]` objects.

### Zod Schema Generation

Each plugin registers a `toZodType()` method. The `specToZodSchema()` utility composes them:

```ts
import { specToZodSchema } from "@knkcs/fieldkit/schema";

const zodSchema = specToZodSchema(fields, plugins);
// Returns z.object({ [api_accessor]: pluginZodType, ... })

// Usage with React Hook Form:
const form = useForm({
  resolver: zodResolver(zodSchema),
  defaultValues: getDefaultValues(fields),
});
```

Consumers can override individual field validations:

```ts
const zodSchema = specToZodSchema(fields, plugins, {
  overrides: {
    email: (base) => base.refine(checkEmailUnique, "Email already exists"),
  },
});
```

## Editor Layer (`@knkcs/fieldkit/editor`)

Drag-and-drop specification editor for defining fields. Used by admins and technically-minded key users.

### Components

- **`SpecEditor`** — Main component. Renders the field list with drag-and-drop reordering (dnd-kit). Provides a type picker to add fields. Supports context-based filtering of available field types.
- **`FieldModal`** — Modal for editing a single field. Three tabs: General (name, api_accessor, required, instructions, default value, hidden, read-only, condition), Validation (min/max length, regex, unique), Settings (type-specific, rendered from plugin's `settingsComponent`).
- **`TypePicker`** — Grid of available field types grouped by category, with icon, name, and description. Filterable.

### API

```tsx
<SpecEditor
  fields={fields}                    // Field[] — controlled
  onChange={(fields) => ...}         // Callback on change
  availableIn="blueprint"            // Filter field types by context
  plugins={plugins}                  // Optional additional plugins
  readOnly={false}                   // Disable editing
/>
```

### Key Behaviors

- Drag-and-drop reordering via dnd-kit
- Auto-generates `api_accessor` from display name (slugified)
- Validates `api_accessor` uniqueness within the specification
- `section` fields create visual groups with nested fields
- `group` fields show nested children editor with add/remove
- `blocks` field shows a sub-editor for defining block templates
- `toc_reference` enforced to max 1 per spec via plugin's `maxPerSpec`
- Field types filtered by `availableIn` context

## Renderer Layer (`@knkcs/fieldkit/renderer`)

Renders interactive forms from a specification. Consumes an external React Hook Form `FormProvider`.

### Components

- **`FieldRenderer`** — Main component. Takes `Field[]` schema and renders each field. Detects `section` fields to create tabbed layout. Uses `useFormContext()` from external `FormProvider`.
- **`FieldComponent`** — Renders a single field. Looks up plugin by `field_type`, renders `fieldComponent`. Handles conditional visibility by watching the controlling field via RHF `watch()`. Lazy-loads via intersection observer.
- **`FieldKitProvider`** — Context provider holding registered plugins and data adapters. Wraps the app or a section of it. Exported from `@knkcs/fieldkit/renderer` (not `/schema`, since it is a React component).

### API

```tsx
// Editable form — needs FormProvider
const form = useForm({
  defaultValues: spec.defaultValues,
  resolver: zodResolver(spec.zodSchema),
});

<FormProvider {...form}>
  <FieldKitProvider plugins={allPlugins} adapters={adapters}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldRenderer
        schema={fields}
        readOnly={false}
        loading={false}
      />
    </form>
  </FieldKitProvider>
</FormProvider>

// Read-only display — no form needed
<FieldKitProvider plugins={allPlugins}>
  <FieldRenderer schema={fields} values={data} readOnly />
</FieldKitProvider>
```

### Data Adapters

```ts
interface FieldKitAdapters {
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
    getEditorSpec: (id: string) => Promise<EditorSpec>;
    getGlobalSettings: () => Promise<EditorSpecGlobalSettings>;
    listEditorSpecs: () => Promise<EditorSpec[]>;
  };
}
```

### Key Behaviors

- Each field uses RHF `Controller` or `useFormContext()` — no Formik
- `section` fields trigger tabbed UI
- `group` fields render nested children with "Add item" button + drag-to-reorder
- `blocks` fields show block type picker + render each block's fields
- `hidden` fields are not rendered but values are preserved in the form
- `read_only` fields render as disabled/display-only
- `condition` fields watch the controlling field and mount/unmount reactively
- Zod validation via resolver — field-level errors display inline
- Read-only mode renders display components; accepts `values` prop directly (no fake form provider needed)
- Lazy loading via intersection observer for performance

## Table Layer (`@knkcs/fieldkit/table`)

Spec-driven data table. Built as a layer on top of anker's generic `DataTable`.

### Layering

```
Anker:    DataTable       → Generic TanStack Table wrapper (pagination, sorting, selection)
Fieldkit: SpecDataTable   → Extends DataTable with spec-driven columns, cells, edit drawer
```

### Anker's DataTable (base layer — new component)

```tsx
<DataTable
  data={rows}
  columns={columns}                 // TanStack ColumnDef[]
  pageCount={10}
  pageSize={25}
  onPageChange={(page) => ...}
  sorting={sorting}
  onSortingChange={setSorting}
  rowSelection={selection}
  onRowSelectionChange={setSelection}
  onRowClick={(row) => ...}
  loading={false}
  searchable={false}
  emptyState={<EmptyState />}
/>
```

Generic TanStack Table wrapper. No field type awareness. Lives in `@knkcs/anker/components`.

Anker's existing `Table` component is renamed to `CardList` (it's a CSS Grid-based card list, not a data table).

### Fieldkit's SpecDataTable

```tsx
<SpecDataTable
  schema={fields}                   // Field[] — drives column generation
  data={rows}
  onRowCreate={(values) => ...}
  onRowUpdate={(id, values) => ...}
  onRowDelete={(id) => ...}
  editable={true}
  additionalColumns={[...]}         // Extra columns beyond spec
  columnOverrides={{ name: ... }}   // Override specific cell rendering
  // All DataTable props passed through
  pageCount={10}
  onPageChange={...}
  sorting={...}
  onSortingChange={...}
/>
```

### How It Works

1. Takes `Field[]` schema and auto-generates `ColumnDef[]` via `getCellForFieldType()`
2. Each plugin's `cellComponent` is used as the column's cell renderer
3. Row editing opens an `EditDrawer` containing a `FieldRenderer` with the same schema
4. Row creation opens the same drawer with empty default values
5. Zod validation applies in the edit drawer

### Cell Display Per Field Type

| Field Type | Cell Display |
|---|---|
| `text`, `textarea`, `email`, `url`, `slug` | Truncated text |
| `number` | Formatted number |
| `boolean` | Toggle icon |
| `date`, `time` | Formatted date/time |
| `color` | Color circle |
| `select`, `radio` | Badge with label |
| `checkboxes` | Comma-separated badges |
| `markdown`, `rich_text`, `code` | Truncated plain text preview |
| `reference` | Linked item name(s) |
| `media` | Thumbnail or file icon |
| `group` | Item count (e.g., "3 items") |
| `blocks` | Block count + type summary |
| `array` | Item count |
| `virtual_table` | Row count |
| `section` | Not rendered as column |

## Rich Text Spec Layer (`@knkcs/fieldkit/rich-text-spec`)

Editor specification system for configuring which TipTap nodes and marks are available in the `rich_text` field type. Replaces the backend-only TextType management from core.

### EditorNodePlugin Interface

```ts
interface EditorNodePlugin {
  id: string;                          // "bold", "heading", "table"
  name: string;                        // "Bold", "Heading", "Table"
  type: "node" | "mark";
  category: "formatting" | "structure" | "media" | "reference" | "special";
  icon: LucideIcon;

  // TipTap extension factory
  createExtension: (options: NodeOptions) => TipTapExtension;

  // Configuration fields (reuses fieldkit's own Field system)
  settingsSpec?: Field[];              // e.g., html_attributes, content_schema, excluded_marks
  defaultSettings?: NodeOptions;

  // Constraints
  required?: boolean;                  // e.g., paragraph is always required
}
```

### EditorSpec Schema

```ts
interface EditorSpec {
  id: string;
  name: string;                        // e.g., "Standard Text", "Legal Text"
  description?: string;
  page_width?: number;                 // mm
  nodes: Record<string, NodeOptions>;  // Enabled nodes + config
  marks: Record<string, NodeOptions>;  // Enabled marks + config
}

type NodeOptions = Record<string, unknown>;
```

### Components

- **`EditorSpecEditor`** — UI for toggling nodes/marks on/off and configuring their options. Groups by category. Each node's settings rendered via fieldkit's own `FieldRenderer` using the plugin's `settingsSpec`.

### Usage in rich_text Field

```ts
// Backend-driven: reference a stored EditorSpec
rich_text("content", { editor_spec: "standard-text-id" })

// Frontend-only: inline EditorSpec
rich_text("content", {
  editor_spec: {
    nodes: { paragraph: {}, heading: {}, table: {} },
    marks: { bold: {}, italic: {} },
  },
})
```

### Available Nodes and Marks (from knkeditor)

**Marks (7):** bold, italic, underline, strike, overline, sub, super

**Core Nodes:** document, paragraph, paragraph-number, paragraph-content, text-wrapper, heading

**Structure:** details (collapsible), description-list, quotation, table (+ row/header/cell), horizontal-line, hard-break, trailing-node

**Content Links:** content-link, weblink, internal-link, footnote, inline-detail

**Media:** image, image-wrapper, image-header, image-caption, inline-image

**Special:** custom-symbol, formula, sentence-counter, semantic-mark, listbreak, gap-cursor, invisible-characters, text-align, undo-redo, unique-id, placeholder

**Total: 43 extension packages** from `@knkcms/knkeditor-extension-*`.

The knkeditor package (`@knkcms/knkeditor-editor`) remains a separate optional peer dependency. Fieldkit orchestrates the configuration; knkeditor provides the TipTap extensions.

## v1 Field Types (25 total)

### Text Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Text | `text` | placeholder, prepend, append | No |
| Textarea | `textarea` | placeholder | No |
| Markdown | `markdown` | — | No |
| Code | `code` | language (required) | No |
| Rich Text | `rich_text` | editor_spec (ID or inline), view_mode | No |
| Color | `color` | — | No |
| Email | `email` | placeholder | **New** |
| URL | `url` | placeholder | **New** |
| Slug | `slug` | source_field, separator | **New** |

### Number Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Number | `number` | min, max, step, prepend, append | No (enhanced) |

### Date Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Date | `date` | enable_range, min_date, max_date, validity_role | No |
| Time | `time` | — | No |

### Selection Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Select | `select` | options (key-value), multiple | No |
| Radio | `radio` | options (key-value) | No |
| Checkboxes | `checkboxes` | options (key-value) | No |

### Boolean Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Boolean | `boolean` | — | No |

### Structural Category

| Type | ID | Settings | New? |
|---|---|---|---|
| Section | `section` | render_card | No |
| Group | `group` | min_items, max_items | **New** (proper implementation) |
| Blocks | `blocks` | allowed_blocks (block type definitions) | **New** |
| Array | `array` | mode (dynamic/keyed), value_header, key_header, keys | No |

### Reference Category (adapter-dependent)

| Type | ID | Settings | New? |
|---|---|---|---|
| Reference | `reference` | blueprints, always_latest, max_items, max_depth, max_items_per_page, attributes | No |
| TOC Reference | `toc_reference` | (same as reference), maxPerSpec: 1 | No |
| Media | `media` | accept (mime types), max_items | No |
| Virtual Table | `virtual_table` | blueprint, always_latest, max_records_per_page | No |

### Deferred to Later

| Type | ID | Reason |
|---|---|---|
| List | `list` | Paginated list, low usage |
| Manipulation Tree | `manipulation_tree` | Very domain-specific to knkCMS content trees |

## Anker Changes

Two changes to `@knkcs/anker`:

1. **Add `DataTable`** — TanStack Table v8-based component in `/components`. Extracted and redesigned from core's existing `DataTable` (`web/src/components/data-table/data-table.tsx`). Provides pagination, sorting, row selection, search, loading state. No field type awareness. The anker version is a clean reimplementation with a controlled API (external sorting/pagination state).

2. **Rename `Table` to `CardList`** — The existing `Table`, `TableItem`, and `TableData` components are CSS Grid-based card lists, not data tables. Renaming the family to `CardList`, `CardListItem`, and `CardListData` clarifies the distinction. This is a breaking change for anker consumers — the migration path is a simple find-and-replace of import names.

## Consumer Integration

### Setup

```tsx
import { builtInFieldTypes } from "@knkcs/fieldkit/schema";
import { FieldKitProvider } from "@knkcs/fieldkit/renderer";
import { FieldRenderer } from "@knkcs/fieldkit/renderer";
import { SpecDataTable } from "@knkcs/fieldkit/table";
import { SpecEditor } from "@knkcs/fieldkit/editor";

const plugins = [...builtInFieldTypes, myCustomPlugin];

const adapters: FieldKitAdapters = {
  reference: {
    search: (blueprintIds, query) => api.searchContent(blueprintIds, query),
    fetch: (ids) => api.getContentByIds(ids),
  },
  media: {
    upload: (file) => api.uploadMedia(file),
    browse: (filter) => api.browseMedia(filter),
  },
  blueprint: {
    getSchema: (id) => api.getBlueprintSchema(id),
    getData: (id, query) => api.getBlueprintData(id, query),
  },
  textType: {
    getEditorSpec: (id) => api.getTextType(id),
    getGlobalSettings: () => api.getGlobalTextSettings(),
    listEditorSpecs: () => api.listTextTypes(),
  },
};

<FieldKitProvider plugins={plugins} adapters={adapters}>
  <App />
</FieldKitProvider>
```

### Custom Field Type Plugin

```ts
const taskGroupMembers: FieldTypePlugin = {
  id: "task_group_members",
  name: "Task Group Members",
  description: "Manage members of a task group",
  icon: Users,
  category: "reference",

  fieldComponent: TaskGroupMembersField,
  cellComponent: TaskGroupMembersCell,
  settingsComponent: TaskGroupMembersSettings,

  toZodType: () => z.array(z.string()),

  availableIn: ["task"],
};
```

### Frontend-Only Form

```tsx
import { defineSpec, text, number, select } from "@knkcs/fieldkit/schema";
import { FieldRenderer } from "@knkcs/fieldkit/renderer";

const spec = defineSpec([
  text("name", { required: true }),
  number("quantity", { min: 1 }),
  select("priority", { options: { low: "Low", medium: "Medium", high: "High" } }),
]);

function MyForm() {
  const form = useForm({
    defaultValues: spec.defaultValues,
    resolver: zodResolver(spec.zodSchema),
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldRenderer schema={spec.fields} />
        <button type="submit">Save</button>
      </form>
    </FormProvider>
  );
}
```
