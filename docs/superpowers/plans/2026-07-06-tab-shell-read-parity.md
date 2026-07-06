# Tab-Shell Extraction + Read-Mode Search Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated tab shell (state + presentation) shared by SpecForm's edit and read modes, move the `/` shortcut into FieldSearch (read + canvas parity), bring the read jump to edit-mode hygiene, and prove the drawer Escape contract — fixes #24, ships as fieldkit 0.4.1.

**Architecture:** New internal `tab-shell.tsx` with `useTabShell` (all duplicated non-RHF state/effects + a shared `rootRef`) and `TabShell` (the presentational `Tabs.Root` shell, owning the containerRef/rootRef merge). Task 1 is a behavior-invisible refactor pinned by the untouched existing suite; Task 2 adds the parity behaviors with new tests; Task 3 adds the drawer proof + docs.

**Tech Stack:** React, Chakra Tabs, Vitest/RTL (fake timers for flash-timeout tests), anker `DrawerRoot`.

**Spec:** `docs/superpowers/specs/2026-07-06-tab-shell-read-parity-design.md`

## Global Constraints

- fieldkit-only; ships **0.4.1** (controller bumps at release). ZERO public API change — `tab-shell.tsx` is internal (NOT exported from any barrel); only `SpecForm`/`SpecFormProps`/`SpecFormLabels` remain public.
- **Refactor-invisibility pin (Task 1):** the full existing suite passes with ZERO test-file modifications. If a test needs changing in Task 1, STOP — that is a behavior change, not a refactor.
- `useTabShell` contains NO react-hook-form hooks (read mode's standing constraint, now enforced by construction).
- The read jump keeps its scroll + box-shadow-flash behavior; it gains ONLY: root-scoped query, `CSS.escape(accessor)`, rAF cancellation, and flash-timeout clearing on unmount.
- The `/` listener keeps its exact skip-while-typing guard (input/textarea/contentEditable).
- Gates with REAL exit codes (log file + `echo $?`; never pipe a gate into tail/head): `npm run test`, `npm run typecheck`, `npm run lint`.
- Conventional Commits, scope `renderer`.

---

### Task 1: extract `useTabShell` + `TabShell` (pure refactor)

**Files:**
- Create: `src/renderer/spec-form/tab-shell.tsx`
- Modify: `src/renderer/spec-form/spec-form.tsx` (SpecFormTabs at ~122-317, SpecFormReadTabs at ~329-422)
- Test: NONE — the pin is the untouched existing suite.

**Interfaces:**
- Consumes: `SpecPartition` from `../../schema/partition`; `buildSearchIndex` from `./search-index`; `useContainerOrientation` from `./use-container-orientation`.
- Produces (Task 2 relies on):

```ts
export function useTabShell(partition: SpecPartition, defaultTabLabel: string): {
	activeTab: string;
	setActiveTab: (v: string) => void;
	orientation: "horizontal" | "vertical";
	containerRef: (node: HTMLElement | null) => void;
	rootRef: React.RefObject<HTMLDivElement | null>;
	searchIndex: FieldSearchResult[];
};
export function TabShell(props: TabShellProps): JSX;  // props below
```

- [ ] **Step 1: Create `src/renderer/spec-form/tab-shell.tsx`**

```tsx
// src/renderer/spec-form/tab-shell.tsx
import { Box, Tabs } from "@chakra-ui/react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { SpecPartition } from "../../schema/partition";
import { buildSearchIndex } from "./search-index";
import { useContainerOrientation } from "./use-container-orientation";

/**
 * Shared stateful shell for SpecFormTabs (edit) and SpecFormReadTabs
 * (read). Contains NO react-hook-form hooks — read mode must render
 * without a FormProvider, and putting the shared state here (instead of
 * duplicating it per mode) is what lets both modes share it without
 * breaking that rule. The two copies drifted once before this existed.
 */
export function useTabShell(partition: SpecPartition, defaultTabLabel: string) {
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const searchIndex = useMemo(
		() => buildSearchIndex(partition.tabs, defaultTabLabel),
		[partition, defaultTabLabel],
	);

	// Reset to the first tab when the partition identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: partition is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition]);

	return {
		activeTab,
		setActiveTab,
		orientation,
		containerRef,
		rootRef,
		searchIndex,
	};
}

export interface TabShellProps {
	orientation: "horizontal" | "vertical";
	containerRef: (node: HTMLElement | null) => void;
	rootRef: RefObject<HTMLDivElement | null>;
	activeTab: string;
	onTabChange: (value: string) => void;
	/** The FieldSearch node (or false when the schema yields no index). */
	searchNode: ReactNode;
	tabTriggers: ReactNode;
	/** The Tabs.Content panels. */
	children: ReactNode;
}

/** Presentational tab shell shared by edit and read modes. */
export function TabShell({
	orientation,
	containerRef,
	rootRef,
	activeTab,
	onTabChange,
	searchNode,
	tabTriggers,
	children,
}: TabShellProps) {
	// Merge the orientation hook's callback ref with the RefObject the
	// mode components query synchronously (jump scoping). Memoized so its
	// identity is stable across renders — otherwise React would detach and
	// reattach containerRef (and its ResizeObserver) on every render.
	const setRoot = useCallback(
		(node: HTMLDivElement | null) => {
			rootRef.current = node;
			containerRef(node);
		},
		[containerRef, rootRef],
	);

	return (
		<Box ref={setRoot}>
			{/* Vertical Tabs.Root is a row-flex container (nav column beside
			    content), so the search must live OUTSIDE it to span the full
			    width above nav+content instead of becoming a row item. */}
			{orientation === "vertical" && searchNode && (
				<Box mb="3">{searchNode}</Box>
			)}
			<Tabs.Root
				value={activeTab}
				onValueChange={(e) => onTabChange(e.value)}
				orientation={orientation}
				// NEVER pass lazyMount/unmountOnExit: RHF needs all panels in the DOM.
			>
				{orientation === "horizontal" ? (
					<Box
						display="flex"
						alignItems="center"
						justifyContent="space-between"
						gap="4"
					>
						<Tabs.List flex="1">{tabTriggers}</Tabs.List>
						{searchNode}
					</Box>
				) : (
					<Tabs.List>{tabTriggers}</Tabs.List>
				)}
				{children}
			</Tabs.Root>
		</Box>
	);
}
TabShell.displayName = "TabShell";
```

- [ ] **Step 2: Refactor `SpecFormTabs`.** Replace its duplicated pieces with the shell; everything edit-specific stays byte-identical. The component head becomes:

```tsx
function SpecFormTabs({ partition, readOnly, labels }: SpecFormTabsProps) {
	const {
		activeTab,
		setActiveTab,
		orientation,
		containerRef,
		rootRef,
		searchIndex,
	} = useTabShell(partition, labels.defaultTab);
	const indicators = useTabIndicators(partition.tabs);
	const { setFocus } = useFormContext();
	const { submitCount, errors } = useFormState();
	const lastHandledSubmit = useRef(0);
```

DELETE from the component (now owned by the hook/shell): the `useState("tab-0")` + `useContainerOrientation` + `rootRef` declaration + `searchIndex` memo + reset effect (old lines ~123-141) and the `setRoot` merge callback (old lines ~244-254). KEEP byte-identical: `pendingJumpRef`/`jumpToken`/`jumpTo`/both jump+submit effects (they read `rootRef` from the hook now), the **`/` keydown effect (keep it in this task — it moves in Task 2)**, `searchNode`, `tabTriggers` (badges/dirty dots). The return becomes:

```tsx
	return (
		<TabShell
			orientation={orientation}
			containerRef={containerRef}
			rootRef={rootRef}
			activeTab={activeTab}
			onTabChange={setActiveTab}
			searchNode={searchNode}
			tabTriggers={tabTriggers}
		>
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<FieldRenderer schema={tab.fields} readOnly={readOnly} />
					</Box>
				</Tabs.Content>
			))}
		</TabShell>
	);
```

- [ ] **Step 3: Refactor `SpecFormReadTabs`** the same way: head becomes `const { activeTab, setActiveTab, orientation, containerRef, rootRef, searchIndex } = useTabShell(partition, labels.defaultTab);` (the `rootRef` is unused until Task 2 — prefix `rootRef: _rootRef` or destructure without it if lint complains; Task 2 uses it). DELETE its own copies of the state/orientation/memo/reset-effect (old ~334-347). KEEP byte-identical (this task): its existing `jumpTo` (document query — Task 2 rewrites it), `searchNode`, `tabTriggers`. Return uses `<TabShell …>` with `<ReadTab tab={tab} values={values} />` panels (same shape as Step 2's return). Imports in `spec-form.tsx`: add `import { TabShell, useTabShell } from "./tab-shell";`, drop now-unused `useContainerOrientation`/`buildSearchIndex` imports IF nothing else in the file uses them.

- [ ] **Step 4: The pin — full suite, zero test edits**

```bash
cd ~/repo/fieldkit
git status --porcelain src/**/__tests__ | wc -l   # must print 0
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: 0 modified test files; all three gates echo 0. If ANY existing test fails, the refactor changed behavior — fix the refactor, never the test.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/spec-form/
git commit -m "refactor(renderer): extract shared tab shell from SpecForm modes"
```

---

### Task 2: `/` into FieldSearch + read-jump parity

**Files:**
- Modify: `src/renderer/spec-form/field-search.tsx` (add the listener + container ref)
- Modify: `src/renderer/spec-form/spec-form.tsx` (delete SpecFormTabs' `/` effect; rewrite SpecFormReadTabs' jump; update its mirror comment)
- Test: `src/renderer/spec-form/__tests__/spec-form-read-search.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `useTabShell` (`rootRef`, `setActiveTab`); FieldSearch's existing `searchRef` (`SearchInputHandle`) and type-guard pattern.
- Produces: no API change; behavior — `/` works wherever FieldSearch mounts; read jump is scoped/escaped/cleaned.

- [ ] **Step 1: Write the failing tests** — create `src/renderer/spec-form/__tests__/spec-form-read-search.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

// jsdom has no scrollIntoView.
beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	vi.useRealTimers();
});

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	// Dotted accessor: the jump selector must CSS.escape it — an
	// unescaped `[data-field-row=meta.title]` selector matches nothing.
	makeField("meta.title", "Meta title"),
];

