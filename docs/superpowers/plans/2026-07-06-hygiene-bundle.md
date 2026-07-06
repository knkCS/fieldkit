# Hygiene Bundle Implementation Plan (anker 3.2.0 + fieldkit 0.4.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anker 3.2.0 makes the per-field dirty dot configurable (via `FormMarkers`), flips the three German dirty-state defaults to English, and gives `SearchInput` a `clear()/focus()` ref handle; fieldkit 0.4.0 hardens its label merges, threads the dirty label, pluralizes the badge label, names the search input, and announces the empty state — closing anker#149, fieldkit#32, fieldkit#33.

**Architecture:** `dirtyLabel` resolves prop → `FormMarkers` context → English default, so fieldkit's existing per-form provider labels every field dot with zero per-field changes. `SearchInputHandle.clear()` operates on the uncontrolled DOM input (no state refactor). fieldkit gains one shared `mergeLabels`/`formatCount` module adopted by all label merges.

**Tech Stack:** React contexts + `useImperativeHandle`, lodash.debounce (existing), Vitest/RTL (fake timers for the debounce test).

**Spec:** `docs/superpowers/specs/2026-07-06-hygiene-bundle-design.md` (fieldkit repo)

## Global Constraints

- **Two repos.** Tasks 1–2 in `~/repo/anker`; Tasks 3–4 in `~/repo/fieldkit`. **HARD GATE between Task 2 and Task 3:** anker 3.2.0 merged, tagged, published (controller work).
- Default strings EXACTLY: dirty dot / DirtyDot `"Unsaved changes"`; DirtyCounter `"{count} unsaved changes"`; fieldkit `tabErrorsOne: "1 invalid field"`, `searchLabel: "Find field"`.
- `dirtyLabel` resolution per value: explicit prop → `FormMarkers` context → default. A field's dot markup is otherwise unchanged.
- `SearchInput` stays uncontrolled; the handle is additive (existing consumers unaffected). `clear()` = empty the DOM input + cancel pending debounce + `onSearch("")` exactly once.
- fieldkit devDependency `@knkcs/anker` → `^3.2.0`; **peerDependencies stay `"^3.1.0"`** (graceful degrade: 3.1 ignores the unknown context key; FieldSearch keeps `setQuery("")` beside the guarded `clear()`).
- fieldkit ships **0.4.0** (controller bumps at release). anker ships **3.2.0**.
- Gates with REAL exit codes (log file + `echo $?`; never pipe a gate into tail/head) — anker: test/typecheck/lint/verify-exports; fieldkit: test/typecheck/lint.
- Conventional Commits: anker scope `forms`/`atoms`; fieldkit scopes `renderer`/`editor` or none for cross-cutting.

---

### Task 1: anker — dirtyLabel via FormMarkers + English dirty-state defaults

**Repo:** `~/repo/anker`

**Files:**
- Modify: `src/forms/form-markers.tsx` (FormMarkers + useFormMarkers hook)
- Modify: `src/forms/form-field.tsx` (prop + resolution + aria-label, dot block at lines ~96-107)
- Modify: `src/atoms/dirty-dot/dirty-dot.tsx` (default at line 15, doc at line 7)
- Modify: `src/forms/dirty-counter.tsx` (default at line 16, doc at line 8)
- Modify: every test asserting the old German defaults (grep `ungespeicherte` across `src/` — at minimum `src/atoms/dirty-dot/dirty-dot.test.tsx:13-15` and the `*.dirty.test.tsx` files in `src/forms/` that use `getByLabelText("ungespeicherte Änderung")`)
- Test: `src/forms/form-field.dirtylabel.test.tsx` (new)

**Interfaces:**
- Consumes: existing `FormMarkersContext` (module-private), `FieldLabelMarkers`.
- Produces (Tasks 3–4 rely on): `FormMarkers` gains `dirtyLabel?: string`; `FormFieldProps` gains `dirtyLabel?: string` (auto-forwarded by the 13 wrappers via `...rest`); module-internal `useFormMarkers(): FormMarkers` (NOT in the barrel).

