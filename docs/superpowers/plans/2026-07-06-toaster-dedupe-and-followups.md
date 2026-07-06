# Toaster Dedupe + 0.3.1 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anker's `Toaster` self-deduplicates (fixes fieldkit#28 with zero fieldkit API change); fieldkit 0.3.1 adds the host-fixture regression test, docs, and the four #31 marker-convention follow-ups.

**Architecture:** A closure-scoped mount registry inside `createAnkerToaster()` — each mounted `Toaster` registers in an effect and subscribes; only the first live mount (the owner) renders the portal/region, and survivors take over via subscription when the owner unmounts. fieldkit changes are tests, docs, and a conditional-spread fix in `TryItView`.

**Tech Stack:** React (`useSyncExternalStore`), Chakra v3 toast primitives, Vitest/RTL (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-06-toaster-dedupe-and-followups-design.md` (fieldkit repo)

## Global Constraints

- **Two repos.** Task 1 runs in `~/repo/anker`; Tasks 2–3 run in `~/repo/fieldkit`. **HARD GATE between Task 1 and Task 2:** anker 3.1.1 merged, tagged, published to npm (controller handles merge/tag/release).
- anker ships **3.1.1** (patch, no API change; behavior change is strictly "duplicate regions collapse to one"). fieldkit ships **0.3.1** (controller bumps at release).
- Dedupe is **per `createAnkerToaster()` pair** (closure-scoped registry): the default singleton pair dedupes among its own mounts; custom pairs dedupe independently.
- Ownership is mount-ordered: first live mount renders; on owner unmount the next takes over (subscription, not a bare counter). Server render: nothing registers, all instances render null.
- fieldkit devDependency `@knkcs/anker` → `^3.1.1`; **peerDependencies stay `"^3.1.0"`** (documented graceful degrade).
- fieldkit's host-fixture test must NOT mock `@knkcs/anker/primitives` (the existing spec-editor tests mock `toaster` — this test is region-level and needs the real thing).
- Gate commands — anker: `npm run test && npm run typecheck && npm run lint && npm run verify-exports`; fieldkit: `npm run test && npm run typecheck && npm run lint`. **Check REAL exit codes — never pipe a gate command into `tail`/`head`; capture to a log file and `echo $?`.**
- All exported React components set `displayName`. Conventional Commits: anker scope `primitives`; fieldkit scopes `editor`/`renderer`/`schema` per task text.

---

### Task 1: anker — self-deduplicating Toaster + docs + 3.1.1

**Repo:** `~/repo/anker`

**Files:**
- Modify: `src/primitives/toaster.tsx`
- Modify: `CHANGELOG.md` (new 3.1.1 section directly above `## 3.1.0 — 2026-07-06`)
- Modify: `CLAUDE-ANKER.md` (no toaster entry exists today — ADD one)
- Modify: `package.json` (version `3.1.1`) + `package-lock.json` (sync)
- Test: `src/primitives/toaster.dedupe.test.tsx` (new)

**Interfaces:**
- Consumes: existing `createAnkerToaster`, `toaster`, `Toaster` exports.
- Produces: unchanged public API; new behavior — multiple mounts of one pair's `Toaster` render exactly one region, with mount-ordered takeover.

- [ ] **Step 1: Write the failing tests** — create `src/primitives/toaster.dedupe.test.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAnkerToaster, Toaster, toaster } from "./toaster";

function Host({ showFirst = true }: { showFirst?: boolean }) {
	return (
		<ChakraProvider value={defaultSystem}>
			{showFirst && <Toaster />}
			<Toaster />
		</ChakraProvider>
	);
}

describe("Toaster — mount dedupe", () => {
	it("renders each toast once with two mounted default Toasters", async () => {
		render(<Host />);
		await act(async () => {
			toaster.create({ title: "dedupe-one", duration: 60_000 });
		});
		expect(await screen.findAllByText("dedupe-one")).toHaveLength(1);
	});

	it("the survivor takes over when the owning Toaster unmounts", async () => {
		const { rerender } = render(<Host showFirst />);
		await act(async () => {
			toaster.create({ title: "before-unmount", duration: 60_000 });
		});
		expect(await screen.findAllByText("before-unmount")).toHaveLength(1);

		rerender(<Host showFirst={false} />);
		await act(async () => {
			toaster.create({ title: "after-unmount", duration: 60_000 });
		});
		expect(await screen.findAllByText("after-unmount")).toHaveLength(1);
	});

	it("custom pairs dedupe independently of the default pair", async () => {
		const pair = createAnkerToaster();
		render(
			<ChakraProvider value={defaultSystem}>
				<Toaster />
				<pair.Toaster />
				<pair.Toaster />
			</ChakraProvider>,
		);
		await act(async () => {
			pair.toaster.create({ title: "custom-toast", duration: 60_000 });
			toaster.create({ title: "default-toast", duration: 60_000 });
		});
		expect(await screen.findAllByText("custom-toast")).toHaveLength(1);
		expect(await screen.findAllByText("default-toast")).toHaveLength(1);
	});
});
```

Notes: the long `duration` keeps toasts alive across assertions; unique titles per test make cross-test store leakage harmless. If a test still sees a stale region, `toaster.dismiss()` in an `afterEach` is the sanctioned cleanup.

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/primitives/toaster.dedupe.test.tsx`
Expected: FAIL — `findAllByText` returns 2 elements per title (both regions render every toast).

- [ ] **Step 3: Implement the registry** in `src/primitives/toaster.tsx`.

Add to the react import (create one if absent): `useEffect`, `useState`, `useSyncExternalStore`:

```ts
import { useEffect, useState, useSyncExternalStore } from "react";
```

Inside `createAnkerToaster`, after `const toaster = createToaster({...});`, add:

```tsx
	// Mount registry: the store is shared per pair, so every mounted region
	// would render every toast. Only the FIRST live <Toaster /> (the owner)
	// renders the region; later mounts render null and take over in mount
	// order when the owner unmounts. Closure-scoped: each
	// createAnkerToaster() pair dedupes independently of every other pair.
	let mounts: symbol[] = [];
	const listeners = new Set<() => void>();
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	const getOwner = () => mounts[0];
	const register = (id: symbol) => {
		mounts = [...mounts, id];
		for (const listener of listeners) listener();
	};
	const unregister = (id: symbol) => {
		mounts = mounts.filter((m) => m !== id);
		for (const listener of listeners) listener();
	};
```

Replace the head of `ToasterComponent` so it renders only as owner (the returned `<Portal>…</Portal>` body stays byte-identical):

```tsx
	const ToasterComponent = () => {
		const [id] = useState(() => Symbol("anker-toaster"));
		useEffect(() => {
			register(id);
			return () => unregister(id);
		}, [id]);
		// Server snapshot is undefined: nothing registers during SSR, so no
		// instance renders the region there (it's a portal anyway).
		const owner = useSyncExternalStore(subscribe, getOwner, () => undefined);
		if (owner !== id) return null;
		return (
			<Portal>
				{/* ...existing ChakraToaster body unchanged... */}
			</Portal>
		);
	};
	ToasterComponent.displayName = "Toaster";
```

Then DELETE the now-redundant module-tail cast `(Toaster as { displayName?: string }).displayName = "Toaster";` (displayName is set inside the factory for every pair).

- [ ] **Step 4: GREEN**

Run: `cd ~/repo/anker && npx vitest run src/primitives/toaster.dedupe.test.tsx`
Expected: PASS (3/3). Note: the first paint after mount renders null until the effect registers — toasts created before that render as soon as ownership settles, which the tests tolerate via `findAllByText`.

- [ ] **Step 5: Docs + version.**

`CHANGELOG.md` — insert directly above `## 3.1.0 — 2026-07-06`:

```md
## 3.1.1 — 2026-07-06

### Fixed

- **`Toaster` self-deduplicates.** Multiple mounted `<Toaster />`
  instances of the same pair (e.g. a host app's global one plus one
  embedded in a library component such as fieldkit's `SpecEditor`) now
  render exactly one toast region — previously every region rendered
  every toast, duplicating them. First live mount owns the region;
  when it unmounts the next takes over. Custom `createAnkerToaster()`
  pairs dedupe independently.
```

`CLAUDE-ANKER.md` — there is NO toaster entry today. Add a short bullet in the primitives/feedback catalog section (place it where the other `@knkcs/anker/primitives` components are listed; if none fits, add under the section that documents toast usage patterns):

```md
- `toaster` / `Toaster` (`@knkcs/anker/primitives`): module-singleton
  toast store + region. Mount `<Toaster />` once per app; extra mounts
  of the same pair are deduped automatically (first live mount wins),
  so embedding components that bring their own `Toaster` is safe.
```

`package.json`: `"version": "3.1.1"`, then `cd ~/repo/anker && npm install --package-lock-only`.

- [ ] **Step 6: Full gate**

```bash
cd ~/repo/anker
npm run test > /tmp/anker-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/anker-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/anker-gate.log 2>&1; echo "LINT=$?"
npm run verify-exports >> /tmp/anker-gate.log 2>&1; echo "VE=$?"
```
Expected: all four echo 0.

- [ ] **Step 7: Commit**

```bash
git add src/primitives/ CHANGELOG.md CLAUDE-ANKER.md package.json package-lock.json
git commit -m "fix(primitives): dedupe mounted Toaster regions per pair"
```

---

> **HARD GATE — controller work, not a task:** merge the anker branch to
> main, push, tag `v3.1.1` (CI publishes), verify
> `npm view @knkcs/anker version` → `3.1.1`. Only then start Task 2.

---

### Task 2: fieldkit — #28 closure (devDep, host-fixture test, docs)

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `package.json` devDependencies `"@knkcs/anker": "^3.1.1"` (peerDependencies stay `"^3.1.0"`) + `package-lock.json` via `npm install`
- Modify: `src/editor/spec-editor.mdx` (Known Limitations, line 381)
- Test: `src/editor/__tests__/toaster-dedupe.test.tsx` (new)

**Interfaces:**
- Consumes: anker 3.1.1's deduping `Toaster` (from npm); `SpecEditor` props `{ schema, onCommit, plugins }`; `builtInFieldTypes` from `src/schema/field-types`.
- Produces: nothing new — regression pin + docs.

- [ ] **Step 1: Bump devDep**

In `package.json` set devDependencies `"@knkcs/anker": "^3.1.1"` (do NOT touch peerDependencies). Then:

```bash
cd ~/repo/fieldkit && npm install
npm ls @knkcs/anker   # expect 3.1.1
```

- [ ] **Step 2: Write the failing-on-3.1.0 regression test** — create `src/editor/__tests__/toaster-dedupe.test.tsx`. It must NOT `vi.mock` `@knkcs/anker/primitives`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Toaster, toaster } from "@knkcs/anker/primitives";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import { SpecEditor } from "../spec-editor";

