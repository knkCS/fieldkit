# Table Cell Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor 22 fieldkit table cell components to delegate rendering to anker's DataTable cell primitives.

**Architecture:** Each cell keeps its `CellProps<S>` interface and fieldkit-specific transformation logic, but delegates rendering to the corresponding anker cell from `@knkcs/anker/components`. TDD — test first, refactor second, commit per issue.

**Tech Stack:** @knkcs/anker/components cell primitives, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-25-cell-refactoring-design.md`

---

## Shared Patterns

### Test Helper

Every cell test uses this helper to create a minimal `Field<S>`. Located at the top of each test file:

```tsx
import type { Field } from "../../../schema/types";

const makeField = <S = unknown>(overrides?: {
  settings?: S;
  config?: Partial<Field["config"]>;
}): Field<S> => ({
  field_type: "test",
  config: {
    name: "Test",
    api_accessor: "test",
    required: false,
    instructions: "",
    ...overrides?.config,
  },
  settings: overrides?.settings ?? null,
  system: false,
});
```

### Run Tests Command

For all tasks: `npm run test -- src/table/cells/__tests__/<name>-cell.test.tsx`

### Commit Message Format

```
refactor(table): use anker <AnkerCell> in <FieldkitCell>

Closes #N
```

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `package.json` | Bump @knkcs/anker to 0.0.2 |
| Create | `src/table/cells/__tests__/text-cell.test.tsx` | TextCell tests |
| Modify | `src/table/cells/text-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/textarea-cell.test.tsx` | TextareaCell tests |
| Modify | `src/table/cells/textarea-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/email-cell.test.tsx` | EmailCell tests |
| Modify | `src/table/cells/email-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/time-cell.test.tsx` | TimeCell tests |
| Modify | `src/table/cells/time-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/date-cell.test.tsx` | DateCell tests |
| Modify | `src/table/cells/date-cell.tsx` | Delegate to anker DateCell |
| Create | `src/table/cells/__tests__/number-cell.test.tsx` | NumberCell tests |
| Modify | `src/table/cells/number-cell.tsx` | Delegate to anker NumberCell |
| Create | `src/table/cells/__tests__/boolean-cell.test.tsx` | BooleanCell tests |
| Modify | `src/table/cells/boolean-cell.tsx` | Delegate to anker BooleanCell |
| Create | `src/table/cells/__tests__/color-cell.test.tsx` | ColorCell tests |
| Modify | `src/table/cells/color-cell.tsx` | Delegate to ColorSwatchCell |
| Create | `src/table/cells/__tests__/code-cell.test.tsx` | CodeCell tests |
| Modify | `src/table/cells/code-cell.tsx` | Delegate to anker CodeCell |
| Create | `src/table/cells/__tests__/url-cell.test.tsx` | UrlCell tests |
| Modify | `src/table/cells/url-cell.tsx` | Delegate to anker UrlCell |
| Create | `src/table/cells/__tests__/slug-cell.test.tsx` | SlugCell tests |
| Modify | `src/table/cells/slug-cell.tsx` | Delegate to anker SlugCell |
| Create | `src/table/cells/__tests__/array-cell.test.tsx` | ArrayCell tests |
| Modify | `src/table/cells/array-cell.tsx` | Delegate to CountCell |
| Create | `src/table/cells/__tests__/group-cell.test.tsx` | GroupCell tests |
| Modify | `src/table/cells/group-cell.tsx` | Delegate to CountCell |
| Create | `src/table/cells/__tests__/media-cell.test.tsx` | MediaCell tests |
| Modify | `src/table/cells/media-cell.tsx` | Delegate to CountCell |
| Create | `src/table/cells/__tests__/virtual-table-cell.test.tsx` | VirtualTableCell tests |
| Modify | `src/table/cells/virtual-table-cell.tsx` | Delegate to CountCell |
| Create | `src/table/cells/__tests__/markdown-cell.test.tsx` | MarkdownCell tests |
| Modify | `src/table/cells/markdown-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/rich-text-cell.test.tsx` | RichTextCell tests |
| Modify | `src/table/cells/rich-text-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/reference-cell.test.tsx` | ReferenceCell tests |
| Modify | `src/table/cells/reference-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/toc-reference-cell.test.tsx` | TocReferenceCell tests |
| Modify | `src/table/cells/toc-reference-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/select-cell.test.tsx` | SelectCell tests |
| Modify | `src/table/cells/select-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/radio-cell.test.tsx` | RadioCell tests |
| Modify | `src/table/cells/radio-cell.tsx` | Delegate to TruncatedTextCell |
| Create | `src/table/cells/__tests__/checkboxes-cell.test.tsx` | CheckboxesCell tests |
| Modify | `src/table/cells/checkboxes-cell.tsx` | Delegate to TruncatedTextCell |

---

### Task 0: Bump anker dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update @knkcs/anker version**

In `package.json`, change devDependencies `"@knkcs/anker": "0.0.1"` to `"@knkcs/anker": "0.0.2"`.

- [ ] **Step 2: Install**

Run: `npm install`

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump @knkcs/anker to 0.0.2"
```