- [ ] **Step 1: Write the failing tests** — create `src/forms/form-field.dirtylabel.test.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FormMarkersProvider } from "./form-markers";
import { InputField } from "./input-field";

function Harness({
	dirtyLabel,
	providerLabel,
}: {
	dirtyLabel?: string;
	providerLabel?: string;
}) {
	const form = useForm({ defaultValues: { name: "alpha" } });
	useEffect(() => {
		form.setValue("name", "beta", { shouldDirty: true });
	}, [form]);
	const field = (
		<InputField name="name" label="Name" dirtyLabel={dirtyLabel} />
	);
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...form}>
				{providerLabel ? (
					<FormMarkersProvider value={{ dirtyLabel: providerLabel }}>
						{field}
					</FormMarkersProvider>
				) : (
					field
				)}
			</FormProvider>
		</ChakraProvider>
	);
}

describe("FormField — dirty dot label", () => {
	it("defaults to English", () => {
		render(<Harness />);
		expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
	});

	it("takes the form-level default from FormMarkersProvider", () => {
		render(<Harness providerLabel="Nicht gespeichert" />);
		expect(screen.getByLabelText("Nicht gespeichert")).toBeInTheDocument();
	});

	it("explicit prop beats the provider", () => {
		render(<Harness providerLabel="Nicht gespeichert" dirtyLabel="Draft" />);
		expect(screen.getByLabelText("Draft")).toBeInTheDocument();
		expect(screen.queryByLabelText("Nicht gespeichert")).toBeNull();
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/forms/form-field.dirtylabel.test.tsx`
Expected: FAIL — `dirtyLabel` not a prop; dot labeled with the German string.

- [ ] **Step 3: Implement.**

`src/forms/form-markers.tsx` — extend the interface and add the hook (also refactor `FieldLabelMarkers` to use it instead of its inline `useContext`):

```ts
export interface FormMarkers {
	/** Appended after the label in muted color when the field is NOT required. */
	optionalText?: React.ReactNode;
	/** When false, suppresses the required asterisk. @default true */
	showRequiredIndicator?: boolean;
	/** aria-label default for the per-field dirty dot. @default "Unsaved changes" */
	dirtyLabel?: string;
}

/** Internal: read the form-level marker defaults. Not exported from the barrel. */
export function useFormMarkers(): FormMarkers {
	return useContext(FormMarkersContext);
}
```

`src/forms/form-field.tsx`:
- Props interface gains (after `showRequiredIndicator`):

```ts
	/** aria-label for the per-field dirty dot. Form-level default via
	 * `FormMarkersProvider`. @default "Unsaved changes" */
	dirtyLabel?: string;
```

- Destructure `dirtyLabel,`; import `useFormMarkers` alongside `FieldLabelMarkers`; at the top of the component body:

```ts
	const contextMarkers = useFormMarkers();
	const resolvedDirtyLabel =
		dirtyLabel ?? contextMarkers.dirtyLabel ?? "Unsaved changes";
```

- The dot's `aria-label="ungespeicherte Änderung"` becomes `aria-label={resolvedDirtyLabel}`.

`src/atoms/dirty-dot/dirty-dot.tsx`: default `label = "Unsaved changes"` and doc comment `@default "Unsaved changes"`.

`src/forms/dirty-counter.tsx`: default `label = "{count} unsaved changes"` and doc comment `@default "{count} unsaved changes"`.

- [ ] **Step 4: Update German-default assertions.** `grep -rn "ungespeicherte" src/` — update every test hit to the new defaults (e.g. `dirty-dot.test.tsx` expects `"Unsaved changes"`; the `*.dirty.test.tsx` files query `getByLabelText("Unsaved changes")`). These are spec-mandated default changes — say so in your report. After this step the grep must return ZERO hits in `src/` outside doc/changelog prose.

- [ ] **Step 5: GREEN + full gate**

```bash
cd ~/repo/anker
npx vitest run src/forms/ src/atoms/
npm run test > /tmp/anker-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/anker-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/anker-gate.log 2>&1; echo "LINT=$?"
npm run verify-exports >> /tmp/anker-gate.log 2>&1; echo "VE=$?"
```
Expected: all echo 0.

