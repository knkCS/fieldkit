# Per-Field Documentation Design

## Goal

Create developer-facing Storybook stories and MDX documentation for all 24 fieldkit field types. Each field type gets interactive examples (stories) and a prose reference page (MDX) covering settings, validation, Zod output, table cell behavior, and known limitations.

## Audience

Developers consuming `@knkcs/fieldkit` who need to understand how each field type works, what settings it supports, what it looks like, and what caveats to be aware of.

## Approach

Storybook stories (CSF3) for interactive demos + MDX docs for prose reference. Each field type gets two files. A shared story wrapper eliminates boilerplate.

## File Structure

```
src/renderer/fields/
├── __stories__/
│   └── field-story-wrapper.tsx        # Shared FormProvider + FieldKitProvider wrapper
├── text-field.stories.tsx             # Stories per field type
├── text-field.mdx                     # MDX docs per field type
├── textarea-field.stories.tsx
├── textarea-field.mdx
├── ... (24 × 2 = 48 files + 1 wrapper = 49 new files)
```

### Storybook Sidebar Structure

```
Fields/
  Text/         Docs (MDX) | Default | With Prepend Append | With Validation | Read Only
  Textarea/     Docs (MDX) | Default | Custom Rows | With Validation | Read Only
  Number/       ...
  Boolean/      ...
  Color/        ...
  Email/        ...
  URL/          ...
  Time/         ...
  Date/         ...
  Slug/         ...
  Select/       ...
  Radio/        ...
  Checkboxes/   ...
  Section/      ...
  Group/        ...
  Blocks/       ...
  Array/        ...
  Markdown/     ...
  Code/         ...
  Rich Text/    ...
  Reference/    ...
  TOC Reference/...
  Media/        ...
  Virtual Table/...
```

## Shared Story Wrapper

`src/renderer/fields/__stories__/field-story-wrapper.tsx`

Provides:
- `FormProvider` with `useForm` + `zodResolver` from the field spec
- `FieldKitProvider` with `builtInFieldTypes`
- `FieldRenderer` rendering the given fields
- Submit button + output panel showing form values after submit (documents the value shape)

Props:
- `fields: Field[]` — the field specs to render
- `defaultValues?: Record<string, unknown>` — pre-populated form values
- `readOnly?: boolean`
- `plugins?: FieldTypePlugin[]` — override plugins (default: `builtInFieldTypes`)
- `adapters?: FieldKitAdapters` — mock adapters for reference/media/blueprint fields

## MDX Template

Each field's MDX follows this structure:

```mdx
import { Meta, Canvas, Controls } from "@storybook/blocks";
import * as Stories from "./{type}-field.stories";

<Meta of={Stories} />

# {Field Name}

{One-line description}

## When to Use

When to pick this type vs alternatives.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| ... | ... | ... | ... |

## Validation

What validation options are available via `field.config` and `field.validation`.

## Zod Output

\`\`\`ts
// Required
z.string().min(1, "Field Name is required")

// Optional
z.string()
\`\`\`

## Table Cell

How the value displays in SpecDataTable.

## Known Limitations

- Limitation 1
- Limitation 2

## Examples

<Canvas of={Stories.Default} />
<Canvas of={Stories.WithValidation} />
```

## Per-Field Specifications

### 1. text

**Stories**: Default, WithPrependAppend, WithValidation (min/max/pattern), ReadOnly
**MDX sections**: Settings (placeholder, prepend, append), validation (required, min_length, max_length, pattern), Zod output
**Known Limitations**:
- No `maxLength` HTML attribute (Zod catches on submit, not during input)
- TextCell doesn't truncate (no `text-overflow: ellipsis`)

### 2. textarea

**Stories**: Default, CustomRows (8 rows), WithPlaceholder, WithMaxLength, ReadOnly
**MDX sections**: Settings (placeholder, rows), validation (required, min_length, max_length)
**Known Limitations**:
- No `pattern` validation (unlike text)
- No auto-resize / resize setting

### 3. number

**Stories**: Default, WithMinMax, WithStep, WithPrependAppend, ReadOnly, CellFormatting
**MDX sections**: Settings (min, max, step, prepend, append), validation (min, max from settings)
**Known Limitations**:
- `required` not checked in Zod schema
- `prepend`/`append` settings defined but not passed to component
- No integer vs decimal distinction
- `step` not validated in Zod (UI only)

### 4. boolean