// anker popovers/tooltips need ResizeObserver (unimplemented in jsdom).
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

function textField(accessor: string): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

describe("SpecEditor + host Toaster (#28)", () => {
	it("a toast renders exactly once despite the editor's internal Toaster", async () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<Toaster />
				<FieldKitProvider plugins={builtInFieldTypes}>
					<SpecEditor
						schema={[textField("a")]}
						onCommit={vi.fn()}
						plugins={builtInFieldTypes}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);
		// Region-level check: the shared singleton store renders into every
		// mounted region, so creating any toast directly exercises exactly
		// the #28 mechanism (host region + SpecEditor's internal one).
		await act(async () => {
			toaster.create({ title: "host-fixture-toast", duration: 60_000 });
		});
		expect(await screen.findAllByText("host-fixture-toast")).toHaveLength(1);
	});
});
```

- [ ] **Step 3: Verify it passes with 3.1.1** (this is a regression pin, not TDD — the fix ships in anker; to see it RED, one can temporarily `npm i -D @knkcs/anker@3.1.0 --package-lock-only=false`, but do NOT leave that installed):

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/toaster-dedupe.test.tsx`
Expected: PASS with `@knkcs/anker` 3.1.1 installed.

- [ ] **Step 4: Docs** — in `src/editor/spec-editor.mdx`, append this bullet to the `## Known Limitations` list (line ~381):