- [ ] **Step 6: Commit**

```bash
git add src/forms/ src/atoms/
git commit -m "feat(forms): configurable dirty-dot label; English dirty defaults"
```

---

### Task 2: anker — SearchInput ref handle + docs + 3.2.0

**Repo:** `~/repo/anker`

**Files:**
- Modify: `src/forms/search-input.tsx`
- Modify: `src/forms/index.ts` (export the handle type beside SearchInput)
- Modify: `CHANGELOG.md` (3.2.0 section above `## 3.1.1 — 2026-07-06`)
- Modify: `CLAUDE-ANKER.md` (forms/markers bullets)
- Modify: `package.json` (version 3.2.0) + `package-lock.json` (sync)
- Test: `src/forms/search-input.handle.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `FormMarkers.dirtyLabel` (docs mention only).
- Produces (Task 4 relies on): `export interface SearchInputHandle { clear: () => void; focus: () => void }`; `SearchInputProps` gains `ref?: React.Ref<SearchInputHandle>` (and its `Omit<InputProps, …>` additionally omits `"ref"`).

- [ ] **Step 1: Write the failing tests** — create `src/forms/search-input.handle.test.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput, type SearchInputHandle } from "./search-input";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

function renderWithHandle(onSearch: (q: string) => void) {
	const ref = createRef<SearchInputHandle>();
	render(
		<ChakraProvider value={defaultSystem}>
			<SearchInput ref={ref} onSearch={onSearch} placeholder="Search…" />
		</ChakraProvider>,
	);
	return ref;
}