**Stories**: DefaultOff, DefaultOn, WithHelperText, ReadOnly
**MDX sections**: No settings, validation (z.boolean())
**Known Limitations**:
- Hardcoded "Yes"/"No" cell text (no custom labels, no icons)
- No explicit `defaultValue` setting

### 5. color

**Stories**: Default, WithDefaultColor, Required, ReadOnly, CellDisplay
**MDX sections**: Settings (default_color), validation (required)
**Known Limitations**:
- `default_color` setting defined but unused by component
- No hex format validation in Zod (accepts any string)
- Category is "text" not "color"

### 6. email

**Stories**: Default, Required, Optional, ReadOnly
**MDX sections**: Settings (placeholder), validation (email format)
**Known Limitations**:
- Cell doesn't render as `mailto:` link
- Cell identical to TextCell (no email-specific behavior)

### 7. url

**Stories**: Default, Required, Optional, ReadOnly, CellDisplay
**MDX sections**: Settings (placeholder), validation (URL format)
**Known Limitations**:
- No URL truncation in cell (long URLs overflow)
- `z.string().url()` requires protocol (e.g. `example.com` fails)
- No `prepend` setting for protocol prefix

### 8. time

**Stories**: Default, Required, ReadOnly, CellDisplay
**MDX sections**: No settings, validation (required)
**Known Limitations**:
- No settings at all (no format, no min/max time, no step)
- No time format validation in Zod
- Cell doesn't format (raw string)
- No em-dash for empty cell (inconsistent)
- Value format undocumented

### 9. date

**Stories**: Default, WithMinMaxDate, Required, ReadOnly, CellDisplay
**MDX sections**: Settings (enable_range, min_date, max_date), validation (required)
**Known Limitations**:
- `enable_range` defined but not implemented (dead setting)
- `min_date`/`max_date` not validated in Zod (UI only)
- No date format validation in Zod
- Cell doesn't format (raw string)
- No em-dash for empty cell

### 10. slug

**Stories**: Default, WithSourceField, ValidationError, ReadOnly, CellDisplay
**MDX sections**: Settings (source_field), validation (slug regex), slugify algorithm
**Known Limitations**:
- Auto-slug always overwrites (no lock/manual edit mechanism)
- Hardcoded placeholder
- `toSlug` strips unicode without transliteration (ü→nothing, not ue)
- Nested source fields not supported
- No em-dash for empty cell

### 11. select

**Stories**: DefaultSingle, ManyOptions, MultiSelect, Required, ReadOnly, CellDisplay
**MDX sections**: Settings (options, multiple), validation (string or array)
**Known Limitations**:
- Multi-select uses raw HTML `<select multiple>` instead of anker's BaseSelect (chakra-react-select). Should upgrade for searchable, creatable, proper tag UI.
- No option validation in Zod (any string accepted)
- Hardcoded placeholder "Select..."
- Plan specified badge cell rendering but cell uses plain text

### 12. radio

**Stories**: Default, ManyOptions, Required, ReadOnly, CellDisplay
**MDX sections**: Settings (options), validation (required)
**Known Limitations**:
- No option validation in Zod
- No orientation/layout setting (horizontal/vertical)
- Plan specified badge cell but uses plain text

### 13. checkboxes

**Stories**: Default, ManyOptions, Required, PreSelected, ReadOnly, CellDisplay
**MDX sections**: Settings (options), validation (array, required min 1)
**Known Limitations**:
- Possible RHF array handling issue with shared `name` across CheckboxFields
- No min/max selection count settings
- No option validation in Zod
- Plan specified badge cell but uses plain text
- `disabled` vs `readOnly` inconsistency
- No columns/layout setting

### 14. section

**Stories**: (limited — document current non-functional state)
**MDX sections**: Structural role, no settings, no validation, no cell
**Known Limitations**:
- **Completely non-functional.** No visual rendering. No tabbed layout. FieldRenderer ignores sections entirely.
- Plan specified: tabbed layout when sections detected, fields grouped by section, default tab for fields before first section. None implemented.

### 15. group

**Stories**: Default, WithChildFields, WithMinMax, PrePopulated, ReadOnly, CellDisplay
**MDX sections**: Settings (min_items, max_items), validation (array with min/max)
**Known Limitations**:
- Child fields not validated in Zod (uses `z.record(z.unknown())`)
- No drag-to-reorder (plan specified dnd-kit)
- `append({})` ignores child field defaults
- No collapse/expand per item
- "Add item" button above list instead of below

### 16. blocks

