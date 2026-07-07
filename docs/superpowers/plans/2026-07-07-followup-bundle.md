# Follow-up Bundle Implementation Plan (anker 4.0.0 + fieldkit 0.5.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anker 4.0.0 fixes the dropped `name` attribute and the discarded RHF `field.ref` (restoring focus-on-error suite-wide) and raises the react peer floor to `>=19` (#150, #151); fieldkit 0.5.0 fixes the drill-frame rename-follow indexing (#35) and follows the peer moves — fresh releases for the upcoming mediahub bump.

**Architecture:** One anker task for the behavior fixes (TextInput `name`, per-wrapper `mergeRefs(field.ref, ref)`) with tests that prove RHF registration; a second anker task for the peer floor + docs + version; a fieldkit task for the frame-indexing fix + dependency truth-following.

**Tech Stack:** React 19, react-hook-form, Chakra v3 `mergeRefs`, Vitest/RTL.

**Spec:** `docs/superpowers/specs/2026-07-07-followup-bundle-design.md`

## Global Constraints

- **Two repos.** Tasks 1–2 in `~/repo/anker`; Task 3 in `~/repo/fieldkit`. **HARD GATE between Task 2 and Task 3:** anker 4.0.0 merged, tagged, published (controller work).
- anker ships **4.0.0** (BREAKING: `peerDependencies.react`/`react-dom` → `">=19"`). fieldkit ships **0.5.0** (peers move: anker `"^3.1.0 || ^4.0.0"`, react/react-dom `">=19"`; controller bumps the version at release).
- The ref fix contract: wherever a form wrapper's inner control receives BOTH the spread RHF `field` props AND a `ref` override, the override becomes `mergeRefs(field.ref, ref)` (from `@chakra-ui/react`). Wrappers whose inner control cannot take a DOM ref, or that never carried the conflict, stay unchanged — each such file is named in the report with one line of reasoning.
- The `name` fix contract: the DOM control rendered by `TextInput` carries `name={name}` (and the audit dismisses or fixes any sibling atom with the same destructure-and-drop pattern — `persona.tsx`'s `name` is a display name, verify and dismiss with reasoning).
- Existing anker tests that BEGIN passing/failing because RHF focus registration now works are the restored default — adjust assertions only with justification in the report (never silence a legitimate new focus behavior).
- Gates with REAL exit codes (log file + `echo $?`; never pipe a gate into tail/head) — anker: test/typecheck/lint/verify-exports; fieldkit: test/typecheck/lint.
- Conventional Commits: anker scopes `atoms`/`forms`; fieldkit scope `editor`.

---

### Task 1: anker — name attribute + field.ref merge + tests

**Repo:** `~/repo/anker`

**Files:**
- Modify: `src/atoms/text-input/text-input.tsx` (line ~17)
- Modify: the form wrappers with the `{...field}` + `ref={ref}` conflict — confirmed by recon: `src/forms/input-field.tsx` (~45/57), `src/forms/textarea-field.tsx` (~38/47), `src/forms/select-field.tsx` (~43/46), `src/forms/date-picker-field.tsx` (~41/49); INSPECT and decide per contract: `number-input-field.tsx`, `color-picker-field.tsx`, `switch-field.tsx`, `code-field.tsx`
- Test: `src/forms/form-field.rhf-registration.test.tsx` (new)

**Interfaces:**
- Consumes: `mergeRefs` from `@chakra-ui/react`; RHF `ControllerRenderProps.ref`.
- Produces: DOM inputs carry `name`; RHF element registration works (setFocus/focus-on-error live); consumer refs coexist.

- [ ] **Step 1: Write the failing tests** — create `src/forms/form-field.rhf-registration.test.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, render, screen } from "@testing-library/react";
import { createRef, useEffect } from "react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { InputField } from "./input-field";
import { TextareaField } from "./textarea-field";

function Harness({
	onForm,
	children,
}: {
	onForm?: (form: UseFormReturn<{ name: string }>) => void;
	children: React.ReactNode;
}) {
	const form = useForm({ defaultValues: { name: "" } });
	useEffect(() => {
		onForm?.(form);
	}, [form, onForm]);
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...form}>{children}</FormProvider>
		</ChakraProvider>
	);
}

describe("form wrappers — DOM name + RHF registration", () => {
	it("the rendered input carries the name attribute", () => {
		render(
			<Harness>
				<InputField name="name" label="Name" />
			</Harness>,
		);
		const input = screen.getByLabelText(/^Name/) as HTMLInputElement;
		expect(input).toHaveAttribute("name", "name");
	});

	it("RHF setFocus reaches the input (field.ref registered)", () => {
		let form: UseFormReturn<{ name: string }> | undefined;
		render(
			<Harness onForm={(f) => (form = f)}>
				<InputField name="name" label="Name" />
			</Harness>,
		);
		act(() => {
			form?.setFocus("name");
		});
		expect(screen.getByLabelText(/^Name/)).toHaveFocus();
	});

	it("a consumer ref and field.ref coexist", () => {
		const consumerRef = createRef<HTMLInputElement>();
		let form: UseFormReturn<{ name: string }> | undefined;
		render(
			<Harness onForm={(f) => (form = f)}>
				<InputField name="name" label="Name" ref={consumerRef} />
			</Harness>,
		);
		// Consumer ref sees the element…
		expect(consumerRef.current).toBeInstanceOf(HTMLInputElement);
		// …and RHF is registered too.
		act(() => {
			form?.setFocus("name");
		});
		expect(consumerRef.current).toHaveFocus();
	});

	it("TextareaField: name attribute + setFocus (representative second wrapper)", () => {
		let form: UseFormReturn<{ name: string }> | undefined;
		render(
			<Harness onForm={(f) => (form = f)}>
				<TextareaField name="name" label="Notes" />
			</Harness>,
		);
		const area = screen.getByLabelText(/^Notes/);
		expect(area).toHaveAttribute("name", "name");
		act(() => {
			form?.setFocus("name");
		});
		expect(area).toHaveFocus();
	});
});
```

(If `getByLabelText` cannot associate — anker labels use `htmlFor={name}` and inputs get `id={name}`, so it should — fall back to `getByRole("textbox")` and disclose. The name-attribute assertions fail pre-fix because TextInput drops `name`; the setFocus assertions fail pre-fix because `ref={ref}` overrides `field.ref`.)

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/forms/form-field.rhf-registration.test.tsx`
Expected: all four FAIL (no `name` attribute; focus stays on body).

- [ ] **Step 3: Fix TextInput** (`src/atoms/text-input/text-input.tsx:17`):

```tsx
			<Input id={name} name={name} size={size} {...rest} ref={ref} />
```

Audit siblings: `src/atoms/persona/persona.tsx` destructures `name` but it is a display name (no form control) — verify and dismiss in the report; fix any OTHER atom that renders a form control and drops `name` the same way.

- [ ] **Step 4: Merge the refs.** In each wrapper where the inner control receives `{...field}` AND `ref={ref}` (confirmed: input-field, textarea-field, select-field, date-picker-field; inspect number-input/color-picker/switch/code per the Global-Constraints contract):

- Add `mergeRefs` to the `@chakra-ui/react` import.
- Replace `ref={ref}` with:

```tsx
					// Merge rather than override: `{...field}` spreads RHF's own
					// field.ref, and a later `ref={ref}` would DISCARD it — leaving
					// react-hook-form unregistered (setFocus/focus-on-error dead).
					ref={mergeRefs(field.ref, ref)}
```

(One comment instance per file is enough — place it at the first merged ref; wrappers left unchanged get a line in the report instead.)

- [ ] **Step 5: GREEN + full gate**

```bash
cd ~/repo/anker
npx vitest run src/forms/
npm run test > /tmp/anker-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/anker-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/anker-gate.log 2>&1; echo "LINT=$?"
npm run verify-exports >> /tmp/anker-gate.log 2>&1; echo "VE=$?"
```
Expected: all 0. If an EXISTING test newly fails because focus now lands somewhere (the restored RHF default), adjust it per the Global-Constraints rule with justification in the report.

- [ ] **Step 6: Commit**

```bash
git add src/atoms/ src/forms/
git commit -m "fix(forms): carry the name attribute and register RHF field refs"
```

---

### Task 2: anker — react >=19 peer floor + docs + 4.0.0

**Repo:** `~/repo/anker`

**Files:**
- Modify: `package.json` (peerDependencies react/react-dom → `">=19"`; version `4.0.0`) + `package-lock.json` (sync)
- Modify: `CHANGELOG.md` (4.0.0 section above `## 3.2.0 — 2026-07-06`)
- Modify: `CLAUDE-ANKER.md` (React floor + restored focus behavior notes)

**Interfaces:**
- Consumes: Task 1's fixes (documented together).
- Produces: anker 4.0.0.

- [ ] **Step 1: Peer floor + version.** In `package.json`: `peerDependencies.react` → `">=19"`, `peerDependencies["react-dom"]` → `">=19"`, `"version": "4.0.0"`. Then `npm install --package-lock-only`.

- [ ] **Step 2: CHANGELOG** — insert above `## 3.2.0 — 2026-07-06`:

```md
## 4.0.0 — 2026-07-07

### Breaking

- **React peer floor is now `>=19`** (#150). The library's ref-as-prop
  convention (used across atoms and form wrappers) requires React 19's
  ref-as-prop semantics; on React 18 those refs were silently stripped.
  All known consumers already run React 19 — upgrade React before
  taking 4.x if you are on 18.

### Fixed

- **Form inputs carry the `name` attribute again** (#151): `TextInput`
  passed `name` only as `id`; the DOM input now gets both. Restores
  autofill/form semantics and `[name=…]` selector targeting.
- **react-hook-form element registration restored**: form wrappers
  spread RHF's `field` props and then OVERRODE `field.ref` with the
  consumer ref, leaving RHF unregistered — `setFocus` and
  focus-on-first-error were silently dead. Refs are now merged
  (`mergeRefs(field.ref, ref)`); failed submits focus the first errored
  field again, and consumer refs keep working.
```

- [ ] **Step 3: CLAUDE-ANKER.md** — note the React `>=19` floor where the stack/peer info lives, and in the Form fields section: RHF focus registration works (setFocus/focus-on-error), inputs carry `name`.

- [ ] **Step 4: Full gate** (same four commands/log as Task 1 Step 5). Expected: all 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md CLAUDE-ANKER.md
git commit -m "feat!: react >=19 peer floor; docs and 4.0.0 bump"
```

---

> **HARD GATE — controller work:** merge anker to main, push, tag
> `v4.0.0` (CI publishes), verify npm, GH release, close #150 + #151.
> Only then start Task 3.

---

### Task 3: fieldkit — drill-frame rename-follow fix + dependency moves

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `package.json` (devDep anker `^4.0.0`; peer anker `"^3.1.0 || ^4.0.0"`; peers react/react-dom `">=19"`) + lockfile via `npm install`
- Modify: `src/editor/field-config-panel.tsx` (the rename-follow, ~lines 326-333)
- Modify: `CLAUDE.md` (peer lines: anker range, react floor)
- Test: `src/editor/__tests__/field-config-panel.test.tsx` (extend)

**Interfaces:**
- Consumes: the panel's existing `DrillFrame { accessor, baselineAccessor }` stack and the frame-resolution used by the 0.4.2 baseline forwarding (`chain.length - 2` with fallback — read that code first; it is the pattern to match).
- Produces: renames update the frame of the field actually being edited, even when a deeper frame is broken.

- [ ] **Step 1: Deps.** `package.json`: devDependencies `"@knkcs/anker": "^4.0.0"`; peerDependencies `"@knkcs/anker": "^3.1.0 || ^4.0.0"`, `"react": ">=19"`, `"react-dom": ">=19"`. `npm install`; `npm ls @knkcs/anker` → 4.0.0. Update `CLAUDE.md`'s peer lines (anker range; react floor).

- [ ] **Step 2: Write the failing test** — in `field-config-panel.test.tsx`, using its drill-in idioms (the committed-child tests from 0.4.2 are the closest templates):

```tsx
	it("rename-follow updates the ACTIVE frame when a deeper frame is broken", () => {
		// Build a drill chain two deep (group -> child-group -> grandchild),
		// then render with a draft where the GRANDCHILD no longer resolves
		// (deleted externally) — the active field is the middle frame
		// (chain.length - 2). Rename the active field via the accessor input.
		// EXPECT: the drill stack entry for the ACTIVE frame follows the
		// rename (the panel keeps resolving it), and the broken deeper frame
		// is untouched. Pre-fix, the rename rewrites the LAST (broken) frame,
		// orphaning the drill path — assert via whatever the harness exposes
		// (the panel still shows the renamed field rather than falling back /
		// blanking).
	});
```

(Fill the interactions from the file's harness — it drives the panel with explicit props and an apply spy. The contract is as stated; if the harness cannot express a broken deeper frame — e.g. the panel auto-pops broken frames on render — STOP and report what actually happens, with the trace; that changes the fix's shape and possibly invalidates #35.)

- [ ] **Step 3: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/field-config-panel.test.tsx`
Expected: the new test FAILS (rename rewrote the last/broken frame).

- [ ] **Step 4: Fix.** In the rename-follow block (~326-333), replace the unconditional last-frame rewrite with the same frame resolution the baseline forwarding uses — update the frame whose entry corresponds to the ACTIVE field (the deepest RESOLVABLE frame), e.g. resolve the index the same way the `chain.length - 2` forwarding logic does and rewrite `s[thatIndex]` instead of `s[s.length - 1]`, preserving that entry's frozen `baselineAccessor`. Show the exact final code in your report.

- [ ] **Step 5: GREEN + full gate**

```bash
cd ~/repo/fieldkit
npx vitest run src/editor/
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all 0 (655+ tests; the anker 4.0.0 bump must not break any existing test — if the newly-alive RHF focus registration changes a fieldkit test's focus expectations, treat per the same restored-default rule as anker, with justification).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json CLAUDE.md src/editor/
git commit -m "fix(editor): rename-follow targets the active drill frame (#35)"
```

---

## Runtime verification (controller, after Task 3)

fieldkit Storybook via Playwright: edit-mode SpecForm story — search-jump to a field and confirm (via evaluate) the target input HAS a `name` attribute and receives focus (tier-1 alive); submit an invalid sectioned form — the first errored field receives focus (RHF focus-on-error restored through the whole stack).

## Release sequencing (controller)

- After Task 2: merge → tag `v4.0.0` in anker → CI publishes → verify npm → GH release → close #150 + #151.
- After Task 3 + final review: merge fieldkit → `chore: v0.5.0` (+ lock sync) → tag `v0.5.0` → CI publishes → GH release naming the anker 4.0.0 pairing → close #35.
- Then: the mediahub fieldkit 0.0.2 → 0.5.0 bump becomes the next project.
