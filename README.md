# @knkcs/fieldkit

Specification-driven field system for defining, rendering, and tabulating structured data. Built on top of [@knkcs/anker](https://github.com/knkcs/anker) and designed for the knkCMS ecosystem.

## What is Fieldkit?

Fieldkit provides a unified system where a **specification** (a list of typed field definitions) drives three UI components:

1. **Specification Editor** — Drag-and-drop UI for defining fields (used by admins/key users)
2. **Field Renderer** — Renders interactive forms from a specification
3. **Data Table** — Renders tabular data from a specification, with edit capabilities

All three share a common **field type plugin system** — each field type provides its own editor settings, form input, table cell, and Zod validation fragment.

## Package Structure

Single npm package with five subpath exports:

```
@knkcs/fieldkit/schema           → Field types, registry, Zod generation, defineSpec()
@knkcs/fieldkit/editor           → Specification editor (drag-and-drop field definitions)
@knkcs/fieldkit/renderer         → Field renderer (forms from specifications)
@knkcs/fieldkit/table            → Spec-driven data table
@knkcs/fieldkit/rich-text-spec   → Rich text editor specification (node/mark configuration)
```

## Quick Start

```tsx
import { defineSpec, text, number, select } from "@knkcs/fieldkit/schema";
import { FieldKitProvider } from "@knkcs/fieldkit/renderer";
import { FieldRenderer } from "@knkcs/fieldkit/renderer";

// Define a specification
const spec = defineSpec([
  text("name", { required: true, placeholder: "Product name" }),
  number("price", { min: 0 }),
  select("category", { options: { electronics: "Electronics", clothing: "Clothing" } }),
]);

// Render a form
function ProductForm() {
  const form = useForm({
    defaultValues: spec.defaultValues,
    resolver: zodResolver(spec.zodSchema),
  });

  return (
    <FormProvider {...form}>
      <FieldKitProvider plugins={builtInFieldTypes}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldRenderer schema={spec.fields} />
          <button type="submit">Save</button>
        </form>
      </FieldKitProvider>
    </FormProvider>
  );
}
```

## Built-in Field Types (27)

| Category | Types |
|---|---|
| Text | `text`, `textarea`, `markdown`, `code`, `rich_text`, `color`, `email`, `url`, `slug` |
| Number | `number` |
| Date/Time | `date`, `time` |
| Selection | `select`, `radio`, `checkboxes` |
| Boolean | `boolean` |
| Structural | `section`, `card`, `group`, `fieldset`, `blocks`, `array`, `list` |
| Reference | `reference`, `single_reference`, `media`, `virtual_table` |

The catalogue is deliberately generic: a field type whose meaning is a
consumer's domain belongs to that consumer, not here (ADR-0002).

## Custom Field Types

Register custom field types as plugins:

```ts
const myPlugin: FieldTypePlugin = {
  id: "my_custom_field",
  name: "My Custom Field",
  description: "A custom field type",
  icon: Star,
  category: "text",
  fieldComponent: MyFieldComponent,
  cellComponent: MyCellComponent,
  toZodType: () => z.string(),
};
```

### Reference-shaped types

A domain type that *is* a reference tree does not need rebuilding — mint it
from the parts fieldkit exports (ADR-0010). `toc_reference` used to be a
built-in; it is now a few lines in the consumer that gives it meaning:

```ts
import { createReferencePlugin } from "@knkcs/fieldkit/schema";
import { BookOpen } from "lucide-react";

const tocReference = createReferencePlugin({
  id: "toc_reference",
  name: "TOC Reference",
  description: "The publication tree this content hangs in",
  icon: BookOpen,
  maxPerSpec: 1,              // one per blueprint
  availableIn: ["blueprint"],
});
```

The tree, the browse drawer, the count cell, the settings editor and the Zod
schema are fieldkit's own, so a consumer type cannot drift from `reference`.

> **Registering this is not a migration.** Fieldkit's old `toc_reference` stored
> a bare id string; the minted type stores a Reference Tree, so stored values
> must be converted (`"x"` → `[{ id: "x" }]`) or they fail validation and render
> empty. The old `always_latest` and `attributes` settings keys are gone too —
> `pin_mode: "none"` is what `always_latest` meant.

For a control of your own around the same tree, `ReferenceTree` is exported from
`@knkcs/fieldkit/renderer`. It renders and reorders rows and nothing else: give
it `rows` from `readReferenceTree(value)`, the `value` itself, an `onChange` that
writes the value back, and a `names` record keyed by content id — resolving those
names is yours to do, because only your adapter can. `readReferenceTree` and
`countReferences` (every reference at every level, what `max_items` caps) come
from `@knkcs/fieldkit/schema`.

## Tech Stack

- React 18+
- Chakra UI v3 (via @knkcs/anker)
- React Hook Form + Zod
- TanStack Table v8
- dnd-kit (specification editor)
- TipTap/ProseMirror (rich text, via @knkcms/knkeditor)

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages must follow the format:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

**Scopes:** `schema`, `editor`, `renderer`, `table`, `rich-text-spec`, or omit for cross-cutting changes.

**Examples:**
```
feat(schema): add email field type plugin
fix(renderer): handle conditional visibility for nested groups
docs: update README with quick start example
refactor(table): extract cell component lookup into utility
```

## Documentation

- [Design Specification](docs/specs/2026-03-10-knkcs-fieldkit-design.md)

## License

Proprietary - knk software group