---

### Task 1: Refactor BooleanCell (#8)

**Files:**
- Create: `src/table/cells/__tests__/boolean-cell.test.tsx`
- Modify: `src/table/cells/boolean-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { BooleanCell } from "../boolean-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "boolean",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("BooleanCell", () => {
	it("renders Yes for true", () => {
		render(<BooleanCell field={makeField()} value={true} />);
		expect(screen.getByText("Yes")).toBeDefined();
	});

	it("renders No for false", () => {
		render(<BooleanCell field={makeField()} value={false} />);
		expect(screen.getByText("No")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<BooleanCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/table/cells/__tests__/boolean-cell.test.tsx`
Expected: The null test fails (current impl renders "No" for null)

- [ ] **Step 3: Refactor the cell**

```tsx
import { BooleanCell as AnkerBooleanCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function BooleanCell({ value }: CellProps) {
	return <AnkerBooleanCell value={typeof value === "boolean" ? value : null} />;
}
BooleanCell.displayName = "BooleanCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/boolean-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/boolean-cell.tsx src/table/cells/__tests__/boolean-cell.test.tsx
git commit -m "refactor(table): use anker BooleanCell in BooleanCell

Closes #8"
```

---

### Task 2: Refactor DateCell (#5)

**Files:**
- Create: `src/table/cells/__tests__/date-cell.test.tsx`
- Modify: `src/table/cells/date-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { DateCell } from "../date-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "date",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("DateCell", () => {
	it("renders a formatted date", () => {
		render(<DateCell field={makeField()} value="2026-03-25" />);
		expect(screen.getByText("Mar 25, 2026")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<DateCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for invalid date", () => {
		render(<DateCell field={makeField()} value="not-a-date" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/table/cells/__tests__/date-cell.test.tsx`
Expected: FAIL (current impl renders raw string, not formatted)

- [ ] **Step 3: Refactor the cell**

```tsx
import { DateCell as AnkerDateCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function DateCell({ value }: CellProps) {
	return <AnkerDateCell value={value != null ? String(value) : null} />;
}
DateCell.displayName = "DateCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/date-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/date-cell.tsx src/table/cells/__tests__/date-cell.test.tsx
git commit -m "refactor(table): use anker DateCell in DateCell

Closes #5"
```

---

### Task 3: Refactor NumberCell (#7)

**Files:**
- Create: `src/table/cells/__tests__/number-cell.test.tsx`
- Modify: `src/table/cells/number-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { NumberCell } from "../number-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "number",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("NumberCell", () => {
	it("renders a formatted number", () => {
		render(<NumberCell field={makeField()} value={1234} />);
		expect(screen.getByText(/1.*234/)).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<NumberCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders string fallback for NaN", () => {
		render(<NumberCell field={makeField()} value="abc" />);
		expect(screen.getByText("abc")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/table/cells/__tests__/number-cell.test.tsx`