describe("SearchInput — ref handle", () => {
	it("clear() empties the input, cancels the pending debounce, and emits onSearch('') once", () => {
		const onSearch = vi.fn();
		const ref = renderWithHandle(onSearch);
		const input = screen.getByPlaceholderText("Search…") as HTMLInputElement;

		fireEvent.change(input, { target: { value: "abc" } });
		// Debounce (300ms) has not fired yet.
		expect(onSearch).not.toHaveBeenCalled();

		act(() => {
			ref.current?.clear();
		});
		expect(input.value).toBe("");
		expect(onSearch).toHaveBeenCalledTimes(1);
		expect(onSearch).toHaveBeenCalledWith("");

		// The pending "abc" flush must have been cancelled.
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it("focus() focuses the input", () => {
		const ref = renderWithHandle(() => {});
		act(() => {
			ref.current?.focus();
		});
		expect(screen.getByPlaceholderText("Search…")).toHaveFocus();
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/forms/search-input.handle.test.tsx`
Expected: FAIL — `SearchInputHandle` not exported / ref ignored.

- [ ] **Step 3: Implement** in `src/forms/search-input.tsx`.

Add to the react import: `useImperativeHandle`, `useRef`. Above the props interface:

```ts
export interface SearchInputHandle {
	/** Empty the input, cancel any pending debounced flush, and emit onSearch(""). */
	clear: () => void;
	/** Focus the underlying input element. */
	focus: () => void;
}
```

Change the props interface's `Omit` to also drop `"ref"`, and add the ref prop:

```ts
export interface SearchInputProps
	extends Omit<InputProps, "onChange" | "defaultValue" | "ref"> {
	/** Imperative handle for programmatic clear/focus (React 19 ref-as-prop). */
	ref?: React.Ref<SearchInputHandle>;
	// …existing members unchanged
```

In the component: destructure `ref,` out of props (before `...restProps`), then:

```ts
	const inputRef = useRef<HTMLInputElement>(null);
	useImperativeHandle(
		ref,
		() => ({
			clear: () => {
				if (inputRef.current) inputRef.current.value = "";
				debouncedSearch.cancel();
				onSearch("");
			},
			focus: () => inputRef.current?.focus(),
		}),
		[debouncedSearch, onSearch],
	);
```

and pass `ref={inputRef}` to the inner `<Input>`. Everything else (debounce, handleChange, uncontrolled `defaultValue`) stays byte-identical.

`src/forms/index.ts`: extend the SearchInput export with `type SearchInputHandle`.

- [ ] **Step 4: GREEN**

Run: `cd ~/repo/anker && npx vitest run src/forms/search-input.handle.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Docs + version.**

`CHANGELOG.md` — insert directly above `## 3.1.1 — 2026-07-06`:

```md
## 3.2.0 — 2026-07-06

### Added

- **Configurable per-field dirty-dot label** (#149): `FormField` gains
  `dirtyLabel?: string` (forwarded by all field wrappers), and
  `FormMarkersProvider`'s `FormMarkers` gains `dirtyLabel` as the
  form-level default — resolution: prop → provider → default.
- **`SearchInputHandle`**: `SearchInput` accepts a `ref` exposing
  `clear()` (empties the input, cancels the pending debounce, emits
  `onSearch("")`) and `focus()`.

### Changed

- **Dirty-state announcement defaults are now English**: the FormField
  per-field dot says `"Unsaved changes"` (was hardcoded German),
  `DirtyDot` defaults to `"Unsaved changes"`, `DirtyCounter` to
  `"{count} unsaved changes"`. Apps wanting German pass `label`/
  `dirtyLabel` or the `FormMarkersProvider` default.
```

`CLAUDE-ANKER.md` — in the Form fields section (added in 3.1.0), extend the markers bullet: `FormMarkersProvider` also carries `dirtyLabel` (per-field dirty-dot aria-label, default "Unsaved changes"); add a bullet for `SearchInput`'s `SearchInputHandle` ref (`clear()`/`focus()`).

`package.json`: `"version": "3.2.0"`, then `npm install --package-lock-only`.

- [ ] **Step 6: Full gate** (same four commands/log pattern as Task 1 Step 5). Expected: all 0.

- [ ] **Step 7: Commit**

```bash
git add src/forms/ CHANGELOG.md CLAUDE-ANKER.md package.json package-lock.json
git commit -m "feat(forms): SearchInput ref handle; docs and 3.2.0 bump"
```

---

> **HARD GATE — controller work:** merge anker to main, push, tag
> `v3.2.0` (CI publishes), verify `npm view @knkcs/anker version` →
> `3.2.0`, close #149. Only then start Task 3.

---

### Task 3: fieldkit — mergeLabels/formatCount + adoption + SpecForm dirty threading

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `package.json` devDependencies `"@knkcs/anker": "^3.2.0"` (peer stays `"^3.1.0"`) + lockfile via `npm install`
- Create: `src/renderer/merge-labels.ts`
- Modify: `src/renderer/spec-form/spec-form.tsx` (resolvedLabels at ~line 422; markers memo)
- Modify: `src/editor/spec-editor.tsx` (mergedLabels at ~line 271)
- Modify: `src/editor/type-picker.tsx` (scalar label keys at ~lines 118-123)
- Modify: `src/editor/try-it-view.tsx` (restore plain forwarding)
- Test: `src/renderer/__tests__/merge-labels.test.ts` (new; create the dir) + extend `src/renderer/spec-form/__tests__/marker-convention.test.tsx`

**Interfaces:**
- Consumes: anker 3.2.0's `FormMarkers.dirtyLabel` (via npm); existing `SpecFormLabels.unsavedChanges`.
- Produces (Task 4 relies on): `export function mergeLabels<T extends object>(defaults: Required<T>, overrides?: T): Required<T>` and `export function formatCount(one: string, many: string, count: number): string` from `src/renderer/merge-labels.ts`.

- [ ] **Step 1: Bump devDep** — `"@knkcs/anker": "^3.2.0"` in devDependencies only; `cd ~/repo/fieldkit && npm install && npm ls @knkcs/anker` (expect 3.2.0).

- [ ] **Step 2: Write the failing tests.**

Create `src/renderer/__tests__/merge-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCount, mergeLabels } from "../merge-labels";

interface Labels {
	a?: string;
	b?: string;
}
const DEFAULTS: Required<Labels> = { a: "default-a", b: "default-b" };

describe("mergeLabels", () => {
	it("returns the defaults when overrides are absent", () => {
		expect(mergeLabels(DEFAULTS, undefined)).toEqual(DEFAULTS);
	});

	it("lets defined overrides win", () => {
		expect(mergeLabels(DEFAULTS, { a: "x" })).toEqual({
			a: "x",
			b: "default-b",
		});
	});

	it("ignores explicit-undefined keys instead of clobbering defaults", () => {
		expect(mergeLabels(DEFAULTS, { a: undefined, b: "y" })).toEqual({
			a: "default-a",
			b: "y",
		});
	});

	it("does not mutate the defaults object", () => {
		const before = { ...DEFAULTS };
		mergeLabels(DEFAULTS, { a: "x" });
		expect(DEFAULTS).toEqual(before);
	});
});

describe("formatCount", () => {
	it("uses the singular form at exactly 1", () => {
		expect(formatCount("1 invalid field", "{count} invalid fields", 1)).toBe(
			"1 invalid field",
		);
	});

	it("interpolates the plural form otherwise", () => {
		expect(formatCount("1 invalid field", "{count} invalid fields", 2)).toBe(
			"2 invalid fields",
		);
		expect(formatCount("1 invalid field", "{count} invalid fields", 0)).toBe(
			"0 invalid fields",
		);
	});
});
```

Append to `src/renderer/spec-form/__tests__/marker-convention.test.tsx` (uses its existing `RealWrapper`/`textField` helpers and `fireEvent` — add the import if missing):

```tsx
	it("labels the per-field dirty dot in English by default", async () => {
		render(
			<RealWrapper>
				<SpecForm schema={[textField("a", false)]} />
			</RealWrapper>,
		);
		fireEvent.change(screen.getByLabelText(/^a/), {
			target: { value: "changed" },
		});
		expect(await screen.findByLabelText("Unsaved changes")).toBeInTheDocument();
	});

	it("labels.unsavedChanges reaches the per-field dirty dot", async () => {
		render(
			<RealWrapper>
				<SpecForm
					schema={[textField("a", false)]}
					labels={{ unsavedChanges: "Nicht gespeichert" }}
				/>
			</RealWrapper>,
		);
		fireEvent.change(screen.getByLabelText(/^a/), {
			target: { value: "changed" },
		});
		expect(
			await screen.findByLabelText("Nicht gespeichert"),
		).toBeInTheDocument();
	});
```

(Label query note: anker `InputField` labels are associated via `Field.Label htmlFor` → `getByLabelText(/^a/)` targets the input whose label text starts with the accessor name; if the harness's label association proves unreliable, query the input via `getByPlaceholderText`/role instead — the assertion that matters is the `findByLabelText` on the DOT.)

- [ ] **Step 3: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/__tests__/merge-labels.test.ts src/renderer/spec-form/__tests__/marker-convention.test.tsx`
Expected: merge-labels FAILS (module missing); the dirty-dot tests FAIL (dot still announces anker's default only when no provider value is set — with the provider present but no dirtyLabel key, 3.2.0's own English default applies, so the FIRST dirty test may already pass; the override test must fail).

- [ ] **Step 4: Create `src/renderer/merge-labels.ts`**

```ts
// src/renderer/merge-labels.ts

/**
 * Merge label overrides over their defaults, IGNORING keys whose value
 * is explicitly `undefined` — a plain `{ ...defaults, ...overrides }`
 * lets such keys clobber the default (the recurring TryItView bug,
 * fieldkit#32). Returns a fresh object; never mutates `defaults`.
 */
export function mergeLabels<T extends object>(
	defaults: Required<T>,
	overrides?: T,
): Required<T> {
	const merged = { ...defaults };
	if (!overrides) return merged;
	for (const key of Object.keys(overrides) as (keyof T)[]) {
		const value = overrides[key];
		if (value !== undefined) {
			(merged as T)[key] = value;
		}
	}
	return merged;
}

/**
 * Count-aware label pick: the singular form at exactly 1, otherwise the
 * plural template with `{count}` interpolated.
 */
export function formatCount(one: string, many: string, count: number): string {
	return count === 1 ? one : many.replace("{count}", String(count));
}
```

- [ ] **Step 5: Adopt it.**

`src/renderer/spec-form/spec-form.tsx`:
- `import { mergeLabels } from "../merge-labels";`
- Line ~422: `const resolvedLabels = mergeLabels(DEFAULT_LABELS, labels);`
- The `markers` memo carries `dirtyLabel` in BOTH branches:

```ts
	const markers = useMemo<FormMarkers>(
		() =>
			convention === "optional-text"
				? {
						showRequiredIndicator: false,
						optionalText: resolvedLabels.optionalMarker,
						dirtyLabel: resolvedLabels.unsavedChanges,
					}
				: { dirtyLabel: resolvedLabels.unsavedChanges },
		[convention, resolvedLabels.optionalMarker, resolvedLabels.unsavedChanges],
	);
```

`src/editor/spec-editor.tsx` (~line 271): `mergedLabels = useMemo(() => mergeLabels(DEFAULT_EDITOR_LABELS, labels), [labels]);` (import from `../renderer/merge-labels`).

`src/editor/type-picker.tsx` (~lines 118-124): replace the four scalar `??` lines with `...mergeLabels(...)`, keeping the nested categories merge:

```ts
	const l = {
		...mergeLabels(DEFAULT_TYPE_PICKER_LABELS, labels),
		categories: {
			...DEFAULT_TYPE_PICKER_LABELS.categories,
			...labels?.categories,
		},
	};
```

`src/editor/try-it-view.tsx`: replace the whole conditional-spread `labels={{ … }}` object with plain forwarding (SpecForm's merge now ignores undefined):

```tsx
					labels={{
						defaultTab: labels.defaultTab,
						searchPlaceholder: labels.searchPlaceholder,
						noResults: labels.noResults,
						optionalMarker: labels.optionalMarker,
						tabErrors: labels.tabErrors,
					}}
```

(The existing canvas-markers test "falls back to SpecForm defaults for omitted labels" is the regression proof that this simplification is safe — it must stay green.)

- [ ] **Step 6: GREEN + full gate**

```bash
cd ~/repo/fieldkit
npx vitest run src/renderer/ src/editor/
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all 0, including the pre-existing TryItView fallback test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer/ src/editor/
git commit -m "feat(renderer): mergeLabels hardening; dirty-dot label threading (#32)"
```

---

### Task 4: fieldkit — FieldSearch polish, pluralization, new label keys, docs

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `src/renderer/spec-form/spec-form.tsx` (SpecFormLabels + DEFAULT_LABELS + FieldSearch call sites ~226/~359 + badge call site)
- Modify: `src/renderer/spec-form/field-search.tsx` (label prop, ref/clear, empty-state restructure)
- Modify: `src/editor/spec-editor.tsx` (EditorLabels + defaults + TryItView passthrough)
- Modify: `src/editor/editor-canvas.tsx` (CanvasLabels + FieldSearch call site ~828 + badge call site + markers memo dirtyLabel)
- Modify: `src/editor/try-it-view.tsx` (forward the new keys)
- Modify: `src/renderer/spec-form/spec-form.mdx`, `src/editor/spec-editor.mdx` (label rows + prose)
- Test: extend `src/renderer/spec-form/__tests__/field-search-combobox.test.tsx` and `src/renderer/spec-form/__tests__/tab-announcements.test.tsx`; update count-1 badge assertions in `src/renderer/spec-form/__tests__/spec-form-submit-jump.test.tsx`, `src/editor/__tests__/validation-surfacing.test.tsx`, `src/editor/__tests__/try-it.test.tsx`

**Interfaces:**
- Consumes: Task 3's `mergeLabels`/`formatCount`; anker 3.2.0's `SearchInputHandle` from `@knkcs/anker/forms`.
- Produces: `SpecFormLabels` gains `searchLabel?: string` (default `"Find field"`) and `tabErrorsOne?: string` (default `"1 invalid field"`); `EditorLabels` gains `searchLabel`, `tabErrorsOne`, `unsavedChanges` (same defaults / `"Unsaved changes"`); `FieldSearchProps` gains `label: string`.

- [ ] **Step 1: Write/adjust the failing tests.**

Extend `field-search-combobox.test.tsx` — `renderSearch` gains `label="Find field"` on its `<FieldSearch>` (the prop is required; update every render in the file), then append:

```tsx
	it("uses the label prop as the input's accessible name", async () => {
		renderSearch(THREE);
		expect(screen.getByLabelText("Find field")).toBe(input());
	});

	it("announces the empty state and keeps the listbox mounted", async () => {
		renderSearch(THREE);
		fireEvent.change(input(), { target: { value: "zzz" } });
		await waitFor(() => {
			expect(screen.getByText("No fields found")).toBeInTheDocument();
		});
		// The no-results text lives OUTSIDE the listbox, in a status region…
		expect(screen.getByRole("status")).toHaveTextContent("No fields found");
		// …while the (empty) listbox stays mounted so aria-controls stays valid.
		const listbox = screen.getByRole("listbox");
		expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(0);
		expect(input().getAttribute("aria-controls")).toBe(listbox.id);
	});

	it("clears the visible input text after a jump", async () => {
		const onJump = vi.fn();
		renderSearch(THREE, onJump);
		await typeQuery("alpha");
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onJump).toHaveBeenCalled();
		expect((input() as HTMLInputElement).value).toBe("");
	});
```

Extend `tab-announcements.test.tsx` (badge unit — singular):

```tsx
	it("uses the singular label at count 1 (via formatCount at the call sites)", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TabErrorBadge index={0} count={1} label="1 invalid field" />
			</ChakraProvider>,
		);
		expect(screen.getByTestId("tab-errors-0")).toHaveAttribute(
			"aria-label",
			"1 invalid field",
		);
	});
```

Update the existing count-1 assertions to the singular default: `spec-form-submit-jump.test.tsx` and `validation-surfacing.test.tsx` (`"1 invalid fields"` → `"1 invalid field"` where count is 1; leave any count≥2 assertions plural), and `try-it.test.tsx`'s German override — pass `tabErrorsOne: "1 ungültiges Feld"` alongside `tabErrors` and expect `"1 ungültiges Feld"`.

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/ src/editor/__tests__/validation-surfacing.test.tsx src/editor/__tests__/try-it.test.tsx`
Expected: FAIL — `label` not a FieldSearch prop (TS), no `role="status"`, input text lingers after jump, count-1 badges still read "1 invalid fields".

- [ ] **Step 3: Implement FieldSearch** (`src/renderer/spec-form/field-search.tsx`):

- Props gain `/** Accessible name for the search input. */ label: string;` (destructure it).
- Imports: `import { SearchInput, type SearchInputHandle } from "@knkcs/anker/forms";`, add `useRef` to the react import.
- `const searchRef = useRef<SearchInputHandle>(null);`
- `jump()` becomes:

```ts
	const jump = (result: FieldSearchResult) => {
		setQuery("");
		// Also clear the visible text (anker ≥3.2; harmless no-op ref on 3.1).
		searchRef.current?.clear();
		onJump(result);
	};
```

- The Escape branch adds `searchRef.current?.clear();` after `setQuery("");`.
- `<SearchInput>` gains `ref={searchRef}` and `aria-label={label}`.
- Dropdown restructure — the positioned Box becomes a plain container; the listbox is an inner element holding ONLY options; the empty state is a status sibling:

```tsx
			{open && (
				<Box
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
				>
					<Box id={listboxId} role="listbox">
						{results.map((result, i) => (
							/* option rows unchanged */
						))}
					</Box>
					{results.length === 0 && (
						<Text
							role="status"
							px="3"
							py="2"
							fontSize="sm"
							color="fg.muted"
						>
							{noResultsLabel}
						</Text>
					)}
				</Box>
			)}
```

(Note `clear()` fires `onSearch("")` → `handleSearch` → `setQuery("")` again — idempotent by design; keep the explicit `setQuery("")` for anker 3.1 degrade.)

- [ ] **Step 4: Labels + call sites.**

`spec-form.tsx`:
- `SpecFormLabels` gains:

```ts
	/** Accessible name for the field-search input. */
	searchLabel?: string;
	/** Accessible name for a tab's error badge at count 1. */
	tabErrorsOne?: string;
```

- `DEFAULT_LABELS` gains `searchLabel: "Find field",` and `tabErrorsOne: "1 invalid field",`.
- Both `<FieldSearch` call sites (~226, ~359) gain `label={labels.searchLabel}`.
- The badge call site switches to `import { formatCount } from "../merge-labels";` and:

```tsx
					label={formatCount(
						labels.tabErrorsOne,
						labels.tabErrors,
						indicators[i].errorCount,
					)}
```

`spec-editor.tsx`:
- `EditorLabels` gains `searchLabel?: string;`, `tabErrorsOne?: string;`, and `/** aria-label for per-field + tab dirty dots (canvas/Try-it); the header dot uses `dirty`. */ unsavedChanges?: string;`
- `DEFAULT_EDITOR_LABELS` gains `searchLabel: "Find field",`, `tabErrorsOne: "1 invalid field",`, `unsavedChanges: "Unsaved changes",`.
- The `<TryItView labels={{ … }}>` object gains `searchLabel: mergedLabels.searchLabel,`, `tabErrorsOne: mergedLabels.tabErrorsOne,`, `unsavedChanges: mergedLabels.unsavedChanges,`.

`try-it-view.tsx`: `TryItViewProps["labels"]` gains `searchLabel?: string; tabErrorsOne?: string; unsavedChanges?: string;`, and the SpecForm labels object forwards them plainly (`searchLabel: labels.searchLabel,` etc. — Task 3 made plain forwarding safe).

`editor-canvas.tsx`:
- `CanvasLabels` optional block gains `searchLabel?: string;`, `tabErrorsOne?: string;`, `unsavedChanges?: string;` (doc comments matching the type-picker block's style).
- The `<FieldSearch` call site (~828) gains `label={labels.searchLabel ?? "Find field"}`.
- The badge call site switches to `formatCount(labels.tabErrorsOne ?? "1 invalid field", labels.tabErrors ?? "{count} invalid fields", tabErrorCounts[i])` (import from `../renderer/merge-labels`).
- The `markers` memo carries `dirtyLabel: labels.unsavedChanges ?? "Unsaved changes"` in BOTH branches (deps updated accordingly).

- [ ] **Step 5: GREEN**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/ src/editor/`
Expected: PASS.

- [ ] **Step 6: Docs.** `spec-form.mdx`: label rows for `searchLabel` (`"Find field"`) and `tabErrorsOne` (`"1 invalid field"`); update the prose enumeration sentence to include both; note the anker ≥3.2 pairing for the input-clear and per-field dot label (graceful on 3.1). `spec-editor.mdx`: rows for `searchLabel`, `tabErrorsOne`, `unsavedChanges` (canvas/Try-it dots; `dirty` remains the header dot).

- [ ] **Step 7: Full gate** (same three commands/log pattern). Expected: all 0.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/ src/editor/
git commit -m "feat: search label, singular badge, empty-state status, input clear (#33)"
```

---

## Runtime verification (controller, after Task 4)

fieldkit Storybook via Playwright: dirty a SpecForm field → the per-field dot's aria-label is "Unsaved changes" in the AX tree; search a non-match → a status element announces "No fields found" while the combobox stays expanded; Enter on a match → input text visibly clears; a single-error tab announces "1 invalid field".

## Release sequencing (controller)

- After Task 2: merge → tag `v3.2.0` in anker → CI publishes → verify npm → GH release → close anker#149.
- After Task 4 + final review: merge fieldkit → `chore: v0.4.0` (+ lock sync) → tag `v0.4.0` → CI publishes → GH release naming the 3.2.0 pairing → close #32 and #33.