function renderRead() {
	return render(
		<Wrapper>
			<SpecForm schema={schema} mode="read" values={{}} />
		</Wrapper>,
	);
}

describe("SpecForm read mode — search parity", () => {
	it("focuses the search on '/' when no input is focused", () => {
		renderRead();
		fireEvent.keyDown(document, { key: "/" });
		expect(screen.getByPlaceholderText("Find field…")).toHaveFocus();
	});

	it("jumps cross-tab to a dotted accessor: switches tab, scrolls, flashes", async () => {
		renderRead();
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		const option = await screen.findByText("Meta title");
		fireEvent.click(option);

		// Tab switched to SEO…
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		// …and the escaped selector found the row: scrolled + flashing.
		await waitFor(() => {
			const row = document.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape("meta.title")}"]`,
			);
			expect(row).not.toBeNull();
			expect(row?.style.boxShadow).toContain("3px");
		});
		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it("clears the flash and survives unmount with a pending flash timeout", async () => {
		vi.useFakeTimers();
		const { unmount } = renderRead();
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		// Debounce (300ms) then let the dropdown render.
		await vi.advanceTimersByTimeAsync(400);
		fireEvent.click(screen.getByText("Meta title"));
		// Flush the jump's rAF (jsdom rAF is timer-backed under fake timers).
		await vi.advanceTimersByTimeAsync(50);

		// Unmount while the 1.5s flash timeout is pending, then advance past
		// it — the cleared timeout must not touch the detached node or warn;
		// reaching the end without throwing is the assertion.
		unmount();
		await vi.advanceTimersByTimeAsync(2000);
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/__tests__/spec-form-read-search.test.tsx`
Expected: the `/` test FAILS (no listener in read mode); the dotted-accessor jump test FAILS (unescaped selector misses the row → no flash). The unmount test may pass trivially pre-fix — it becomes meaningful once the timeout-clearing code exists; keep it.

- [ ] **Step 3: FieldSearch gains the listener** (`src/renderer/spec-form/field-search.tsx`):

Add `const boxRef = useRef<HTMLDivElement>(null);` beside the existing refs and `ref={boxRef}` on the outer `Box` (the one with `data-testid="field-search"`). Add the effect (after the existing hooks):

```ts
	// "/" focuses this search unless the user is typing in a field. Lives
	// here (not in the tab components) so every mount — edit, read, editor
	// canvas — gets the shortcut from one implementation. With multiple
	// search boxes mounted at once, the last-mounted listener wins.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "/") return;
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable)
			)
				return;
			e.preventDefault();
			const handle = searchRef.current;
			// Same anker-3.1 degrade shape as clearInput(): on 3.1 + React 19
			// the ref holds the raw <input>, whose native focus() also passes.
			if (typeof handle?.focus === "function") {
				handle.focus();
			} else {
				boxRef.current
					?.querySelector<HTMLInputElement>("[data-field-search-input]")
					?.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);
```

- [ ] **Step 4: Delete `SpecFormTabs`' `/` effect** (the whole `// "/" focuses the search…` useEffect) from `spec-form.tsx`. The existing edit-mode test (`field-search.test.tsx` "focuses search on '/'…") must stay green through the move — it now exercises FieldSearch's listener.

- [ ] **Step 5: Rewrite `SpecFormReadTabs`' jump** with edit-mode's two-phase pattern. Replace its single `jumpTo` callback with:

```ts
	// Same two-phase pattern as SpecFormTabs' jump: stash the target, bump
	// a token, and do the DOM work in an effect after the tab has rendered
	// (a lone rAF can fire before the panel's `hidden` flip has committed).
	const pendingJumpRef = useRef<string | null>(null);
	const [jumpToken, setJumpToken] = useState(0);
	const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const jumpTo = useCallback((accessor: string, tabIndex: number) => {
		pendingJumpRef.current = accessor;
		setJumpToken((t) => t + 1);
		setActiveTab(`tab-${tabIndex}`);
	}, [setActiveTab]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: jumpToken is a re-run trigger, not read in the effect body — pendingJumpRef carries the value
	useEffect(() => {
		const accessor = pendingJumpRef.current;
		if (accessor == null) return;
		pendingJumpRef.current = null;
		const raf = requestAnimationFrame(() => {
			// Scoped to this instance's root (not document) and escaped:
			// dotted/nested accessors break a raw attribute selector.
			const el = rootRef.current?.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape(accessor)}"]`,
			);
			if (!el) return;
			el.scrollIntoView?.({ block: "center", behavior: "smooth" });
			el.style.transition = "box-shadow 1.5s ease";
			el.style.boxShadow = "0 0 0 3px var(--chakra-colors-primary-200)";
			if (flashTimeoutRef.current != null) {
				clearTimeout(flashTimeoutRef.current);
			}
			flashTimeoutRef.current = setTimeout(() => {
				el.style.boxShadow = "none";
				flashTimeoutRef.current = null;
			}, 1500);
		});
		return () => cancelAnimationFrame(raf);
	}, [jumpToken]);

	// A pending flash must not fire against an unmounted tree.
	useEffect(
		() => () => {
			if (flashTimeoutRef.current != null) {
				clearTimeout(flashTimeoutRef.current);
			}
		},
		[],
	);