**Stories**: Default, MultipleBlockTypes, PrePopulated, ReadOnly, CellDisplay
**MDX sections**: Settings (allowed_blocks), BlockDefinition shape, validation
**Known Limitations**:
- No per-block-type Zod validation (uses passthrough object)
- No drag-to-reorder (uses arrow buttons)
- No min/max block limits
- No per-block-type limits
- New blocks start without child defaults

### 17. array

**Stories**: DynamicMode, KeyedMode, PrePopulated, ReadOnly, CellDisplay
**MDX sections**: Settings (mode, keys), validation (array or record)
**Known Limitations**:
- `keys` mapping may not match anker ArrayField prop shape
- No `required` validation in Zod
- Values always strings (no other types)
- Keyed mode doesn't restrict to configured keys in Zod
- No min/max item limits

### 18. markdown

**Stories**: Default, WithContent, WithValidation, ReadOnly, CellDisplay
**MDX sections**: Settings (placeholder), validation (required, min_length, max_length)
**Known Limitations**:
- `placeholder` setting not passed to component
- `stripMarkdown` in cell doesn't handle code blocks, blockquotes, tables, strikethrough
- No toolbar configuration setting
- No preview mode

### 19. code

**Stories**: Default, WithLanguage, WithContent, ReadOnly, CellDisplay
**MDX sections**: Settings (language), validation (required, min_length, max_length)
**Known Limitations**:
- Cell uses hardcoded `#f5f5f5` instead of semantic tokens (dark mode incompatible)
- No `lineNumbers` setting
- No `height`/`maxHeight` setting

### 20. rich_text

**Stories**: Default (JSON textarea), WithContent, ReadOnly, CellDisplay
**MDX sections**: Settings (editor_spec, view_mode), validation (z.any())
**Known Limitations**:
- **No actual rich text editor.** Renders a JSON textarea placeholder. Real TipTap integration depends on `@knkcms/knkeditor` (optional peer dep) but no conditional rendering exists.
- `editor_spec` setting unused
- `view_mode` setting unused
- `z.any()` provides zero validation
- No adapter integration (textType adapter unused)
- JSON editing UX is unusable for end users

### 21. reference

**Stories**: DefaultWithMockAdapter, SingleMode, MultiMode, NoAdapter, ReadOnly, CellDisplay
**MDX sections**: Settings (blueprints, always_latest, max_items, max_depth, attributes), adapter interface, validation
**Known Limitations**:
- `useEffect` inside Controller render (React hooks violation)
- `always_latest`, `max_depth`, `attributes` settings unused
- No search debounce
- `max_items` not enforced in UI (except single mode)
- No keyboard accessibility on search dropdown
- Cell doesn't resolve IDs to display names (no adapter context)

### 22. toc_reference

**Stories**: DefaultWithMockAdapter, NoAdapter, ReadOnly, CellDisplay
**MDX sections**: Difference from reference (maxPerSpec: 1, availableIn: blueprint only), settings, adapter
**Known Limitations**:
- Same as reference (hooks violation, dead settings, no debounce, no keyboard a11y)
- Near-duplicate of reference — should share a base component

### 23. media

**Stories**: DefaultWithMockAdapter, WithAcceptFilter, WithMaxItems, NoAdapter, ReadOnly, CellDisplay
**MDX sections**: Settings (accept, max_items), adapter interface, validation
**Known Limitations**:
- No browse/select-existing UI (only upload)
- No image preview (MediaItem.url unused)
- No drag-and-drop upload
- Upload errors silently swallowed
- `max_items` not reflected in Zod
- No file size limit setting
- No single-item mode
- Cell shows only count (no filenames/thumbnails)

### 24. virtual_table

**Stories**: DefaultWithMockAdapter, EmptyTable, Loading, NoAdapter, CellDisplay
**MDX sections**: Settings (blueprint, always_latest, max_records_per_page), adapter interface, validation
**Known Limitations**:
- Never fetches data from adapter (`getData` unused)
- `max_records_per_page` unused (no pagination)
- `always_latest` unused
- Hardcoded 5-column limit
- Uses raw Chakra Table instead of anker DataTable (no sorting, selection, pagination)
- No column type-aware rendering (all values stringified)
- `availableIn: ["blueprint"]` only

## Storybook Config Change

Update `.storybook/main.ts` to include MDX:
```ts
stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
```

## Out of Scope

- Fixing the gaps (separate effort)
- Per-field component tests beyond what already exists
- Individual field type stories for table cells (cells are documented in MDX prose)