```md
- **Toasts.** SpecEditor mounts anker's `<Toaster />` for its own toasts
  (save errors, delete-undo, Try-it submit). Hosts that mount a global
  `<Toaster />` are fine on anker ≥ 3.1.1, which dedupes mounted regions
  (each toast renders once); on anker 3.1.0 both regions render and
  toasts appear twice while the editor is mounted.
```

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
git add package.json package-lock.json src/editor/
git commit -m "fix(editor): pin Toaster dedupe with a host-fixture test (#28)"
```

---

### Task 3: fieldkit — #31 batch (TryItView labels, sectioned tests, fixtures, docstring)

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `src/editor/try-it-view.tsx` (labels object, lines ~52-64)
- Modify: `src/editor/__tests__/canvas-markers.test.tsx` (add `sectionField` helper + 2 tests)
- Modify: `src/renderer/spec-form/__tests__/marker-convention.test.tsx` (add `sectionField` helper + 1 test)
- Modify: `src/schema/__tests__/marker-convention.test.ts` (retitle 1 test, add 1 test)
- Modify: `src/schema/validate-spec.ts` (docstring note, comment block at lines 47-52)

**Interfaces:**
- Consumes: everything already on the branch; `TryItViewProps.labels` optional keys `defaultTab`/`searchPlaceholder`/`noResults`/`optionalMarker`; SpecForm default `searchPlaceholder` is `"Find field…"` (note the `…` character).
- Produces: nothing new — fixes and tests only.

- [ ] **Step 1: Write the failing tests.**

In `src/editor/__tests__/canvas-markers.test.tsx`, add next to the existing `textField` helper:

```tsx
function sectionField(accessor: string): Field {
	return {
		field_type: "section",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	};
}
```

Append inside the `EditorCanvas — §10 markers (WYSIWYG)` describe:

```tsx
	it("sectioned draft: canvas previews follow the convention through the tabs branch", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={[sectionField("s1"), ...mostlyRequired]}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});