```

Also update the component's mirror comment (old ~325-328): it still says "no setFocus/\"/\" shortcut" — reword to note the `/` shortcut now comes from FieldSearch itself and the jump scrolls+flashes instead of focusing.

- [ ] **Step 6: GREEN + full gate**

```bash
cd ~/repo/fieldkit
npx vitest run src/renderer/spec-form/
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all pass, including the UNMODIFIED edit-mode `/` test.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/spec-form/
git commit -m "feat(renderer): read-mode search parity — / shortcut and hardened jump"
```

---

### Task 3: drawer Escape proof + story + docs

**Files:**
- Test: `src/renderer/spec-form/__tests__/drawer-escape.test.tsx` (new)
- Modify: `src/renderer/spec-form/spec-form.stories.tsx` (new story)
- Modify: `src/renderer/spec-form/spec-form.mdx` (search parity + drawer contract + shortcut note)
- Modify: `CLAUDE.md` (directory table: `tab-shell.tsx` row under spec-form/)

**Interfaces:**
- Consumes: anker `DrawerRoot` from `@knkcs/anker/components` (`open`, `onClose`); test helpers `makeField`/`makeSection`/`Wrapper`.
- Produces: nothing — proof + docs.

- [ ] **Step 1: Write the test** — create `src/renderer/spec-form/__tests__/drawer-escape.test.tsx`. This mounts anker's REAL `DrawerRoot` (the prior Escape tests used a bare `<div onKeyDown>` stand-in). NOTE: this is a PROOF test — it is believed to pass already (FieldSearch stops propagation in the bubble phase before the document listener Ark uses). **If the first assertion FAILS (onClose called), STOP and report BLOCKED — that means Ark handles Escape in the capture phase and the containment strategy itself is broken; that's a real bug, not a test problem.**

```tsx
import { DrawerRoot } from "@knkcs/anker/components";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