Expected: null test fails (current impl renders "—" as `<span>—</span>` which should still match, but let's verify)

- [ ] **Step 3: Refactor the cell**

```tsx
import { NumberCell as AnkerNumberCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function NumberCell({ value }: CellProps) {
	return <AnkerNumberCell value={value as number | string | null | undefined} />;
}
NumberCell.displayName = "NumberCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/number-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/number-cell.tsx src/table/cells/__tests__/number-cell.test.tsx
git commit -m "refactor(table): use anker NumberCell in NumberCell

Closes #7"
```

---

### Task 4: Refactor ColorCell (#9)

**Files:**
- Create: `src/table/cells/__tests__/color-cell.test.tsx`
- Modify: `src/table/cells/color-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { ColorCell } from "../color-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "color",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("ColorCell", () => {
	it("renders the color value text", () => {
		render(<ColorCell field={makeField()} value="#ff0000" />);
		expect(screen.getByText("#ff0000")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ColorCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<ColorCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/color-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { ColorSwatchCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function ColorCell({ value }: CellProps) {
	const color = value != null ? String(value) : null;
	return <ColorSwatchCell value={color || null} />;
}
ColorCell.displayName = "ColorCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/color-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/color-cell.tsx src/table/cells/__tests__/color-cell.test.tsx
git commit -m "refactor(table): use anker ColorSwatchCell in ColorCell

Closes #9"
```

---

### Task 5: Refactor CodeCell (#10)

**Files:**
- Create: `src/table/cells/__tests__/code-cell.test.tsx`
- Modify: `src/table/cells/code-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { CodeCell } from "../code-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "code",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("CodeCell", () => {
	it("renders code text", () => {
		render(<CodeCell field={makeField()} value="const x = 1;" />);
		expect(screen.getByText("const x = 1;")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<CodeCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("truncates long code", () => {
		const long = "x".repeat(100);
		render(<CodeCell field={makeField()} value={long} />);
		expect(screen.queryByText(long)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/code-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { CodeCell as AnkerCodeCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function CodeCell({ value }: CellProps) {
	return <AnkerCodeCell value={value != null ? String(value) : null} />;
}
CodeCell.displayName = "CodeCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/code-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/code-cell.tsx src/table/cells/__tests__/code-cell.test.tsx
git commit -m "refactor(table): use anker CodeCell in CodeCell

Closes #10"
```

---

### Task 6: Refactor UrlCell (#11)

**Files:**
- Create: `src/table/cells/__tests__/url-cell.test.tsx`
- Modify: `src/table/cells/url-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { UrlCell } from "../url-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "url",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("UrlCell", () => {
	it("renders a link", () => {
		render(<UrlCell field={makeField()} value="https://example.com" />);
		const link = screen.getByRole("link");
		expect(link.getAttribute("href")).toBe("https://example.com");
		expect(link.getAttribute("target")).toBe("_blank");
	});

	it("renders empty cell value for null", () => {
		render(<UrlCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<UrlCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/url-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { UrlCell as AnkerUrlCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function UrlCell({ value }: CellProps) {
	const url = value != null ? String(value) : null;
	return <AnkerUrlCell value={url || null} />;
}
UrlCell.displayName = "UrlCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/url-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/url-cell.tsx src/table/cells/__tests__/url-cell.test.tsx
git commit -m "refactor(table): use anker UrlCell in UrlCell

Closes #11"
```

---

### Task 7: Refactor SlugCell (#12)

**Files:**
- Create: `src/table/cells/__tests__/slug-cell.test.tsx`
- Modify: `src/table/cells/slug-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { SlugCell } from "../slug-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "slug",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("SlugCell", () => {
	it("renders slug text", () => {
		render(<SlugCell field={makeField()} value="my-page-slug" />);
		expect(screen.getByText("my-page-slug")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<SlugCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/slug-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { SlugCell as AnkerSlugCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function SlugCell({ value }: CellProps) {
	return <AnkerSlugCell value={value != null ? String(value) : null} />;
}
SlugCell.displayName = "SlugCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/slug-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/slug-cell.tsx src/table/cells/__tests__/slug-cell.test.tsx
git commit -m "refactor(table): use anker SlugCell in SlugCell

Closes #12"
```

---

### Task 8: Refactor ArrayCell (#13)

**Files:**
- Create: `src/table/cells/__tests__/array-cell.test.tsx`
- Modify: `src/table/cells/array-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { ArraySettings } from "../../../schema/field-types/array";
import { ArrayCell } from "../array-cell";

const makeField = (overrides?: {
	settings?: ArraySettings;
	config?: Partial<Field["config"]>;
}): Field<ArraySettings> => ({
	field_type: "array",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("ArrayCell", () => {
	it("renders item count for dynamic mode", () => {
		render(<ArrayCell field={makeField()} value={["a", "b", "c"]} />);
		expect(screen.getByText("3 items")).toBeDefined();
	});

	it("renders singular for 1 item", () => {
		render(<ArrayCell field={makeField()} value={["a"]} />);
		expect(screen.getByText("1 item")).toBeDefined();
	});

	it("renders entry count for keyed mode", () => {
		render(
			<ArrayCell
				field={makeField({ settings: { mode: "keyed" } })}
				value={{ key1: "val1", key2: "val2" }}
			/>,
		);
		expect(screen.getByText("2 entries")).toBeDefined();
	});

	it("renders singular for 1 entry in keyed mode", () => {
		render(
			<ArrayCell
				field={makeField({ settings: { mode: "keyed" } })}
				value={{ key1: "val1" }}
			/>,
		);
		expect(screen.getByText("1 entry")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ArrayCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/array-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { CountCell } from "@knkcs/anker/components";
import type { ArraySettings } from "../../schema/field-types/array";
import type { CellProps } from "../../schema/plugin";

export function ArrayCell({ field, value }: CellProps<ArraySettings>) {
	const mode = field.settings?.mode ?? "dynamic";

	if (mode === "keyed") {
		return <CountCell value={value as Record<string, unknown> | null} singular="entry" plural="entries" />;
	}

	return <CountCell value={value as unknown[] | null} singular="item" plural="items" />;
}
ArrayCell.displayName = "ArrayCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/array-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/array-cell.tsx src/table/cells/__tests__/array-cell.test.tsx
git commit -m "refactor(table): use anker CountCell in ArrayCell

Closes #13"
```

---

### Task 9: Refactor GroupCell (#14)

**Files:**
- Create: `src/table/cells/__tests__/group-cell.test.tsx`
- Modify: `src/table/cells/group-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { GroupCell } from "../group-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "group",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("GroupCell", () => {
	it("renders item count", () => {
		render(<GroupCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 items")).toBeDefined();
	});

	it("renders singular for 1 item", () => {
		render(<GroupCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 item")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<GroupCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for non-array", () => {
		render(<GroupCell field={makeField()} value="not-array" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/group-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { CountCell } from "@knkcs/anker/components";
import type { GroupSettings } from "../../schema/field-types/group";
import type { CellProps } from "../../schema/plugin";

export function GroupCell({ value }: CellProps<GroupSettings>) {
	if (!Array.isArray(value)) return <CountCell value={null} singular="item" plural="items" />;
	return <CountCell value={value} singular="item" plural="items" />;
}
GroupCell.displayName = "GroupCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/group-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/group-cell.tsx src/table/cells/__tests__/group-cell.test.tsx
git commit -m "refactor(table): use anker CountCell in GroupCell

Closes #14"
```

---

### Task 10: Refactor MediaCell (#15)

**Files:**
- Create: `src/table/cells/__tests__/media-cell.test.tsx`
- Modify: `src/table/cells/media-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { MediaCell } from "../media-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "media",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("MediaCell", () => {
	it("renders file count for array", () => {
		render(<MediaCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 files")).toBeDefined();
	});

	it("renders singular for 1 file", () => {
		render(<MediaCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders 1 file for single object", () => {
		render(<MediaCell field={makeField()} value={{ id: "1" }} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<MediaCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<MediaCell field={makeField()} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/media-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function MediaCell({ value }: CellProps) {
	if (value == null) return <CountCell value={null} singular="file" plural="files" />;

	if (Array.isArray(value)) {
		if (value.length === 0) return <CountCell value={null} singular="file" plural="files" />;
		return <CountCell value={value} singular="file" plural="files" />;
	}

	return <CountCell value={1} singular="file" plural="files" />;
}
MediaCell.displayName = "MediaCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/media-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/media-cell.tsx src/table/cells/__tests__/media-cell.test.tsx
git commit -m "refactor(table): use anker CountCell in MediaCell

Closes #15"
```

---

### Task 11: Refactor VirtualTableCell (#16)

**Files:**
- Create: `src/table/cells/__tests__/virtual-table-cell.test.tsx`
- Modify: `src/table/cells/virtual-table-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { VirtualTableCell } from "../virtual-table-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "virtual_table",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("VirtualTableCell", () => {
	it("renders row count", () => {
		render(<VirtualTableCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 rows")).toBeDefined();
	});

	it("renders singular for 1 row", () => {
		render(<VirtualTableCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 row")).toBeDefined();
	});

	it("renders 0 rows for empty array", () => {
		render(<VirtualTableCell field={makeField()} value={[]} />);
		expect(screen.getByText("0 rows")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<VirtualTableCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for non-array", () => {
		render(<VirtualTableCell field={makeField()} value="not-array" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/virtual-table-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { CountCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function VirtualTableCell({ value }: CellProps) {
	if (!Array.isArray(value)) return <CountCell value={null} singular="row" plural="rows" />;
	return <CountCell value={value} singular="row" plural="rows" />;
}
VirtualTableCell.displayName = "VirtualTableCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/virtual-table-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/virtual-table-cell.tsx src/table/cells/__tests__/virtual-table-cell.test.tsx
git commit -m "refactor(table): use anker CountCell in VirtualTableCell

Closes #16"
```

---

### Task 12: Refactor TextCell (#2)

**Files:**
- Create: `src/table/cells/__tests__/text-cell.test.tsx`
- Modify: `src/table/cells/text-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TextCell } from "../text-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "text",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("TextCell", () => {
	it("renders text value", () => {
		render(<TextCell field={makeField()} value="Hello world" />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TextCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/text-cell.test.tsx`
Expected: null test fails (current impl renders empty string for null)

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TextCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
TextCell.displayName = "TextCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/text-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/text-cell.tsx src/table/cells/__tests__/text-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in TextCell

Closes #2"
```

---

### Task 13: Refactor TextareaCell (#3)

**Files:**
- Create: `src/table/cells/__tests__/textarea-cell.test.tsx`
- Modify: `src/table/cells/textarea-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TextareaCell } from "../textarea-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "textarea",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("TextareaCell", () => {
	it("renders text value", () => {
		render(<TextareaCell field={makeField()} value="Short text" />);
		expect(screen.getByText("Short text")).toBeDefined();
	});

	it("truncates long text", () => {
		const long = "x".repeat(150);
		render(<TextareaCell field={makeField()} value={long} />);
		expect(screen.queryByText(long)).toBeNull();
	});

	it("renders empty cell value for null", () => {
		render(<TextareaCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/textarea-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TextareaCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} maxLength={100} />;
}
TextareaCell.displayName = "TextareaCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/textarea-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/textarea-cell.tsx src/table/cells/__tests__/textarea-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in TextareaCell

Closes #3"
```

---

### Task 14: Refactor EmailCell (#4)

**Files:**
- Create: `src/table/cells/__tests__/email-cell.test.tsx`
- Modify: `src/table/cells/email-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { EmailCell } from "../email-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "email",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("EmailCell", () => {
	it("renders email text", () => {
		render(<EmailCell field={makeField()} value="user@example.com" />);
		expect(screen.getByText("user@example.com")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<EmailCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/email-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function EmailCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
EmailCell.displayName = "EmailCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/email-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/email-cell.tsx src/table/cells/__tests__/email-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in EmailCell

Closes #4"
```

---

### Task 15: Refactor TimeCell (#6)

**Files:**
- Create: `src/table/cells/__tests__/time-cell.test.tsx`
- Modify: `src/table/cells/time-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TimeCell } from "../time-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "time",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("TimeCell", () => {
	it("renders time value", () => {
		render(<TimeCell field={makeField()} value="14:30" />);
		expect(screen.getByText("14:30")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TimeCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/time-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TimeCell({ value }: CellProps) {
	return <TruncatedTextCell value={value != null ? String(value) : null} />;
}
TimeCell.displayName = "TimeCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/time-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/time-cell.tsx src/table/cells/__tests__/time-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in TimeCell

Closes #6"
```

---

### Task 16: Refactor MarkdownCell (#17)

**Files:**
- Create: `src/table/cells/__tests__/markdown-cell.test.tsx`
- Modify: `src/table/cells/markdown-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { MarkdownCell } from "../markdown-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "markdown",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("MarkdownCell", () => {
	it("strips markdown and renders text", () => {
		render(<MarkdownCell field={makeField()} value="## Hello **world**" />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("strips links", () => {
		render(<MarkdownCell field={makeField()} value="[click here](http://example.com)" />);
		expect(screen.getByText("click here")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<MarkdownCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<MarkdownCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/markdown-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

Keep the `stripMarkdown` function, delegate rendering:

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

/** Strip basic markdown formatting for plain text display. */
function stripMarkdown(text: string): string {
	return text
		.replace(/#{1,6}\s+/g, "")
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/__(.+?)__/g, "$1")
		.replace(/\*(.+?)\*/g, "$1")
		.replace(/_(.+?)_/g, "$1")
		.replace(/`(.+?)`/g, "$1")
		.replace(/\[(.+?)\]\(.+?\)/g, "$1")
		.replace(/!\[.*?\]\(.+?\)/g, "[image]")
		.replace(/\n/g, " ")
		.trim();
}

export function MarkdownCell({ value }: CellProps) {
	const raw = value != null ? String(value) : "";
	const text = stripMarkdown(raw);
	return <TruncatedTextCell value={text || null} maxLength={100} />;
}
MarkdownCell.displayName = "MarkdownCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/markdown-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/markdown-cell.tsx src/table/cells/__tests__/markdown-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in MarkdownCell

Closes #17"
```

---

### Task 17: Refactor RichTextCell (#18)

**Files:**
- Create: `src/table/cells/__tests__/rich-text-cell.test.tsx`
- Modify: `src/table/cells/rich-text-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { RichTextCell } from "../rich-text-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "rich_text",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("RichTextCell", () => {
	it("extracts text from ProseMirror JSON", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
			],
		};
		render(<RichTextCell field={makeField()} value={doc} />);
		expect(screen.getByText("Hello world")).toBeDefined();
	});

	it("renders plain string value", () => {
		render(<RichTextCell field={makeField()} value="Plain text" />);
		expect(screen.getByText("Plain text")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<RichTextCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/rich-text-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

Keep the `extractText` function, delegate rendering:

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

/** Attempt to extract plain text from a ProseMirror-like JSON document. */
function extractText(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return String(value);

	const doc = value as Record<string, unknown>;
	if (Array.isArray(doc.content)) {
		return doc.content.map(extractText).join(" ").trim();
	}
	if (typeof doc.text === "string") return doc.text;

	return "[Rich text content]";
}

export function RichTextCell({ value }: CellProps) {
	const text = extractText(value);
	return <TruncatedTextCell value={text || null} maxLength={100} />;
}
RichTextCell.displayName = "RichTextCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/rich-text-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/rich-text-cell.tsx src/table/cells/__tests__/rich-text-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in RichTextCell

Closes #18"
```

---

### Task 18: Refactor ReferenceCell (#19)

**Files:**
- Create: `src/table/cells/__tests__/reference-cell.test.tsx`
- Modify: `src/table/cells/reference-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { ReferenceCell } from "../reference-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "reference",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("ReferenceCell", () => {
	it("renders display names from array of objects", () => {
		const refs = [
			{ id: "1", display_name: "Article A" },
			{ id: "2", display_name: "Article B" },
		];
		render(<ReferenceCell field={makeField()} value={refs} />);
		expect(screen.getByText("Article A, Article B")).toBeDefined();
	});

	it("renders string values from array", () => {
		render(<ReferenceCell field={makeField()} value={["id-1", "id-2"]} />);
		expect(screen.getByText("id-1, id-2")).toBeDefined();
	});

	it("renders single string value", () => {
		render(<ReferenceCell field={makeField()} value="single-ref" />);
		expect(screen.getByText("single-ref")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ReferenceCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<ReferenceCell field={makeField()} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/reference-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function ReferenceCell({ value }: CellProps) {
	if (value == null) return <TruncatedTextCell value={null} />;

	if (Array.isArray(value)) {
		if (value.length === 0) return <TruncatedTextCell value={null} />;
		const display = value.map((v) => {
			if (typeof v === "object" && v !== null && "display_name" in v) {
				return String((v as Record<string, unknown>).display_name);
			}
			return String(v);
		});
		return <TruncatedTextCell value={display.join(", ")} maxLength={100} />;
	}

	return <TruncatedTextCell value={String(value)} />;
}
ReferenceCell.displayName = "ReferenceCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/reference-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/reference-cell.tsx src/table/cells/__tests__/reference-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in ReferenceCell

Closes #19"
```

---

### Task 19: Refactor TocReferenceCell (#20)

**Files:**
- Create: `src/table/cells/__tests__/toc-reference-cell.test.tsx`
- Modify: `src/table/cells/toc-reference-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { TocReferenceCell } from "../toc-reference-cell";

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "toc_reference",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("TocReferenceCell", () => {
	it("renders display_name from object", () => {
		render(<TocReferenceCell field={makeField()} value={{ id: "1", display_name: "Chapter 1" }} />);
		expect(screen.getByText("Chapter 1")).toBeDefined();
	});

	it("renders string value", () => {
		render(<TocReferenceCell field={makeField()} value="ref-id" />);
		expect(screen.getByText("ref-id")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<TocReferenceCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<TocReferenceCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/toc-reference-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CellProps } from "../../schema/plugin";

export function TocReferenceCell({ value }: CellProps) {
	if (value == null || value === "") return <TruncatedTextCell value={null} />;

	const text =
		typeof value === "object" && value !== null && "display_name" in value
			? String((value as Record<string, unknown>).display_name)
			: String(value);

	return <TruncatedTextCell value={text} />;
}
TocReferenceCell.displayName = "TocReferenceCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/toc-reference-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/toc-reference-cell.tsx src/table/cells/__tests__/toc-reference-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in TocReferenceCell

Closes #20"
```

---

### Task 20: Refactor SelectCell (#21)

**Files:**
- Create: `src/table/cells/__tests__/select-cell.test.tsx`
- Modify: `src/table/cells/select-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { SelectSettings } from "../../../schema/field-types/select";
import { SelectCell } from "../select-cell";

const makeField = (overrides?: {
	settings?: SelectSettings;
	config?: Partial<Field["config"]>;
}): Field<SelectSettings> => ({
	field_type: "select",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("SelectCell", () => {
	const options = { draft: "Draft", published: "Published", archived: "Archived" };

	it("renders label for single value", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="published" />);
		expect(screen.getByText("Published")).toBeDefined();
	});

	it("renders labels for multi-select array", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value={["draft", "published"]} />);
		expect(screen.getByText("Draft, Published")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="unknown" />);
		expect(screen.getByText("unknown")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<SelectCell field={makeField({ settings: { options } })} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/select-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { SelectSettings } from "../../schema/field-types/select";
import type { CellProps } from "../../schema/plugin";

export function SelectCell({ field, value }: CellProps<SelectSettings>) {
	const options = field.settings?.options ?? {};

	if (Array.isArray(value)) {
		const labels = value.map((v) => options[String(v)] ?? String(v));
		return <TruncatedTextCell value={labels.join(", ") || null} />;
	}

	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	const label = options[String(value)] ?? String(value);
	return <TruncatedTextCell value={label} />;
}
SelectCell.displayName = "SelectCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/select-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/select-cell.tsx src/table/cells/__tests__/select-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in SelectCell

Closes #21"
```

---

### Task 21: Refactor RadioCell (#22)

**Files:**
- Create: `src/table/cells/__tests__/radio-cell.test.tsx`
- Modify: `src/table/cells/radio-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { RadioSettings } from "../../../schema/field-types/radio";
import { RadioCell } from "../radio-cell";

const makeField = (overrides?: {
	settings?: RadioSettings;
	config?: Partial<Field["config"]>;
}): Field<RadioSettings> => ({
	field_type: "radio",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("RadioCell", () => {
	const options = { sm: "Small", md: "Medium", lg: "Large" };

	it("renders label for selected value", () => {
		render(<RadioCell field={makeField({ settings: { options } })} value="md" />);
		expect(screen.getByText("Medium")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(<RadioCell field={makeField({ settings: { options } })} value="xl" />);
		expect(screen.getByText("xl")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<RadioCell field={makeField({ settings: { options } })} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<RadioCell field={makeField({ settings: { options } })} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/radio-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { CellProps } from "../../schema/plugin";

export function RadioCell({ field, value }: CellProps<RadioSettings>) {
	const options = field.settings?.options ?? {};
	if (value == null || value === "") return <TruncatedTextCell value={null} />;
	const label = options[String(value)] ?? String(value);
	return <TruncatedTextCell value={label} />;
}
RadioCell.displayName = "RadioCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/radio-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/radio-cell.tsx src/table/cells/__tests__/radio-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in RadioCell

Closes #22"
```

---

### Task 22: Refactor CheckboxesCell (#23)

**Files:**
- Create: `src/table/cells/__tests__/checkboxes-cell.test.tsx`
- Modify: `src/table/cells/checkboxes-cell.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import type { CheckboxesSettings } from "../../../schema/field-types/checkboxes";
import { CheckboxesCell } from "../checkboxes-cell";

const makeField = (overrides?: {
	settings?: CheckboxesSettings;
	config?: Partial<Field["config"]>;
}): Field<CheckboxesSettings> => ({
	field_type: "checkboxes",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: overrides?.settings ?? null,
	system: false,
});

describe("CheckboxesCell", () => {
	const options = { js: "JavaScript", ts: "TypeScript", py: "Python" };

	it("renders labels for selected values", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={["js", "ts"]} />);
		expect(screen.getByText("JavaScript, TypeScript")).toBeDefined();
	});

	it("falls back to raw value if no option match", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={["go"]} />);
		expect(screen.getByText("go")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<CheckboxesCell field={makeField({ settings: { options } })} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm run test -- src/table/cells/__tests__/checkboxes-cell.test.tsx`

- [ ] **Step 3: Refactor the cell**

```tsx
import { TruncatedTextCell } from "@knkcs/anker/components";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { CellProps } from "../../schema/plugin";

export function CheckboxesCell({ field, value }: CellProps<CheckboxesSettings>) {
	const options = field.settings?.options ?? {};

	if (!Array.isArray(value) || value.length === 0) return <TruncatedTextCell value={null} />;

	const labels = value.map((v) => options[String(v)] ?? String(v));
	return <TruncatedTextCell value={labels.join(", ")} />;
}
CheckboxesCell.displayName = "CheckboxesCell";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/table/cells/__tests__/checkboxes-cell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/table/cells/checkboxes-cell.tsx src/table/cells/__tests__/checkboxes-cell.test.tsx
git commit -m "refactor(table): use anker TruncatedTextCell in CheckboxesCell

Closes #23"
```

---

### Task 23: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass (existing 242 + 22 new cell tests)

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors introduced

- [ ] **Step 4: Verify git log**

Run: `git log --oneline -25`
Expected: 23 commits (1 prep + 22 cell refactors), each with correct conventional commit format and `Closes #N`