```

Append a new describe (TryItView is already imported in this file):

```tsx
describe("TryItView — label forwarding", () => {
	it("falls back to SpecForm defaults for omitted labels", () => {
		render(
			<Wrap>
				<TryItView
					schema={[sectionField("s1"), textField("a", false)]}
					plugins={builtInFieldTypes}
					labels={{ testSubmit: "Test submit", testSubmitSuccess: "OK" }}
				/>
			</Wrap>,
		);
		// Sectioned schema → SpecForm's tabbed path renders the field search;
		// its placeholder must be SpecForm's own default, not undefined.
		expect(screen.getByPlaceholderText("Find field…")).toBeInTheDocument();
	});
});
```

In `src/renderer/spec-form/__tests__/marker-convention.test.tsx`, add the same `sectionField` helper (next to `textField`) and append inside the describe:

```tsx
	it("applies the convention through the sectioned tabs path", () => {
		render(
			<RealWrapper>
				<SpecForm schema={[sectionField("s1"), ...mostlyRequired]} />
			</RealWrapper>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});
```

In `src/schema/__tests__/marker-convention.test.ts`: retitle the existing hidden test from `"excludes hidden fields (and their children) from the count"` to `"excludes hidden fields from the count"`, then append:

```ts
	it("excludes a hidden group's children from the count", () => {
		const hiddenGroup = f(false, {
			field_type: "group",
			config: {
				name: "hg",
				api_accessor: "hg",
				required: false,
				instructions: "",
				hidden: true,
			},
			children: [f(true), f(true), f(true)],
		});
		// Visible: 1 required vs 2 optional → asterisk. The hidden group's
		// three required children would flip it to optional-text if counted.
		expect(
			resolveMarkerConvention([f(true), f(false), f(false), hiddenGroup]),
		).toBe("asterisk");
	});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/canvas-markers.test.tsx src/renderer/spec-form/__tests__/marker-convention.test.tsx src/schema/__tests__/marker-convention.test.ts`
Expected: the TryItView fallback test FAILS (explicit `undefined` keys clobber SpecForm's defaults → no placeholder). The sectioned marker tests and the hidden-group test should PASS already (the provider wiring and the `continue`-before-recursion are in place — these are coverage pins). If any of those unexpectedly fails, STOP and report; that is a real bug, not a test problem.

- [ ] **Step 3: Fix `TryItView`'s label forwarding** — in `src/editor/try-it-view.tsx`, replace the whole `labels={{ ... }}` object passed to `SpecForm` with:

```tsx
					labels={{
						// Keys are omitted (not set to `undefined`) when unset: SpecForm
						// merges via `{...DEFAULT_LABELS, ...labels}`, so an explicit
						// `undefined` key would clobber its default instead of falling
						// through to it.
						...(labels.defaultTab !== undefined && {
							defaultTab: labels.defaultTab,
						}),
						...(labels.searchPlaceholder !== undefined && {
							searchPlaceholder: labels.searchPlaceholder,
						}),
						...(labels.noResults !== undefined && {
							noResults: labels.noResults,
						}),
						...(labels.optionalMarker !== undefined && {
							optionalMarker: labels.optionalMarker,
						}),
					}}
```

- [ ] **Step 4: validateSpec docstring** — in `src/schema/validate-spec.ts`, extend the comment block above `checkAccessors(fields, fieldErrors);` (currently ending with "…so `seen` must not be shared across recursive calls.") by appending:

```ts
	// Fields nested inside blocks/array settings are NOT traversed — they
	// live in `settings` (e.g. allowed_blocks[].fields), not
	// `Field.children`. Documented-by-design; resolveMarkerConvention
	// shares the same boundary (see its docstring).
```

- [ ] **Step 5: GREEN**

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/ src/renderer/spec-form/ src/schema/`
Expected: PASS, including the TryItView fallback test.

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
git add src/editor/ src/renderer/ src/schema/
git commit -m "fix(editor): TryItView label fallbacks; sectioned marker tests (#31)"
```

---

## Runtime verification (controller, after Task 3)

fieldkit Storybook (`npm run dev`, port 6007) via Playwright: open the SpecEditor Build story, delete a field (toolbar delete) → the undo toast appears ONCE; switch to Try-it and submit → success toast appears once. (jsdom's host-fixture test carries the host-global-Toaster case; anker's own Storybook needs no re-check — behavior verified by its unit tests.)

## Release sequencing (controller)

- After Task 1: merge → tag `v3.1.1` in anker → CI publishes → verify npm.
- After Task 3 + final review: merge fieldkit → `chore: v0.3.1` bump (+ `npm install --package-lock-only`) → tag `v0.3.1` → CI publishes → GH release notes name the anker 3.1.1 pairing → close #28 and #31.