// anker's Drawer positions via floating-ui → needs ResizeObserver in jsdom.
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm search inside a real DrawerRoot", () => {
	it("Escape closes only the dropdown; a second Escape closes the drawer", async () => {
		const onClose = vi.fn();
		render(
			<Wrapper>
				<DrawerRoot open onClose={onClose} title="Edit">
					<SpecForm schema={schema} />
				</DrawerRoot>
			</Wrapper>,
		);

		const input = screen.getByPlaceholderText("Find field…");
		fireEvent.change(input, { target: { value: "meta" } });
		await waitFor(() => {
			expect(screen.getByRole("listbox")).toBeInTheDocument();
		});

		// Escape #1: contained by FieldSearch — dropdown closes, drawer lives.
		fireEvent.keyDown(input, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		});
		expect(onClose).not.toHaveBeenCalled();

		// Escape #2 (dropdown closed): FieldSearch's handler early-returns,
		// the key propagates, the drawer closes.
		fireEvent.keyDown(input, { key: "Escape" });
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
```

(Adapt `DrawerRoot`'s exact required props to its type — check `src/table/edit-drawer.tsx:66` for a working usage; if it needs e.g. a `title`/`children` structure, mirror that. The two assertions are the contract; the wrapper props are yours to align.)

- [ ] **Step 2: Run it**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/__tests__/drawer-escape.test.tsx`
Expected: PASS (proof). On failure of assertion #1 → BLOCKED per the note above. If assertion #2 fails because Ark's Escape needs the event on `document`/overlay instead of the input, adjust the dispatch target for #2 only (e.g. `fireEvent.keyDown(document.activeElement ?? document.body, …)`) and note it in your report.

- [ ] **Step 3: Story** — in `src/renderer/spec-form/spec-form.stories.tsx`, add (adapting to the file's existing meta/decorator conventions — reuse its existing schema fixtures if suitable):

```tsx
export const InDrawerWithSections: Story = {
	render: () => {
		const [open, setOpen] = useState(true);
		return (
			<>
				<Button onClick={() => setOpen(true)}>Open drawer</Button>
				<DrawerRoot open={open} onClose={() => setOpen(false)} title="Edit entry">
					<SpecForm schema={sectionedSchema} />
				</DrawerRoot>
			</>
		);
	},
};
```

(Imports: `DrawerRoot` from `@knkcs/anker/components`, `Button` from `@knkcs/anker/atoms`, `useState`. If the file's stories are args-based, a render-only story with minimal dummy args is fine — match how the file already handles render-only stories, and reuse/define a `sectionedSchema` fixture consistent with its existing ones.)

- [ ] **Step 4: Docs.**
- `spec-form.mdx`: in the search section, state parity: `/` focuses the search in BOTH modes (the listener lives in FieldSearch; with multiple search boxes mounted, the last-mounted wins); the read jump scrolls + flashes the row (escaped, instance-scoped); the drawer contract (Escape in an open dropdown never closes a host drawer; Escape with the dropdown closed does).
- `CLAUDE.md`: spec-form/ directory entry gains `tab-shell.tsx` (shared tab shell: `useTabShell` + `TabShell`, no RHF hooks).

- [ ] **Step 5: Full gate** (same three commands/log pattern). Expected: all 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/spec-form/ CLAUDE.md
git commit -m "test(renderer): drawer Escape proof; drawer story and docs (#24)"
```

---

## Runtime verification (controller, after Task 3)

fieldkit Storybook via Playwright: read-mode story — press `/` (search focuses), search a field on another tab, Enter → tab switches, row scroll+flashes; the new drawer story — open the search dropdown, Escape closes only the dropdown (drawer stays), second Escape closes the drawer.

## Release sequencing (controller)

After Task 3 + final review: merge → `chore: v0.4.1` (+ lock sync) → tag `v0.4.1` → CI publishes → GH release → close #24.
