# FieldSearch Combobox A11y Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FieldSearch becomes a real ARIA combobox (with the highlight-clamp and debounce-identity fixes), and tab indicators get accessible labels — fixes #25, ships as fieldkit 0.3.2.

**Architecture:** All combobox wiring is hand-wired in `field-search.tsx` (anker's `SearchInput` spreads rest props onto its Chakra `Input`, so no anker change). The clamp is fixed by deriving `safeHighlighted` instead of clamping in an effect. `TabErrorBadge` gains a required `label` prop; new label keys ride `SpecFormLabels` and `EditorLabels`/`CanvasLabels`.

**Tech Stack:** React (`useId`, `useCallback`), WAI-ARIA combobox pattern (activedescendant variant), Vitest/RTL.

**Spec:** `docs/superpowers/specs/2026-07-06-field-search-a11y-design.md`

## Global Constraints

- fieldkit-only; NO anker changes. Ships as **0.3.2** (controller bumps at release).
- FieldSearch behavior stays byte-identical apart from ARIA/clamp: Escape containment (`e.stopPropagation()` protecting EditDrawer), jump-and-clear semantics, `data-testid="field-search"` + `data-field-search-input`, two-column row layout, 300ms debounce timing.
- Label defaults exactly: `tabErrors: "{count} invalid fields"` (`{count}` interpolated at the call site), `unsavedChanges: "Unsaved changes"`.
- `EditorLabels`/`CanvasLabels` gain ONLY `tabErrors` (the canvas tab strip has no DirtyDot; the editor header dot is already labeled via `EditorLabels.dirty`).
- `TabErrorBadge` is internal (not exported from any barrel; exactly two call sites) — its new `label` prop is required, not optional.
- Gate: `npm run test && npm run typecheck && npm run lint` with REAL exit codes (log file + `echo $?`; never pipe a gate into tail/head).
- Conventional Commits, scope `renderer` (Task 1) / cross-cutting no-scope or `renderer` (Task 2 touches editor too — use no scope: `fix: …`). displayName stays set on all exported components.

---

### Task 1: FieldSearch combobox wiring + clamp + stable onSearch

**Files:**
- Modify: `src/renderer/spec-form/field-search.tsx` (whole component body below)
- Test: `src/renderer/spec-form/__tests__/field-search-combobox.test.tsx` (new)

**Interfaces:**
- Consumes: `FieldSearchResult { accessor: string; label: string; tabIndex: number; tabLabel: string }` from `./search-index`; anker `SearchInput` (spreads rest props onto its `Input`).
- Produces: no API change — `FieldSearchProps` unchanged. DOM contract for tests: input has `role="combobox"`; listbox id `${uid}-listbox`; option ids `${uid}-option-${i}`.

- [ ] **Step 1: Write the failing tests** — create `src/renderer/spec-form/__tests__/field-search-combobox.test.tsx`. FieldSearch is tested directly (not through SpecForm) so the clamp regression can rerender with a shrunk `index` prop:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldSearch } from "../field-search";
import type { FieldSearchResult } from "../search-index";

function result(accessor: string, label: string): FieldSearchResult {
	return { accessor, label, tabIndex: 0, tabLabel: "General" };
}

const THREE: FieldSearchResult[] = [
	result("alpha", "Alpha field"),
	result("beta", "Alpha beta"),
	result("gamma", "Alpha gamma"),
];

function renderSearch(
	index: FieldSearchResult[],
	onJump: (r: FieldSearchResult) => void = () => {},
) {
	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldSearch
				index={index}
				placeholder="Find field…"
				noResultsLabel="No fields found"
				onJump={onJump}
			/>
		</ChakraProvider>,
	);
}

function input() {
	return screen.getByPlaceholderText("Find field…");
}

async function typeQuery(value: string) {
	fireEvent.change(input(), { target: { value } });
	// anker SearchInput debounces 300ms — wait for the dropdown.
	await waitFor(() => {
		expect(screen.getByRole("listbox")).toBeInTheDocument();
	});
}

