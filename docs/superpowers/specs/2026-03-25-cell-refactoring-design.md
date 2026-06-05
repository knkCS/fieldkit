# Table Cell Refactoring Design

**Date:** 2026-03-25
**Status:** Approved
**GitHub:** Resolves #1 (parent) and #2–#23 (sub-issues)

## Goal

Refactor fieldkit's 22 table cell components to compose anker's generic DataTable cell primitives instead of reimplementing rendering logic. Each cell becomes a thin spec-aware wrapper that keeps fieldkit-specific transformation logic and delegates rendering to anker.

## Prerequisites

Bump `@knkcs/anker` devDependency from `0.0.1` to `0.0.2` and run `npm install`. This ensures all anker cell components are available. Own commit: `chore: bump @knkcs/anker to 0.0.2`.

## Approach: Thin Wrapper Pattern

Each fieldkit cell:
1. Receives `CellProps<S>` (unchanged interface: `{ field: Field<S>; value: unknown }`)
2. Applies fieldkit-specific transformation (option mapping, markdown stripping, count logic, etc.)
3. Delegates rendering to the appropriate anker cell component from `@knkcs/anker/components`

The `CellProps<S>` interface, `getCellForFieldType`, and plugin `cellComponent` registration are all unchanged.

### Before/After Example

```tsx
// Before (text-cell.tsx)
const text = String(value ?? "");
return <span title={text}>{text}</span>;

// After
import { TruncatedTextCell } from "@knkcs/anker/components";
const text = String(value ?? "");
return <TruncatedTextCell value={text} />;
```

## Cell Mapping

### TruncatedTextCell Group (11 cells)

Import: `import { TruncatedTextCell } from "@knkcs/anker/components"`

| Fieldkit Cell | Issue | Fieldkit-Specific Logic Retained |
|---|---|---|
| TextCell | #2 | None — pass `String(value ?? "")` |
| TextareaCell | #3 | None — pass with `maxLength={100}` |
| EmailCell | #4 | None — pass `String(value ?? "")` |
| TimeCell | #6 | None — pass `String(value ?? "")` |
| MarkdownCell | #17 | `stripMarkdown()` transformation before passing |
| RichTextCell | #18 | `extractText()` ProseMirror JSON extraction before passing |
| ReferenceCell | #19 | `display_name` extraction + comma joining for multi-ref |
| TocReferenceCell | #20 | `display_name` extraction from single reference |
| SelectCell | #21 | Option label mapping from `field.settings.options` (single + multi) |
| RadioCell | #22 | Option label mapping from `field.settings.options` |
| CheckboxesCell | #23 | Option label mapping for multiple values + comma joining |

### CountCell Group (4 cells)

Import: `import { CountCell } from "@knkcs/anker/components"`

| Fieldkit Cell | Issue | Fieldkit-Specific Logic Retained |
|---|---|---|
| ArrayCell | #13 | Mode-aware logic (keyed vs dynamic), `singular`/`plural` labels |
| GroupCell | #14 | `singular`/`plural` item labels |
| MediaCell | #15 | Single vs array distinction, `singular`/`plural` file labels |
| VirtualTableCell | #16 | `singular`/`plural` row labels |

### Type-Specific Group (7 cells)

| Fieldkit Cell | Anker Cell | Issue | Import |
|---|---|---|---|
| DateCell | `DateCell` | #5 | `@knkcs/anker/components` |
| NumberCell | `NumberCell` | #7 | `@knkcs/anker/components` |
| BooleanCell | `BooleanCell` | #8 | `@knkcs/anker/components` |
| ColorCell | `ColorSwatchCell` | #9 | `@knkcs/anker/components` |
| CodeCell | `CodeCell` | #10 | `@knkcs/anker/components` |
| UrlCell | `UrlCell` | #11 | `@knkcs/anker/components` |
| SlugCell | `SlugCell` | #12 | `@knkcs/anker/components` |

### Excluded

**BlocksCell** — too fieldkit-specific (block type name resolution from `field.settings.allowed_blocks`). Issue #1 explicitly excludes it.

## Testing Strategy

TDD for each cell. Write test first in `src/table/cells/__tests__/<name>-cell.test.tsx`, then refactor.

Test structure:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { SomeCell } from "../some-cell";

const makeField = (overrides?): Field<SomeSettings> => ({
  field_type: "some_type",
  config: { api_accessor: "test", name: "Test", required: false },
  settings: overrides?.settings ?? null,
  validation: null,
});
```

**Test scope by group:**
- **Simple pass-through** (Text, Email, Time, Date, Slug, Url, Boolean, Number, Color, Code): value in → rendered output. Null/undefined handling.
- **Option mapping** (Select, Radio, Checkboxes): `field.settings.options` values mapped to labels correctly.
- **Transformation** (Markdown, RichText): markdown stripped / ProseMirror JSON extracted to plain text.
- **Count** (Array, Group, Media, VirtualTable): array/object counting, singular/plural, empty state.
- **Reference** (Reference, TocReference): display_name extraction, multi-value joining, truncation.

## Commit Strategy

- **Branch:** Directly on main
- **1 prep commit:** `chore: bump @knkcs/anker to 0.0.2`
- **22 cell commits**, each following:

```
refactor(table): use anker <AnkerCellName> in <FieldkitCellName>

Closes #N
```

- **Conventional commits** with `refactor` type, `table` scope, imperative mood
- Each commit includes both the test file and the refactored cell file

## Execution Order

1. Prep: bump anker dependency
2. Type-specific group (7 cells) — simplest, near-direct replacements
3. CountCell group (4 cells) — straightforward count delegation
4. TruncatedTextCell group (11 cells) — largest group, some with transformation logic

Within each group, order from simplest to most complex.

## What Does NOT Change

- `CellProps<S>` interface in `src/table/cells/` (the contract with plugins)
- `getCellForFieldType()` in `src/table/get-cell-for-type.tsx`
- Plugin `cellComponent` registration
- `BlocksCell` (excluded)
- Existing integration tests (`spec-data-table.test.tsx`, `get-cell-for-type.test.tsx`)
