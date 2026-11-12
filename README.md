# @knkcs/fieldkit

Specification-driven field system for defining, rendering, and tabulating structured data. Built on top of [@knkcs/anker](https://github.com/knkcs/anker) and designed for the knkCMS ecosystem.

## What is Fieldkit?

Fieldkit provides a unified system where a **specification** (a list of typed field definitions) drives three UI components:

1. **Specification Editor** — Drag-and-drop UI for defining fields (used by admins/key users)
2. **Field Renderer** — Renders interactive forms from a specification
3. **Data Table** — Renders tabular data from a specification, with edit capabilities

All three share a common **field type plugin system** — each field type provides its own editor settings, form input, table cell, and Zod validation fragment.

## Package Structure

Single npm package with these subpath exports:

```
@knkcs/fieldkit/schema           → Field types, registry, Zod generation, defineSpec()
@knkcs/fieldkit/editor           → Specification editor (drag-and-drop field definitions)
@knkcs/fieldkit/renderer         → Field renderer (forms from specifications)
@knkcs/fieldkit/table            → Spec-driven data table
@knkcs/fieldkit/publishing       → Opt-in: the publishing package's Field Types
@knkcs/fieldkit/rich-text        → Opt-in: the knkeditor-backed rich_text field (knkeditor peers) — docs/knkeditor-reference.md
@knkcs/fieldkit/rich-text-spec   → Deprecated (removed in 0.19): replaced by Text Types — docs/migration-0.18.md
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
  select("category", { options: [{ key: "electronics", label: "Electronics" }, { key: "clothing", label: "Clothing" }] }),
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

## Built-in Field Types (28)

| Category | Types |
|---|---|
| Text | `text`, `textarea`, `markdown`, `code`, `rich_text`, `color`, `email`, `url`, `slug` |
| Number | `number` |
| Date/Time | `date`, `time` |
| Selection | `select`, `radio`, `checkboxes`, `lookup` |
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
  consumers: ["blueprint"],   // offered in the blueprint picker only
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

### Large trees: Find and Reveal

A reference field holding thousands of references opens **folded** — its roots
only. Every non-empty tree, at any size, carries **Find**, **Expand all** and
**Collapse all** as icon buttons at the right end of its field's label row, and
the label counts its references ("Teile · 9"). Find opens into an input on a
click, or on `/` while the field has focus.

**Find** locates a reference the tree already holds, by the display name of the
content it points at. It is deliberately not called search: the reference
adapter's `search` is the *catalogue browse* the picker opens to add a content
you do not have yet, and one field having two searches would make both
ambiguous. Find matches in the browser over every resolved name at every level —
including inside folded branches — case-insensitively, with diacritics folded
(`muller` finds `Müller`) and against a reference's id as well as its name.
Typing **reveals** the first match in tree order, and a counter ("2 of 3") with
previous and next steps through every match, uncapped. A reveal opens every
fold above the match, scrolls it to centre and marks it, while focus stays in
the input. Reveals accumulate — unlike a spring, a reveal is
not a preview and does not fold back — which is what `Collapse all` is for.

Find never filters or reorders the tree. It changes only what is folded and where
you are looking, so dragging is never standing on ground that moved.

Names for the whole tree are resolved through your adapter's `fetch`, **in
batches** — so an adapter written against a twenty-reference field keeps working
at ten thousand without seeing a call it cannot serve. See
[ADR-0013](docs/adr/0013-find-matches-in-the-browser.md) for why matching happens
in the browser and what was rejected to get there.

Read mode folds and carries the same three controls.

### Linking a reference to its content

fieldkit does not know where a content lives in your application, so a
reference renders by its name, as text. Give the reference adapter an optional,
**synchronous** `hrefFor(id)` and every name it answers an address for renders
as a real link — in read mode, in the form's reference tree and beside a single
reference's select — so it opens in a new tab, can be copied and is announced as
a link ([ADR-0031](docs/adr/0031-a-reference-links-to-its-content-through-an-optional-adapter-hook.md)):

```ts
reference: {
  search, fetch,
  // The id is all fieldkit passes; which page it opens is yours to decide.
  hrefFor: (id) => `/contents/${id}`,
}
```

Without `hrefFor`, or for an id it answers nothing (`undefined`, `null` or `""`)
for, the name stays text exactly as before. It is asked once per rendered
reference, so it reads what you already hold — leave it out rather than make a
request. To intercept navigation, do it in your router, as for any other link.

### Blueprint and Text Type pickers

The settings that name a Blueprint or a Text Type Release — a Reference's
targets and linked Reference Specs, a Fieldset's Blueprint, a linked Virtual
Table's Row Spec, a `rich_text` Field's Text Type — are picked by **searching
your adapter**, never typed ([ADR-0027](docs/adr/0027-pickers-search-through-the-adapter-a-type-the-consumer-cannot-serve-is-hidden.md)):

```ts
blueprint: {
  getSchema, getData,
  // One page for the setting asking: purpose is "reference_target",
  // "fieldset" or "row_spec", so one adapter filters per setting.
  search: ({ query, cursor, purpose, signal }) => Promise<{ items: { id, name }[]; nextCursor? }>,
  // Names stored ids, archived ones included (`archived: true`).
  resolve: ({ ids, signal }) => Promise<{ id, name, archived? }[]>,
},
textType: { get, search, resolve }, // the same pair, without `purpose`
```

The picker is anker's `LookupSelect`: it debounces, pages as the menu scrolls,
and names what is stored, an archived choice marked. A failed search says so and
offers a retry, reported through `onError`. Without `search` the setting offers
no input and says the application has no source for it.

**A type you cannot serve is hidden.** Each Field Type declares the adapter
capabilities its settings and its value need (`requiresAdapters`): `reference`
and `single_reference` need `blueprint.search:reference_target` for their
targets and `reference.search` for their value, `fieldset` needs
`blueprint.search:fieldset`, `rich_text` needs `textType.search`, `media`
needs `media` (the `media` adapter's `upload`) and `lookup` needs `lookup` (at
least one Source on `adapters.lookup`). `SpecEditor`'s type picker offers a
type only when your `FieldKitProvider`'s adapters provide them, and a Virtual
Table offers its linked Row Spec only with `blueprint.search:row_spec` —
embedded otherwise. To offer these types, implement the adapters (`search`
and `resolve` on the picker ones); to hide them, implement nothing. An editor
whose Specs another application fills — blueprinthub, whose Specs contenthub
fills — declares the **value** capabilities that application provides instead,
`valuesFilledElsewhere: ["reference.search", "media"]` on its adapters (#433):
its pickers offer those types, and a field without an adapter of its own still
renders that it has no source, as in the editor's Try it. Settings
capabilities can't be declared this way. A `blueprint.search:<purpose>` capability holds when the adapter has
`search` and its optional `purposes` include that purpose — **absent means
every purpose**. A Consumer serving only some declares them: with
`purposes: ["reference_target"]` the reference types are offered with a
targets picker and an embedded Reference Spec but no linked one, `fieldset` is
hidden, and a Virtual Table offers an embedded Row Spec only (ADR-0027,
amended). Hiding never invalidates a stored Spec: a Field of a hidden
type that is already stored renders, validates and saves unchanged, and its
setting — or, for a type hidden by its value, its control — shows what is
stored with the note that this application has no source for it. `servedByAdapters(plugin, adapters)` (from `/schema`) answers the same
question for your own pickers.

## Tech Stack

- React 19+
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