describe("FieldSearch — combobox semantics", () => {
	it("wires role, expanded state, and controls linkage", async () => {
		renderSearch(THREE);
		const box = input();
		expect(box).toHaveAttribute("role", "combobox");
		expect(box).toHaveAttribute("aria-expanded", "false");
		expect(box).toHaveAttribute("aria-autocomplete", "list");
		expect(box).not.toHaveAttribute("aria-controls");

		await typeQuery("alpha");
		expect(box).toHaveAttribute("aria-expanded", "true");
		expect(box.getAttribute("aria-controls")).toBe(
			screen.getByRole("listbox").id,
		);
	});

	it("aria-activedescendant tracks the highlighted option through arrow keys", async () => {
		renderSearch(THREE);
		await typeQuery("alpha");
		const box = input();
		const options = screen.getAllByRole("option");

		expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
		expect(options[0]).toHaveAttribute("aria-selected", "true");

		fireEvent.keyDown(box, { key: "ArrowDown" });
		expect(box.getAttribute("aria-activedescendant")).toBe(options[1].id);
		expect(options[1]).toHaveAttribute("aria-selected", "true");
		expect(options[0]).toHaveAttribute("aria-selected", "false");

		fireEvent.keyDown(box, { key: "ArrowUp" });
		expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
	});

	it("clamps the highlight when the index prop shrinks mid-search (Enter still jumps)", async () => {
		const onJump = vi.fn();
		const { rerender } = renderSearch(THREE, onJump);
		await typeQuery("alpha");
		const box = input();

		fireEvent.keyDown(box, { key: "ArrowDown" });
		fireEvent.keyDown(box, { key: "ArrowDown" }); // highlighted = 2

		// Schema hot-swap: only one result remains, query text unchanged.
		rerender(
			<ChakraProvider value={defaultSystem}>
				<FieldSearch
					index={[result("alpha", "Alpha field")]}
					placeholder="Find field…"
					noResultsLabel="No fields found"
					onJump={onJump}
				/>
			</ChakraProvider>,
		);
		await waitFor(() => {
			expect(screen.getAllByRole("option")).toHaveLength(1);
		});
		// Pre-fix: highlighted (2) > last index (0) → Enter silently no-ops.
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onJump).toHaveBeenCalledWith(
			expect.objectContaining({ accessor: "alpha" }),
		);
	});

	it("clears aria-activedescendant when there are no results", async () => {
		renderSearch(THREE);
		fireEvent.change(input(), { target: { value: "zzz" } });
		await waitFor(() => {
			expect(screen.getByText("No fields found")).toBeInTheDocument();
		});
		expect(input()).not.toHaveAttribute("aria-activedescendant");
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/__tests__/field-search-combobox.test.tsx`
Expected: FAIL — no `role="combobox"` on the input, no ids/activedescendant, and the clamp test's Enter never calls `onJump`.

- [ ] **Step 3: Implement.** Replace the component body of `src/renderer/spec-form/field-search.tsx` with (imports gain `useCallback`, `useId`; everything else in the file stays):

```tsx
export function FieldSearch({
	index,
	placeholder,
	noResultsLabel,
	onJump,
}: FieldSearchProps) {
	const uid = useId();
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-option-${i}`;

	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const results = searchFields(index, query);
	const open = query.trim().length > 0;
	// Derived clamp: a schema hot-swap can shrink `results` while the query
	// (and the stale `highlighted` state) survive — deriving instead of
	// clamping in an effect means Enter can never point past the end, with
	// no render-timing window.
	const safeHighlighted = results.length
		? Math.min(highlighted, results.length - 1)
		: 0;

	const jump = (result: FieldSearchResult) => {
		setQuery("");
		onJump(result);
	};

	// Stable identity: anker SearchInput memoizes its debounce on
	// [onSearch, debounceMs] — an inline arrow would rebuild the debounce
	// (dropping a pending flush) on every parent re-render.
	const handleSearch = useCallback((q: string) => {
		setQuery(q);
		setHighlighted(0);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlighted(Math.min(safeHighlighted + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlighted(Math.max(safeHighlighted - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (results[safeHighlighted]) jump(results[safeHighlighted]);
		} else if (e.key === "Escape") {
			// Contain the key inside the dropdown: without this, Escape also
			// bubbles to ancestors — inside EditDrawer, Chakra's drawer closes
			// on Escape too, so dismissing search results would also lose
			// the drawer's in-progress edits.
			e.stopPropagation();
			setQuery("");
		}
	};

	return (
		<Box
			position="relative"
			maxWidth="64"
			data-testid="field-search"
			onKeyDown={handleKeyDown}
		>
			<SearchInput
				size="sm"
				placeholder={placeholder}
				onSearch={handleSearch}
				data-field-search-input
				role="combobox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={
					open && results.length ? optionId(safeHighlighted) : undefined
				}
			/>
			{open && (
				<Box
					id={listboxId}
					position="absolute"
					top="100%"
					right="0"
					mt="1"
					minWidth="64"
					bg="bg-surface"
					borderWidth="1px"
					borderColor="border"
					borderRadius="md"
					boxShadow="md"
					zIndex="dropdown"
					role="listbox"
				>
					{results.length === 0 ? (
						<Text px="3" py="2" fontSize="sm" color="fg.muted">
							{noResultsLabel}
						</Text>
					) : (
						results.map((result, i) => (
							<Box
								key={result.accessor}
								id={optionId(i)}
								role="option"
								aria-selected={i === safeHighlighted}
								px="3"
								py="2"
								fontSize="sm"
								display="flex"
								justifyContent="space-between"
								gap="3"
								cursor="pointer"
								bg={i === safeHighlighted ? "bg-muted" : undefined}
								_hover={{ bg: "bg-muted" }}
								onClick={() => jump(result)}
							>
								<Text>{result.label}</Text>
								<Text color="fg.muted">{result.tabLabel}</Text>
							</Box>
						))
					)}
				</Box>
			)}
		</Box>
	);
}
```

(Import line becomes `import { useCallback, useId, useState } from "react";`.)

- [ ] **Step 4: GREEN + neighbors**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/`
Expected: PASS including all pre-existing field-search/spec-form tests (behavior unchanged; the old `getByRole("listbox")` queries still match).

- [ ] **Step 5: Full gate**

```bash
cd ~/repo/fieldkit
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all three echo 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/spec-form/
git commit -m "fix(renderer): wire FieldSearch as an ARIA combobox with clamped highlight"
```

---

### Task 2: Tab indicator announcements (badge label + DirtyDot label + label keys)

**Files:**
- Modify: `src/renderer/spec-form/tab-error-badge.tsx`
- Modify: `src/renderer/spec-form/spec-form.tsx` (SpecFormLabels + DEFAULT_LABELS + tab trigger block ~lines 242-255)
- Modify: `src/editor/editor-canvas.tsx` (CanvasLabels optional block + TabErrorBadge call site ~line 788)
- Modify: `src/editor/spec-editor.tsx` (EditorLabels + DEFAULT_EDITOR_LABELS)
- Modify: `src/renderer/spec-form/spec-form.mdx`, `src/editor/spec-editor.mdx` (labels-table rows)
- Test: `src/renderer/spec-form/__tests__/tab-announcements.test.tsx` (new)

**Interfaces:**
- Consumes: `TabErrorBadge { index, count }` (internal, exactly two call sites); `DirtyDot` from `@knkcs/anker/atoms` with `label?: string` (default is German — that's the bug); test helpers `makeField`/`makeSection`/`Wrapper` from `src/renderer/spec-form/__tests__/helpers.tsx`.
- Produces: `TabErrorBadgeProps` gains **required** `label: string` (rendered as `aria-label`); `SpecFormLabels` gains `tabErrors?: string` (default `"{count} invalid fields"`) and `unsavedChanges?: string` (default `"Unsaved changes"`); `EditorLabels`/`CanvasLabels` gain `tabErrors?: string` only.

- [ ] **Step 1: Write the failing tests** — create `src/renderer/spec-form/__tests__/tab-announcements.test.tsx`. Error badges appear when a submitted form has errors; simpler and equivalent: drive the dirty path via a default-value edit and the error path via `useTabIndicators`' error source — but the cheapest reliable route is asserting on the badge/dot markup through SpecForm with a controlled harness. Since `TabErrorBadge` is pure, test it directly plus the DirtyDot label through SpecForm:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabErrorBadge } from "../tab-error-badge";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

describe("TabErrorBadge — accessible label", () => {
	it("carries the interpolated aria-label", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TabErrorBadge index={0} count={2} label="2 invalid fields" />
			</ChakraProvider>,
		);
		const badge = screen.getByTestId("tab-errors-0");
		expect(badge).toHaveAttribute("aria-label", "2 invalid fields");
		expect(badge).toHaveTextContent("2");
	});
});

describe("SpecForm — dirty tab announcement", () => {
	const schema = [
		makeField("title", "Title"),
		makeSection("seo", "SEO"),
		makeField("meta", "Meta description"),
	];

	it("labels the dirty dot in English by default", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "changed" },
		});
		expect(await screen.findByLabelText("Unsaved changes")).toBeInTheDocument();
	});

	it("labels.unsavedChanges overrides the dirty-dot label", async () => {
		render(
			<Wrapper>
				<SpecForm
					schema={schema}
					labels={{ unsavedChanges: "Nicht gespeichert" }}
				/>
			</Wrapper>,
		);
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "changed" },
		});
		expect(
			await screen.findByLabelText("Nicht gespeichert"),
		).toBeInTheDocument();
	});
});
```

Note: the dirty-dot path assumes `useTabIndicators` marks a tab dirty when a field on it is edited (that is its job) and the helpers' `TestField` registers by accessor with `aria-label={config.name}` — both hold in the existing harness. If `findByLabelText("Unsaved changes")` proves flaky because RHF dirty-state needs a tick, wrap the change in `await act(async () => …)` as the existing dirty tests do.

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/__tests__/tab-announcements.test.tsx`
Expected: FAIL — `label` is not a TabErrorBadge prop (TS error), and the dirty dot's aria-label is the German anker default, not "Unsaved changes".

- [ ] **Step 3: Implement.**

`src/renderer/spec-form/tab-error-badge.tsx` — props and span:

```tsx
export interface TabErrorBadgeProps {
	index: number;
	count: number;
	/** Accessible name for the badge (count already interpolated), e.g.
	 * "2 invalid fields" — replaces the bare number in the tab's
	 * accessible-name computation. */
	label: string;
}
```

and on the `Box`: add `aria-label={label}` (destructure `label` alongside `index`/`count`).

`src/renderer/spec-form/spec-form.tsx`:

```ts
export interface SpecFormLabels {
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
	/** §10 optional marker shown after non-required labels when the form
	 * is mostly required. */
	optionalMarker?: string;
	/** Accessible name for a tab's error badge; "{count}" interpolated. */
	tabErrors?: string;
	/** Accessible name for a tab's dirty dot. */
	unsavedChanges?: string;
}
```

`DEFAULT_LABELS` gains:

```ts
	tabErrors: "{count} invalid fields",
	unsavedChanges: "Unsaved changes",
```

Tab trigger block (SpecFormTabs) — pass both:

```tsx
			{indicators[i].errorCount > 0 ? (
				<TabErrorBadge
					index={i}
					count={indicators[i].errorCount}
					label={labels.tabErrors.replace(
						"{count}",
						String(indicators[i].errorCount),
					)}
				/>
			) : (
				indicators[i].dirty && (
					<Box as="span" data-testid={`tab-dirty-${i}`} ml="1.5">
						<DirtyDot label={labels.unsavedChanges} />
					</Box>
				)
			)}
```

`src/editor/spec-editor.tsx` — `EditorLabels` gains (near `defaultTab`/`searchPlaceholder`/`noResults`):

```ts
	/** Accessible name for a canvas tab's error badge; "{count}" interpolated. */
	tabErrors?: string;
```

`DEFAULT_EDITOR_LABELS` gains `tabErrors: "{count} invalid fields",`.

`src/editor/editor-canvas.tsx` — `CanvasLabels`'s OPTIONAL trailing block gains:

```ts
	/** Accessible name for a tab's error badge; "{count}" interpolated;
	 * falls back to "{count} invalid fields". */
	tabErrors?: string;
```

and the `TabErrorBadge` call site (~line 788) becomes:

```tsx
														{tabErrorCounts[i] > 0 && (
															<TabErrorBadge
																index={i}
																count={tabErrorCounts[i]}
																label={(labels.tabErrors ?? "{count} invalid fields").replace(
																	"{count}",
																	String(tabErrorCounts[i]),
																)}
															/>
														)}
```

- [ ] **Step 4: GREEN**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/ src/editor/`
Expected: PASS, including existing editor validation-surfacing tests (the badge keeps its testid and visible count).

- [ ] **Step 5: Docs.** `spec-form.mdx` labels table: rows for `tabErrors` (`"{count} invalid fields"` — accessible name of a tab's error badge) and `unsavedChanges` (`"Unsaved changes"` — accessible name of a tab's dirty dot). `spec-editor.mdx` labels table: row for `tabErrors` (same default, canvas tab badges).

- [ ] **Step 6: Full gate**

```bash
cd ~/repo/fieldkit
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all three echo 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ src/editor/
git commit -m "fix: accessible labels for tab error badges and dirty dots (#25)"
```

---

## Controller work (after Task 2)

1. **File the anker issue** (fieldkit-only scope guard): anker `FormField`'s per-field inline dirty dot hardcodes `aria-label="ungespeicherte Änderung"` (`src/forms/form-field.tsx:91`) with no prop to change it — this is what #148 was actually about before it was closed against the standalone `DirtyDot` atom (which does have `label`). Propose a `dirtyLabel?: string` prop (or an English default) on `FormField`/wrappers.
2. **Runtime verification** (Storybook, Playwright): keyboard pass on the SpecForm search — type, arrows move highlight, Enter jumps cross-tab, Escape closes without bubbling; inspect the accessibility tree of the input (combobox/expanded/activedescendant) and of a badged tab (name contains "invalid fields").
3. Final whole-branch review → merge → `chore: v0.3.2` → tag → publish → GH release → close #25.
