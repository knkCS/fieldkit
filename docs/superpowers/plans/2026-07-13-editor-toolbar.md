# Editor Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldkit 0.9.0 — one unified editor toolbar (composition A2): **▦ Card**, **⊞ Section** (outline buttons with the structural plugins' icons), spacer, dirty-dot, **Build | Preview** segmented control, Discard, Save. "Try it" renamed to "Preview" (default string only — the `tryIt` KEY stays). Preview disables (never hides) the insert buttons. The `title` prop renders on its own line above the bar. The canvas's floating "+ Card + Section" ghost row is deleted from both layouts. The canvas's active tab lifts to `SpecEditor` as a controlled prop so the toolbar's "+ Card" can target it.

**Architecture:** `EditorCanvas` becomes fully controlled for its active tab (`activeTabIndex` + `onActiveTabChange` — every internal cause of a tab change reports up: tab click, tabdrop hover, section move/delete, shrink reset). The toolbar row is extracted to `src/editor/editor-toolbar.tsx` (pure presentational; package-internal) and `spec-editor.tsx` stays the orchestrator, gaining the insert handlers (`insertCard`/`addSection` draft ops against the lifted tab index). "+ Section"'s open-rename-on-add crosses back into the canvas via a one-shot `renameSectionPulse` prop (the `autoFocusLabel` pulse idiom already in `spec-editor.tsx`). The segmented control is anker's `SegmentedControl` (`@knkcs/anker/primitives`) — verified present in the installed anker dist, with per-item `disabled` support.

**Tech Stack:** TypeScript, React 19, Chakra v3 via @knkcs/anker (semantic tokens), Vitest + @testing-library/react (jsdom), Biome, Storybook.

**Spec:** `docs/superpowers/specs/2026-07-13-editor-toolbar-design.md` (approved, decisions LOCKED). Branch: `feat/editor-toolbar`.

## Global Constraints

- All work on branch `feat/editor-toolbar`; never commit to main.
- Conventional Commits, subject < 72 chars, scope here: `editor` (or none for cross-cutting docs/version).
- `npm run typecheck` && `npm run lint` must be green before every commit; `npm run test` (full suite) before finishing a task.
- Ships as **0.9.0** (bump in the final task). The release tag push / npm publish is NOT part of this plan — only after explicit user OK.
- **Label KEY renames are forbidden.** `tryIt` stays `tryIt` (only its default string becomes `"Preview"`); `addCard`/`addSection` keys and default strings (`"+ Card"`, `"+ Section"`) are unchanged — the icons render IN ADDITION to those strings. Exactly ONE new key: `addCardDisabledEmpty`, routed through `EditorLabels` with an English default like every other string.
- No new public exports: `editor-toolbar.tsx` stays package-internal (`src/editor/index.ts` untouched). `EditorCanvas` is already package-internal, so its prop changes are not semver-relevant.
- Preserve the 0.8.2 `p="5"` mode containers in `spec-editor.tsx` (the comment block above them included) — the toolbar replaces the header row, not the content insets.
- Token-first styling (`bg-subtle`, `border`, semantic tokens only); icons from lucide-react only; `displayName` on every exported React component.
- The internal mode state value stays `"tryit"` (like the label key, it predates the rename; renaming it would churn every mode conditional for zero user-visible gain).
- TDD: every task writes its failing test first (superpowers:test-driven-development).
- **Spec refinements (locked during planning):**
  1. **anker HAS a segmented control**: `SegmentedControl` from `@knkcs/anker/primitives` (Chakra v3 `SegmentGroup` underneath — a radio group). Verified in the installed `node_modules/@knkcs/anker/dist/primitives/index.d.ts` and in `~/repo/anker/src/primitives/segmented-control.tsx`, including per-item `disabled`. The two-Button fallback is NOT needed. Consequence for tests: the mode controls are `role="radio"` (no longer `role="button"`), and the disabled state lands on the hidden radio input (`toBeDisabled()` works unchanged).
  2. **Empty-spec "+ Card" tooltip**: new label `addCardDisabledEmpty` (default `"Add a field before adding cards"`), shown by wrapping the disabled Button in anker's `Tooltip` — the exact disabled-Button-in-Tooltip idiom the header already used for the gated Try-it button. Tooltip only in Build mode; in Preview the whole insert cluster is mode-disabled and needs no explanation.
  3. **"+ Section" keeps its open-rename-on-add** via `renameSectionPulse?: string | null` on `EditorCanvas` (rising-edge pulse, mirroring `autoFocusLabel`).
  4. **`activeTabIndex`/`onActiveTabChange` are REQUIRED props** (fully controlled, no internal fallback) — `EditorCanvas` is package-internal and every direct-render test harness gains a two-line state hook.
  5. **Sectionless canvas spacing**: the deleted ghost row's `mb="5"` provided the 20px the first field's overlay insertion boundary paints into; the 0.8.2 `p="5"` mode container now provides exactly that space, so NO replacement spacer is added.
  6. **Re-clicking the active Preview segment no longer re-bumps the Try-it remount nonce** (radio groups don't fire on the already-selected item). Entering Preview FROM Build always bumps — the semantics the spec pins ("fresh scratch form on every entry") are about entries, not re-clicks.
  7. **The canvas empty state's "+ Section" ghost button is removed too** — the toolbar is the single insert source and its "+ Section" stays enabled on an empty spec (only "+ Card" disables there).
  8. **`CanvasLabels` drops `addCard`/`addSection`/`newSectionName`** (the canvas no longer renders those strings; `newSectionName` moves to SpecEditor's handler). `sectionNameInput` stays (the inline rename input still lives in the canvas).

---

### Task 1: Lift the active tab — `EditorCanvas` becomes controlled

**Files:**
- Modify: `src/editor/editor-canvas.tsx` (props interface, destructure, `activeTab` state → derived string, reset effect, `handleAddSection`/`handleMoveSection`/`handleDeleteSection`/`handleDragOver`/`handleAddCard`, FieldSearch `onJump`, `Tabs.Root` `onValueChange`)
- Modify: `src/editor/spec-editor.tsx` (new `activeTabIndex` state, passed to `EditorCanvas`)
- Modify (harness updates, one pattern × 8 files): `src/editor/__tests__/editor-canvas.test.tsx`, `sections.test.tsx`, `rename-blur.test.tsx`, `insertion.test.tsx`, `dnd.test.tsx`, `max-per-spec.test.tsx`, `validation-surfacing.test.tsx`, `cards-canvas.test.tsx`
- Test: extend `src/editor/__tests__/editor-canvas.test.tsx` (controlled-contract describe) and `src/editor/__tests__/spec-editor.test.tsx` (wiring pin)

**Interfaces:**
- Consumes: `SpecDraft` (unchanged), zag Tabs' controlled `value`/`onValueChange`.
- Produces (used VERBATIM by Tasks 2a/2b):

```ts
export interface EditorCanvasProps {
	// …existing props unchanged…
	/** Controlled active tab (LIFTED to SpecEditor — toolbar spec 2026-07-13):
	 * the canvas renders this tab and reports every internally-caused change
	 * (tab click, tabdrop hover, section move/delete, shrink reset) here. */
	activeTabIndex: number;
	onActiveTabChange: (index: number) => void;
}
```

`SpecEditor` owns `const [activeTabIndex, setActiveTabIndex] = useState(0)`. Existing behavior pinned: tab switching, tab-shrink reset, section move/delete follow-the-fields (the sections.test.tsx suite runs unchanged through the updated harness — its harness state IS the lifted state now).

- [ ] **Step 1: Write the failing tests**

Append to `src/editor/__tests__/editor-canvas.test.tsx` (after the existing describe; reuses the file's `LABELS` and imports — add `makeSection` to the `./editor-helpers` import if not present; it already imports `EditorWrap, makeField, makeSection, testPlugins`):

```tsx
describe("EditorCanvas — controlled active tab (lifted state)", () => {
	function ControlledHarness({
		schema,
		activeTabIndex,
		onActiveTabChange,
	}: {
		schema: Schema;
		activeTabIndex: number;
		onActiveTabChange: (index: number) => void;
	}) {
		const spec = useSpecDraft(schema, testPlugins, vi.fn());
		return (
			<ConfirmModalProvider>
				<EditorCanvas
					spec={spec}
					plugins={testPlugins}
					selectedAccessor={null}
					onSelect={vi.fn()}
					onEdit={vi.fn()}
					labels={LABELS}
					activeTabIndex={activeTabIndex}
					onActiveTabChange={onActiveTabChange}
				/>
			</ConfirmModalProvider>
		);
	}

	const sectioned: Schema = [
		makeField("a"),
		makeSection("s1", "SEO"),
		makeField("b"),
	];

	it("renders the tab given by activeTabIndex", () => {
		render(
			<EditorWrap>
				<ControlledHarness
					schema={sectioned}
					activeTabIndex={1}
					onActiveTabChange={vi.fn()}
				/>
			</EditorWrap>,
		);
		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("reports tab clicks through onActiveTabChange WITHOUT switching on its own (fully controlled)", () => {
		const spy = vi.fn();
		render(
			<EditorWrap>
				<ControlledHarness
					schema={sectioned}
					activeTabIndex={0}
					onActiveTabChange={spy}
				/>
			</EditorWrap>,
		);
		fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		expect(spy).toHaveBeenCalledWith(1);
		// The parent ignored the report — a canvas with leftover INTERNAL tab
		// state would have switched anyway. This is the discriminating half.
		expect(screen.getByRole("tab", { name: /General/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});
```

In `src/editor/__tests__/spec-editor.test.tsx`, first extend the helpers import — replace:

```tsx
import { EditorWrap, makeField, testPlugins } from "./editor-helpers";
```

with:

```tsx
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";
```

then append inside the `describe("SpecEditor", …)` block:

```tsx
	it("owns the canvas's active tab: clicking a tab shows that tab's panel (lifted-state wiring)", () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);

		fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));

		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(
			screen.getByTestId("shell-b").closest("[role='tabpanel']"),
		).not.toHaveAttribute("hidden");
	});
```

Harness updates — the SAME two edits in EACH of the 8 files (`editor-canvas.test.tsx`, `sections.test.tsx`, `rename-blur.test.tsx`, `insertion.test.tsx`, `dnd.test.tsx`, `max-per-spec.test.tsx`, `validation-surfacing.test.tsx`, `cards-canvas.test.tsx`; in max-per-spec the component is named `CanvasHarness`, everywhere else `Harness`). Each file contains exactly one occurrence of each anchor. Replace:

```tsx
	const [selected, setSelected] = useState<string | null>(null);
```

with:

```tsx
	const [selected, setSelected] = useState<string | null>(null);
	const [activeTabIndex, setActiveTabIndex] = useState(0);
```

and replace:

```tsx
				labels={LABELS}
```

with:

```tsx
				labels={LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/editor-canvas.test.tsx src/editor/__tests__/spec-editor.test.tsx`
Expected: the new controlled-contract cases FAIL — React ignores the unknown `activeTabIndex` prop, the canvas's internal state stays on tab 0 ("renders the tab given by activeTabIndex" sees `aria-selected` on General), and the fully-controlled case fails because the internal state DOES switch on click. The spec-editor wiring pin passes (internal state still switches) — it exists to pin the behavior THROUGH the migration. `npm run typecheck` also fails (unknown props on `EditorCanvasProps`) — same signal.

- [ ] **Step 3: Implement — `editor-canvas.tsx`**

1. Props interface — replace:

```ts
	onDeleteField?: (field: Field, flatIndex: number) => void;
}
```

with:

```ts
	onDeleteField?: (field: Field, flatIndex: number) => void;
	/** Controlled active tab (LIFTED to SpecEditor — toolbar spec 2026-07-13):
	 * the canvas renders this tab and reports every internally-caused change
	 * (tab click, tabdrop hover, section move/delete, shrink reset) here. */
	activeTabIndex: number;
	onActiveTabChange: (index: number) => void;
}
```

2. Destructure — replace:

```tsx
	labels,
	onDeleteField,
}: EditorCanvasProps) {
```

with:

```tsx
	labels,
	onDeleteField,
	activeTabIndex,
	onActiveTabChange,
}: EditorCanvasProps) {
```

3. State → derived string — replace:

```tsx
	const { partition, draft, apply } = spec;
	const [activeTab, setActiveTab] = useState("tab-0");
```

with:

```tsx
	const { partition, draft, apply } = spec;
	// Fully controlled active tab (lifted to SpecEditor): this derived string
	// is only Tabs.Root's value dialect — the number is the source of truth.
	const activeTab = `tab-${activeTabIndex}`;
```

4. Shrink-reset effect — replace:

```tsx
	useEffect(() => {
		const activeIndex = Number(activeTab.replace("tab-", ""));
		if (activeIndex >= partition.tabs.length) setActiveTab("tab-0");
	}, [partition.tabs.length, activeTab]);
```

with:

```tsx
	useEffect(() => {
		// `!== 0` guard: an empty spec (0 tabs) with the default index 0 needs
		// no report — avoids a redundant parent call on every canvas mount.
		if (activeTabIndex !== 0 && activeTabIndex >= partition.tabs.length) {
			onActiveTabChange(0);
		}
	}, [partition.tabs.length, activeTabIndex, onActiveTabChange]);
```

5. `handleAddSection` — replace:

```ts
		// Appending a section always adds exactly one tab at the end,
		// regardless of the current tab count (0, 1 implicit, or many).
		setActiveTab(`tab-${partition.tabs.length}`);
```

with:

```ts
		// Appending a section always adds exactly one tab at the end,
		// regardless of the current tab count (0, 1 implicit, or many).
		onActiveTabChange(partition.tabs.length);
```

6. `handleMoveSection` — replace:

```ts
		if (next !== draft) {
			const activeIndex = Number(activeTab.replace("tab-", ""));
			const movedTabIndex = partition.tabs.findIndex(
				(tab) => tab.section?.config.api_accessor === accessor,
			);
			if (movedTabIndex !== -1) {
				if (activeIndex === movedTabIndex) {
					// Viewing the section that moved: follow it to its new index.
					setActiveTab(`tab-${activeIndex + direction}`);
				} else if (activeIndex === movedTabIndex + direction) {
					// Viewing the neighbor it swapped places with: follow the swap.
					setActiveTab(`tab-${activeIndex - direction}`);
				}
			}
		}
```

with:

```ts
		if (next !== draft) {
			const movedTabIndex = partition.tabs.findIndex(
				(tab) => tab.section?.config.api_accessor === accessor,
			);
			if (movedTabIndex !== -1) {
				if (activeTabIndex === movedTabIndex) {
					// Viewing the section that moved: follow it to its new index.
					onActiveTabChange(activeTabIndex + direction);
				} else if (activeTabIndex === movedTabIndex + direction) {
					// Viewing the neighbor it swapped places with: follow the swap.
					onActiveTabChange(activeTabIndex - direction);
				}
			}
		}
```

7. `handleDeleteSection` — replace:

```ts
		const deletedIndex = partition.tabs.findIndex(
			(tab) => tab.section?.config.api_accessor === accessor,
		);
		const activeIndex = Number(activeTab.replace("tab-", ""));
		if (deletedIndex !== -1 && activeIndex >= deletedIndex) {
			setActiveTab(`tab-${Math.max(0, activeIndex - 1)}`);
		}
```

with:

```ts
		const deletedIndex = partition.tabs.findIndex(
			(tab) => tab.section?.config.api_accessor === accessor,
		);
		if (deletedIndex !== -1 && activeTabIndex >= deletedIndex) {
			onActiveTabChange(Math.max(0, activeTabIndex - 1));
		}
```

8. `handleDragOver` — replace:

```ts
		setActiveTab(`tab-${overId.slice("tabdrop-".length)}`);
```

with:

```ts
		onActiveTabChange(Number(overId.slice("tabdrop-".length)));
```

9. `handleAddCard` — replace:

```ts
	const handleAddCard = () => {
		const activeIndex = Number(activeTab.replace("tab-", ""));
		// Sectionless canvases have one tab (index 0) and no Tabs.Root driving
		// activeTab — clamp so the untouched "tab-0" default always resolves.
		const tabIndex = Math.min(
			Number.isNaN(activeIndex) ? 0 : activeIndex,
			Math.max(0, partition.tabs.length - 1),
		);
```

with:

```ts
	const handleAddCard = () => {
		// Sectionless canvases have one tab (index 0) — clamp so any stale
		// controlled index still resolves to a real tab.
		const tabIndex = Math.min(
			activeTabIndex,
			Math.max(0, partition.tabs.length - 1),
		);
```

10. FieldSearch `onJump` — replace:

```tsx
									onJump={(r) => {
										setActiveTab(`tab-${r.tabIndex}`);
										onSelect(r.accessor);
									}}
```

with:

```tsx
									onJump={(r) => {
										onActiveTabChange(r.tabIndex);
										onSelect(r.accessor);
									}}
```

11. `Tabs.Root` — replace:

```tsx
						<Tabs.Root
							value={activeTab}
							onValueChange={(e) => setActiveTab(e.value)}
							orientation={orientation}
						>
```

with:

```tsx
						<Tabs.Root
							value={activeTab}
							onValueChange={(e) =>
								onActiveTabChange(Number(e.value.replace("tab-", "")))
							}
							orientation={orientation}
						>
```

- [ ] **Step 4: Implement — `spec-editor.tsx`**

1. Add the lifted state — replace:

```ts
	const [tryItNonce, setTryItNonce] = useState(0);
```

with:

```ts
	const [tryItNonce, setTryItNonce] = useState(0);
	// Active canvas tab, LIFTED from EditorCanvas (toolbar spec 2026-07-13):
	// the toolbar's "+ Card" targets it (Task 2a), and future tab-scoped
	// features (deep-linking, per-tab actions) read it here. EditorCanvas is
	// fully controlled — every internal cause of a tab change reports back
	// through onActiveTabChange.
	const [activeTabIndex, setActiveTabIndex] = useState(0);
```

2. Pass the props — replace:

```tsx
								onDeleteField={handleDeleteField}
								labels={mergedLabels}
							/>
```

with:

```tsx
								onDeleteField={handleDeleteField}
								labels={mergedLabels}
								activeTabIndex={activeTabIndex}
								onActiveTabChange={setActiveTabIndex}
							/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — both controlled-contract cases green; every existing canvas suite (sections' delete/move follow-the-fields, dnd's tabdrop hover, cards-canvas's active-tab "+ Card") green through the updated harnesses.

- [ ] **Step 6: Full gates + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "refactor(editor): lift canvas active tab to SpecEditor"
```

---

### Task 2a: `editor-toolbar.tsx` + SpecEditor integration (Preview rename)

The unified bar lands and the mode buttons become the segmented control; the canvas's floating row SURVIVES this task (deleted in 2b) so every commit stays green — canvas-level suites that click it are untouched until their replacements exist.

**Files:**
- Create: `src/editor/editor-toolbar.tsx`
- Modify: `src/editor/spec-editor.tsx` (labels key + default rename, imports, insert handlers, rename pulse, title-above-bar, toolbar render replacing the header Flex)
- Modify: `src/editor/editor-canvas.tsx` (`renameSectionPulse` prop + consuming effect)
- Modify: `src/editor/spec-editor.stories.tsx` (TryIt / InvalidDraft / BuildWithCards note texts)
- Test: Create `src/editor/__tests__/editor-toolbar.test.tsx`; modify `spec-editor.test.tsx`, `try-it.test.tsx`, `cards-editor.test.tsx`

**Interfaces:**
- Consumes: `SegmentedControl`, `Tooltip` (`@knkcs/anker/primitives`), `Button`, `DirtyDot` (`@knkcs/anker/atoms`), `PanelTop`/`LayoutDashboard` (lucide — the `cardPlugin`/`sectionPlugin` icons), `insertCard`/`addSection` (`./draft-ops`), `partitionSchemaBySections`, the lifted `activeTabIndex` (Task 1).
- Produces (package-internal):

```ts
export type EditorToolbarLabels = Pick<
	Required<EditorLabels>,
	| "addCard" | "addSection" | "addCardDisabledEmpty"
	| "build" | "tryIt" | "fixValidationFirst"
	| "discard" | "save" | "dirty"
>;

export interface EditorToolbarProps {
	mode: "build" | "tryit";
	dirty: boolean;
	saving: boolean;
	canPreview: boolean; // validation.valid — gates Preview segment AND Save
	specEmpty: boolean; // draft.length === 0 — disables + Card w/ tooltip
	labels: EditorToolbarLabels;
	onAddCard: () => void;
	onAddSection: () => void;
	onModeChange: (mode: "build" | "tryit") => void;
	onDiscard: () => void;
	onSave: () => void;
}
```

  Plus: `EditorLabels` gains `addCardDisabledEmpty` (default `"Add a field before adding cards"`); `DEFAULT_EDITOR_LABELS.tryIt` becomes `"Preview"`; `EditorCanvasProps` gains `renameSectionPulse?: string | null`. The toolbar root carries `data-testid="editor-toolbar"` (Task 2b's depth-pin test anchors on it).

- [ ] **Step 1: Write the failing tests**

Create `src/editor/__tests__/editor-toolbar.test.tsx`:

```tsx
// src/editor/__tests__/editor-toolbar.test.tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker Menu/Tooltip/Popover positioning needs ResizeObserver and
// IntersectionObserver — both unimplemented in jsdom (cards-editor.test.tsx
// rationale; the panel opens after "+ Card").
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const L = DEFAULT_EDITOR_LABELS;

function renderEditor(schema: Schema, title?: ReactNode) {
	return render(
		<EditorWrap>
			<SpecEditor
				schema={schema}
				onCommit={vi.fn()}
				plugins={testPlugins}
				title={title}
			/>
		</EditorWrap>,
	);
}

/** Queries scoped to the bar — while Task 2b hasn't deleted the canvas's
 * floating row yet, "+ Card"/"+ Section" exist twice. */
function toolbar() {
	return within(screen.getByTestId("editor-toolbar"));
}

describe("SpecEditor — unified toolbar (A2)", () => {
	it("renders ONE bar: inserts left; dirty-dot, mode control, Discard, Save right", () => {
		renderEditor([makeField("a")]);
		const bar = toolbar();
		expect(bar.getByRole("button", { name: L.addCard })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.addSection })).toBeInTheDocument();
		expect(bar.getByRole("radio", { name: L.build })).toBeChecked();
		expect(bar.getByRole("radio", { name: L.tryIt })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.discard })).toBeInTheDocument();
		expect(bar.getByRole("button", { name: L.save })).toBeInTheDocument();
	});

	it('the Preview segment uses the renamed DEFAULT string (key still "tryIt")', () => {
		renderEditor([makeField("a")]);
		expect(L.tryIt).toBe("Preview");
		expect(
			toolbar().getByRole("radio", { name: "Preview" }),
		).toBeInTheDocument();
	});

	it("Preview mode DISABLES the insert buttons without hiding them (bar keeps its shape)", async () => {
		renderEditor([makeField("a")]);
		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		});
		const bar = toolbar();
		expect(bar.getByRole("button", { name: L.addCard })).toBeDisabled();
		expect(bar.getByRole("button", { name: L.addSection })).toBeDisabled();

		await act(async () => {
			fireEvent.click(screen.getByRole("radio", { name: L.build }));
		});
		expect(bar.getByRole("button", { name: L.addCard })).not.toBeDisabled();
		expect(bar.getByRole("button", { name: L.addSection })).not.toBeDisabled();
	});

	it("empty spec: + Card is disabled (tooltip-wrapped) while + Section stays enabled", () => {
		renderEditor([]);
		expect(toolbar().getByRole("button", { name: L.addCard })).toBeDisabled();
		expect(
			toolbar().getByRole("button", { name: L.addSection }),
		).not.toBeDisabled();
	});

	it("+ Card inserts into the ACTIVE NON-FIRST tab (pins the lifted tab state)", async () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addCard }));
		});

		// Auto-wrap for "b" + the new empty card — BOTH inside the SEO panel.
		// A toolbar hard-coding tab 0 would have carded "a" instead: this is
		// the failure the spec's Testing section demands be discriminating.
		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2);
		const seoPanel = screen.getByTestId("shell-b").closest("[role='tabpanel']");
		for (const frame of frames) {
			expect(frame.closest("[role='tabpanel']")).toBe(seoPanel);
		}
		expect(
			screen.getByTestId("shell-a").closest("[data-testid^='card-frame-']"),
		).toBeNull();
	});

	it("+ Card auto-wraps loose fields, appends an empty card, and opens it in the panel", async () => {
		renderEditor([makeField("a"), makeField("b")]);
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addCard }));
		});

		const frames = screen.getAllByTestId(/^card-frame-/);
		expect(frames).toHaveLength(2);
		expect(within(frames[0]).getByTestId("shell-a")).toBeInTheDocument();
		expect(within(frames[0]).getByTestId("shell-b")).toBeInTheDocument();
		expect(within(frames[1]).queryAllByTestId(/^shell-/)).toEqual([]);
		// Both markers untitled → italic placeholder in each frame header.
		expect(screen.getAllByText(L.cardUntitled)).toHaveLength(2);
		// The NEW card (not the wrap) is selected: the panel opens on its
		// (empty) Name input — insertCard's last-marker contract via onEdit.
		expect(screen.getByTestId("panel-card-name-input")).toHaveValue("");
	});

	it("+ Section appends a tab and opens its inline rename input (pulse across the toolbar boundary)", async () => {
		renderEditor([makeField("a")]);
		await act(async () => {
			fireEvent.click(toolbar().getByRole("button", { name: L.addSection }));
		});

		const input = screen.getByDisplayValue(L.newSectionName);
		fireEvent.change(input, { target: { value: "Details" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByRole("tab", { name: /Details/ })).toBeInTheDocument();
	});

	it("title renders on its own line ABOVE the toolbar, never inside it", () => {
		renderEditor([makeField("a")], <h2>Article spec</h2>);
		const heading = screen.getByRole("heading", { name: "Article spec" });
		const bar = screen.getByTestId("editor-toolbar");
		expect(bar.contains(heading)).toBe(false);
		expect(
			heading.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});
});
```

Update `src/editor/__tests__/spec-editor.test.tsx` — the mode controls become radios (segmented control), FOUR edits:

1. Replace (the Build round-trip test):

```tsx
		fireEvent.click(screen.getByRole("button", { name: L.tryIt }));
		const input = screen.getByTestId("field-title");
		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");

		fireEvent.click(screen.getByRole("button", { name: L.build }));
		fireEvent.click(screen.getByRole("button", { name: L.tryIt }));
```

with:

```tsx
		fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
		const input = screen.getByTestId("field-title");
		fireEvent.change(input, { target: { value: "Hello" } });
		expect(input).toHaveValue("Hello");

		fireEvent.click(screen.getByRole("radio", { name: L.build }));
		fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
```

2. Replace:

```tsx
	it("Try-it is disabled when the draft is invalid (a Tooltip explains why)", () => {
		renderEditor([makeField("dup"), makeField("dup")]);
		expect(screen.getByRole("button", { name: L.tryIt })).toBeDisabled();
	});
```

with:

```tsx
	it("the Preview segment is disabled when the draft is invalid (a Tooltip explains why)", () => {
		renderEditor([makeField("dup"), makeField("dup")]);
		expect(screen.getByRole("radio", { name: L.tryIt })).toBeDisabled();
	});
```

3. + 4. The remaining two mode-switch call sites (in the label-passthrough test and the discard-while-in-Try-it test) — replace BOTH occurrences (use `replace_all`):

```tsx
		fireEvent.click(screen.getByRole("button", { name: L.tryIt }));
```

with:

```tsx
		fireEvent.click(screen.getByRole("radio", { name: L.tryIt }));
```

Update `src/editor/__tests__/try-it.test.tsx` — replace:

```tsx
		fireEvent.click(screen.getByRole("button", { name: "Try it" }));
```

with:

```tsx
		fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
```

Update `src/editor/__tests__/cards-editor.test.tsx` — replace:

```tsx
	it("hand-written loose fields in a carded tab outline invalid and disable Try it", () => {
		renderEditor([makeField("a"), makeCard("c1", "One"), makeField("b")]);

		expect(screen.getByTestId("shell-a")).toHaveAttribute(
			"data-invalid",
			"true",
		);
		expect(screen.getByRole("button", { name: "Try it" })).toBeDisabled();
	});
```

with:

```tsx
	it("hand-written loose fields in a carded tab outline invalid and disable Preview", () => {
		renderEditor([makeField("a"), makeCard("c1", "One"), makeField("b")]);

		expect(screen.getByTestId("shell-a")).toHaveAttribute(
			"data-invalid",
			"true",
		);
		expect(screen.getByRole("radio", { name: "Preview" })).toBeDisabled();
	});
```

and replace:

```tsx
			fireEvent.click(screen.getByRole("button", { name: "Try it" }));
```

with:

```tsx
			fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/editor-toolbar.test.tsx src/editor/__tests__/spec-editor.test.tsx src/editor/__tests__/try-it.test.tsx src/editor/__tests__/cards-editor.test.tsx`
Expected: editor-toolbar.test FAILS (no `editor-toolbar` testid, no radios); the updated spec-editor/try-it/cards-editor cases FAIL (no `role="radio"`, default still `"Try it"`, `L.tryIt !== "Preview"`).

- [ ] **Step 3: Implement — create `src/editor/editor-toolbar.tsx`**

```tsx
// src/editor/editor-toolbar.tsx
import { Flex } from "@chakra-ui/react";
import { Button, DirtyDot } from "@knkcs/anker/atoms";
import { SegmentedControl, Tooltip } from "@knkcs/anker/primitives";
import { LayoutDashboard, PanelTop } from "lucide-react";
import type { EditorLabels } from "./spec-editor";

/** The toolbar's strings — a Pick of EditorLabels' flat keys (the
 * CanvasLabels pattern), so SpecEditor's mergedLabels satisfies it
 * structurally with no mapping layer. */
export type EditorToolbarLabels = Pick<
	Required<EditorLabels>,
	| "addCard"
	| "addSection"
	| "addCardDisabledEmpty"
	| "build"
	| "tryIt"
	| "fixValidationFirst"
	| "discard"
	| "save"
	| "dirty"
>;

export interface EditorToolbarProps {
	/** "tryit" is Preview's INTERNAL value — frozen like the `tryIt` label
	 * key; only the default STRING was renamed in 0.9.0. */
	mode: "build" | "tryit";
	dirty: boolean;
	saving: boolean;
	/** `validation.valid` — one source of truth gating the Preview segment
	 * AND Save, exactly as the pre-toolbar header did. */
	canPreview: boolean;
	/** True when the draft has no fields at all: + Card disables with the
	 * `addCardDisabledEmpty` tooltip. + Section stays enabled — sections can
	 * be added to an empty spec. */
	specEmpty: boolean;
	labels: EditorToolbarLabels;
	onAddCard: () => void;
	onAddSection: () => void;
	onModeChange: (mode: "build" | "tryit") => void;
	onDiscard: () => void;
	onSave: () => void;
}

/**
 * The editor's single chrome row (toolbar spec 2026-07-13, composition A2):
 * ▦ Card, ⊞ Section, spacer, dirty-dot, Build|Preview segmented control,
 * Discard, Save. Pure presentational — every state and callback is a prop;
 * SpecEditor stays the orchestrator. Preview DISABLES (never hides) the
 * insert buttons so the bar keeps its shape across modes. Button icons are
 * the structural plugins' own (cardPlugin: PanelTop, sectionPlugin:
 * LayoutDashboard).
 */
export function EditorToolbar({
	mode,
	dirty,
	saving,
	canPreview,
	specEmpty,
	labels,
	onAddCard,
	onAddSection,
	onModeChange,
	onDiscard,
	onSave,
}: EditorToolbarProps) {
	const build = mode === "build";

	const addCardButton = (
		<Button
			variant="outline"
			size="sm"
			disabled={!build || specEmpty}
			onClick={onAddCard}
		>
			<PanelTop size={14} />
			{labels.addCard}
		</Button>
	);

	const modeControl = (
		<SegmentedControl
			size="sm"
			value={mode}
			onValueChange={({ value }) => {
				if (value === "build" || value === "tryit") onModeChange(value);
			}}
			items={[
				{ value: "build", label: labels.build },
				// Inherits Try-it's gating: disabled while the draft is invalid.
				// SpecEditor's handleEnterTryIt keeps its own guard as
				// defense-in-depth.
				{ value: "tryit", label: labels.tryIt, disabled: !canPreview },
			]}
		/>
	);

	return (
		<Flex
			as="header"
			align="center"
			justify="space-between"
			gap="2"
			borderBottomWidth="1px"
			bg="bg-subtle"
			p="2"
			data-testid="editor-toolbar"
		>
			<Flex align="center" gap="2">
				{build && specEmpty ? (
					// Disabled-Button-in-Tooltip: the same idiom the old header used
					// for the gated Try-it button. Only the EMPTY reason gets a
					// tooltip — in Preview the whole cluster is mode-disabled and
					// self-explanatory.
					<Tooltip content={labels.addCardDisabledEmpty}>
						{addCardButton}
					</Tooltip>
				) : (
					addCardButton
				)}
				<Button
					variant="outline"
					size="sm"
					disabled={!build}
					onClick={onAddSection}
				>
					<LayoutDashboard size={14} />
					{labels.addSection}
				</Button>
			</Flex>
			<Flex align="center" gap="2">
				<DirtyDot active={dirty} label={labels.dirty} />
				{canPreview ? (
					modeControl
				) : (
					<Tooltip content={labels.fixValidationFirst}>{modeControl}</Tooltip>
				)}
				<Button
					variant="outline"
					size="sm"
					disabled={!dirty || saving}
					onClick={onDiscard}
				>
					{labels.discard}
				</Button>
				<Button
					variant="solid"
					size="sm"
					disabled={!dirty || !canPreview || saving}
					loading={saving}
					onClick={onSave}
				>
					{labels.save}
				</Button>
			</Flex>
		</Flex>
	);
}
EditorToolbar.displayName = "EditorToolbar";
```

- [ ] **Step 4: Implement — `spec-editor.tsx` integration**

1. Imports — replace:

```tsx
import { Box, Flex, Stack } from "@chakra-ui/react";
import { Button, DirtyDot } from "@knkcs/anker/atoms";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { Alert, Toaster, Tooltip, toaster } from "@knkcs/anker/primitives";
```

with:

```tsx
import { Box, Flex, Stack } from "@chakra-ui/react";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { Alert, Toaster, toaster } from "@knkcs/anker/primitives";
```

then replace:

```tsx
import { mergeLabels } from "../renderer/merge-labels";
```

with:

```tsx
import { mergeLabels } from "../renderer/merge-labels";
import { partitionSchemaBySections } from "../schema/partition";
```

then replace:

```tsx
import { insertFieldAt, updateField } from "./draft-ops";
import { EditorCanvas } from "./editor-canvas";
```

with:

```tsx
import {
	addSection,
	insertCard,
	insertFieldAt,
	updateField,
} from "./draft-ops";
import { EditorCanvas } from "./editor-canvas";
import { EditorToolbar } from "./editor-toolbar";
```

2. `EditorLabels` — replace:

```ts
	// cards
	addCard?: string;
```

with:

```ts
	// cards
	addCard?: string;
	/** Tooltip on the toolbar's disabled "+ Card" while the spec has no
	 * fields (Build mode only — Preview disables the whole insert cluster
	 * without a tooltip). */
	addCardDisabledEmpty?: string;
```

3. Defaults — replace:

```ts
	addCard: "+ Card",
```

with:

```ts
	addCard: "+ Card",
	addCardDisabledEmpty: "Add a field before adding cards",
```

and the Preview rename — replace:

```ts
	tryIt: "Try it",
```

with:

```ts
	// 0.9.0: default STRING renamed to "Preview"; the KEY is frozen (hosts
	// overriding `tryIt` are untouched by the rename).
	tryIt: "Preview",
```

4. Rename pulse state — replace (the Task 1 block):

```ts
	const [activeTabIndex, setActiveTabIndex] = useState(0);
```

with:

```ts
	const [activeTabIndex, setActiveTabIndex] = useState(0);
	// "+ Section" lives in the toolbar (here) but the new section's inline
	// rename input lives inside EditorCanvas — the accessor crosses that
	// boundary as a one-shot pulse (same idiom as autoFocusLabel below).
	const [sectionRenamePulse, setSectionRenamePulse] = useState<string | null>(
		null,
	);
```

and add the reset effect directly after the existing `autoFocusLabel` pulse effect — replace:

```ts
	// autoFocusLabel is a PULSE: reset right after so the NEXT Edit produces a
	// fresh rising edge in the panel even without it unmounting in between.
	useEffect(() => {
		if (autoFocusLabel) setAutoFocusLabel(false);
	}, [autoFocusLabel]);
```

with:

```ts
	// autoFocusLabel is a PULSE: reset right after so the NEXT Edit produces a
	// fresh rising edge in the panel even without it unmounting in between.
	useEffect(() => {
		if (autoFocusLabel) setAutoFocusLabel(false);
	}, [autoFocusLabel]);

	// sectionRenamePulse is the same kind of PULSE: the canvas consumes it
	// (child effects run before parent effects), then this reset re-arms the
	// rising edge for back-to-back "+ Section" clicks.
	useEffect(() => {
		if (sectionRenamePulse != null) setSectionRenamePulse(null);
	}, [sectionRenamePulse]);
```

5. Toolbar handlers — replace:

```ts
	function handleDiscard() {
		spec.discard();
		setSelected(null);
		// A Try-it view mounted against the pre-discard draft would keep its
		// scratch values; remount it against the reset draft.
		setTryItNonce((n) => n + 1);
		renameBaselinesRef.current.clear();
	}
```

with:

```ts
	function handleDiscard() {
		spec.discard();
		setSelected(null);
		// A Try-it view mounted against the pre-discard draft would keep its
		// scratch values; remount it against the reset draft.
		setTryItNonce((n) => n + 1);
		renameBaselinesRef.current.clear();
	}

	function handleModeChange(next: "build" | "tryit") {
		if (next === "build") setMode("build");
		else handleEnterTryIt();
	}

	// Toolbar "+ Card": appends an untitled card to the ACTIVE tab — the
	// lifted activeTabIndex is exactly why the tab state lives here. Ported
	// from EditorCanvas's pre-toolbar handleAddCard; insertCard semantics
	// unchanged (incl. the first-card auto-wrap).
	function handleAddCard() {
		// Sectionless drafts have one tab (index 0) — clamp so a stale index
		// always resolves to a real tab.
		const tabIndex = Math.min(
			activeTabIndex,
			Math.max(0, spec.partition.tabs.length - 1),
		);
		const next = insertCard(spec.draft, tabIndex);
		if (next === spec.draft) return; // empty spec: no tab to add to
		spec.apply(next);
		// insertCard's contract: the freshly appended card is the LAST card
		// marker of the target tab — select it via handleEdit, which also
		// pulses the panel's Name autofocus so the author can title it.
		const newTab = partitionSchemaBySections(next).tabs[tabIndex];
		const added = [...(newTab?.fields ?? [])]
			.reverse()
			.find((f) => f.field_type === "card");
		if (added) handleEdit(added.config.api_accessor);
	}

	// Toolbar "+ Section": addSection semantics unchanged (append + open the
	// inline rename input, which lives in the canvas — hence the pulse).
	function handleAddSection() {
		const next = addSection(spec.draft, mergedLabels.newSectionName);
		const added = next[next.length - 1];
		spec.apply(next);
		// Appending a section always adds exactly one tab at the end,
		// regardless of the current tab count (0, 1 implicit, or many).
		setActiveTabIndex(spec.partition.tabs.length);
		setSectionRenamePulse(added.config.api_accessor);
	}
```

6. Delete the `tryItButton` block entirely:

```tsx
	const tryItButton = (
		<Button
			variant={mode === "tryit" ? "solid" : "ghost"}
			size="sm"
			disabled={!spec.validation.valid}
			onClick={handleEnterTryIt}
		>
			{mergedLabels.tryIt}
		</Button>
	);
```

(replace with nothing).

7. Replace the header row — replace:

```tsx
				<Flex
					as="header"
					align="center"
					justify="space-between"
					borderBottomWidth="1px"
					bg="bg-subtle"
					p="2"
				>
					<Flex align="center" gap="2">
						{title}
						<DirtyDot active={spec.dirty} label={mergedLabels.dirty} />
					</Flex>
					<Flex align="center" gap="2">
						<Button
							variant={mode === "build" ? "solid" : "ghost"}
							size="sm"
							onClick={() => setMode("build")}
						>
							{mergedLabels.build}
						</Button>
						{spec.validation.valid ? (
							tryItButton
						) : (
							<Tooltip content={mergedLabels.fixValidationFirst}>
								{tryItButton}
							</Tooltip>
						)}
						<Button
							variant="outline"
							size="sm"
							disabled={!spec.dirty || spec.saving}
							onClick={handleDiscard}
						>
							{mergedLabels.discard}
						</Button>
						<Button
							variant="solid"
							size="sm"
							disabled={!spec.dirty || !spec.validation.valid || spec.saving}
							loading={spec.saving}
							onClick={() => spec.save()}
						>
							{mergedLabels.save}
						</Button>
					</Flex>
				</Flex>
```

with:

```tsx
				{/* Title on its own line ABOVE the toolbar (spec Decision 4: no
				    title inside the bar — hosts like mediahub already render a
				    page heading; nothing is duplicated). */}
				{title != null && (
					<Box px="2" pt="2">
						{title}
					</Box>
				)}
				<EditorToolbar
					mode={mode}
					dirty={spec.dirty}
					saving={spec.saving}
					canPreview={spec.validation.valid}
					specEmpty={spec.draft.length === 0}
					labels={mergedLabels}
					onAddCard={handleAddCard}
					onAddSection={handleAddSection}
					onModeChange={handleModeChange}
					onDiscard={handleDiscard}
					onSave={() => spec.save()}
				/>
```

8. Pass the pulse to the canvas — replace:

```tsx
								activeTabIndex={activeTabIndex}
								onActiveTabChange={setActiveTabIndex}
							/>
```

with:

```tsx
								activeTabIndex={activeTabIndex}
								onActiveTabChange={setActiveTabIndex}
								renameSectionPulse={sectionRenamePulse}
							/>
```

- [ ] **Step 5: Implement — `editor-canvas.tsx` rename pulse**

1. Props — replace:

```ts
	activeTabIndex: number;
	onActiveTabChange: (index: number) => void;
}
```

with:

```ts
	activeTabIndex: number;
	onActiveTabChange: (index: number) => void;
	/** One-shot pulse (autoFocusLabel idiom): when it rises to a section
	 * accessor, the canvas opens that section's inline rename input. Set by
	 * SpecEditor's toolbar "+ Section", reset by SpecEditor right after. */
	renameSectionPulse?: string | null;
}
```

2. Destructure — replace:

```tsx
	activeTabIndex,
	onActiveTabChange,
}: EditorCanvasProps) {
```

with:

```tsx
	activeTabIndex,
	onActiveTabChange,
	renameSectionPulse,
}: EditorCanvasProps) {
```

3. Consuming effect — insert directly after the tab shrink-reset effect (Task 1's step 3.4 block); replace:

```tsx
	useEffect(() => {
		// `!== 0` guard: an empty spec (0 tabs) with the default index 0 needs
		// no report — avoids a redundant parent call on every canvas mount.
		if (activeTabIndex !== 0 && activeTabIndex >= partition.tabs.length) {
			onActiveTabChange(0);
		}
	}, [partition.tabs.length, activeTabIndex, onActiveTabChange]);
```

with:

```tsx
	useEffect(() => {
		// `!== 0` guard: an empty spec (0 tabs) with the default index 0 needs
		// no report — avoids a redundant parent call on every canvas mount.
		if (activeTabIndex !== 0 && activeTabIndex >= partition.tabs.length) {
			onActiveTabChange(0);
		}
	}, [partition.tabs.length, activeTabIndex, onActiveTabChange]);

	// The toolbar's "+ Section" (SpecEditor) can't reach this canvas-internal
	// rename state — the new section's accessor arrives as a one-shot pulse.
	// startRename's body is inlined so the effect's deps stay exact.
	useEffect(() => {
		if (renameSectionPulse != null) {
			skipBlurRef.current = false;
			setRenaming(renameSectionPulse);
		}
	}, [renameSectionPulse]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — the whole editor suite, including the canvas suites still driving the (not-yet-deleted) floating row, and all Task 2a updates.

- [ ] **Step 7: Stories (note texts — the bar itself renders automatically)**

In `src/editor/spec-editor.stories.tsx`:

1. TryIt story note — replace:

```tsx
				note={
					<>
						Try-it mode is internal state on <code>SpecEditor</code> — there is no
						prop to force it open on mount, so this story renders the same as
						Build. Click <strong>Try it</strong> in the header above to preview
						the schema as a live, submittable form; click <strong>Build</strong>{" "}
						to return. The button is disabled whenever the draft has validation
						errors.
					</>
				}
```

with:

```tsx
				note={
					<>
						Preview mode is internal state on <code>SpecEditor</code> — there is
						no prop to force it open on mount, so this story renders the same as
						Build. Select <strong>Preview</strong> in the toolbar's mode control
						above to render the schema as a live, submittable form; select{" "}
						<strong>Build</strong> to return. The Preview segment is disabled
						whenever the draft has validation errors.
					</>
				}
```

2. InvalidDraft story note — replace:

```tsx
						selecting either field shows the inline duplicate-accessor message.{" "}
						<strong>Save</strong> and <strong>Try it</strong> stay disabled until
						the collision is resolved.
```

with:

```tsx
						selecting either field shows the inline duplicate-accessor message.{" "}
						<strong>Save</strong> and the <strong>Preview</strong> segment stay
						disabled until the collision is resolved.
```

3. BuildWithCards story note — replace:

```tsx
						card and fields" confirms first). "+ Card" on a tab with loose fields
						auto-wraps them. Click <strong>Try it</strong> to see the rendered
						card layout as a real form.
```

with:

```tsx
						card and fields" confirms first). "+ Card" (in the toolbar) on a tab
						with loose fields auto-wraps them. Select <strong>Preview</strong> to
						see the rendered card layout as a real form.
```

- [ ] **Step 8: Full gates + commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): unified toolbar, Preview mode segmented control"
```

---

### Task 2b: Retire the floating canvas insert row + test migration sweep

**Files:**
- Modify: `src/editor/editor-canvas.tsx` (delete `handleAddCard`/`handleAddSection`/`addCardButton`/`addSectionButton` + both render sites + the empty-state ghost button; import cleanup; `CanvasLabels` shrink; comment updates)
- Modify: `src/editor/__tests__/editor-toolbar.test.tsx` (depth-pin + single-source tests)
- Modify: `src/editor/__tests__/cards-canvas.test.tsx` (delete the two "+ Card" tests — replaced in 2a at editor level; LABELS cleanup)
- Modify: `src/editor/__tests__/sections.test.tsx` (delete the "+ Section appends" test — replaced in 2a at editor level; LABELS cleanup)
- Modify: `src/editor/__tests__/rename-blur.test.tsx` (rewrite against SpecEditor — the blur ordering now crosses the toolbar boundary)
- Modify (LABELS fixture cleanup only): `insertion.test.tsx`, `dnd.test.tsx`, `max-per-spec.test.tsx`, `validation-surfacing.test.tsx`, `editor-canvas.test.tsx`

**Interfaces:**
- Produces: `CanvasLabels` loses `addCard`, `addSection`, `newSectionName` from its `Pick`. No other signature changes.

- [ ] **Step 1: Write the failing tests**

Append to the describe block in `src/editor/__tests__/editor-toolbar.test.tsx`:

```tsx
	it("the old floating canvas row is GONE: inserts render only in the toolbar", () => {
		renderEditor([makeField("a"), makeSection("s1", "SEO"), makeField("b")]);
		const bar = screen.getByTestId("editor-toolbar");
		for (const label of [L.addCard, L.addSection]) {
			const hits = screen.getAllByText(label);
			expect(hits).toHaveLength(1);
			expect(bar.contains(hits[0])).toBe(true);
		}
	});

	it("empty spec: exactly ONE + Section anywhere (the empty-state ghost button is gone too) and it works", async () => {
		renderEditor([]);
		// getByText throws on >1 match — fails while the canvas empty state
		// still renders its own "+ Section".
		await act(async () => {
			fireEvent.click(screen.getByText(L.addSection));
		});
		expect(screen.getByDisplayValue(L.newSectionName)).toBeInTheDocument();
	});
```

Rewrite `src/editor/__tests__/rename-blur.test.tsx` in full (the in-progress-rename input lives in the canvas; "+ Section" now lives in SpecEditor's toolbar — the native blur-before-click ordering must survive that component boundary, which is exactly the regression this file pins):

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import {
	EditorWrap,
	makeField,
	makeSection,
	testPlugins,
} from "./editor-helpers";

// anker's Menu/Dialog positioning relies on @floating-ui/dom's autoUpdate,
// which requires ResizeObserver — unimplemented in jsdom. Stub it locally,
// mirroring sections.test.tsx's rationale.
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

// Mirrors sections.test.tsx's selectMenuItem: the underlying menu machine
// only invokes a selected item's onSelect once `highlightedValue` is set —
// normally via real mouse hover (PointerEvent, unimplemented in jsdom).
// Driving the open menu via Home + Enter exercises the same "select" path.
async function selectRenameMenuItem() {
	const menu = await screen.findByRole("menu");
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Home" }); // "Rename" is always first
	});
	await act(async () => {
		fireEvent.keyDown(menu, { key: "Enter" });
	});
}

function renderEditor(schema: Schema) {
	return render(
		<EditorWrap>
			<SpecEditor schema={schema} onCommit={vi.fn()} plugins={testPlugins} />
		</EditorWrap>,
	);
}

describe("SpecEditor rename blur ordering (toolbar + Section)", () => {
	it("commits an in-progress rename before + Section acts (native blur ordering across the toolbar boundary)", async () => {
		const user = userEvent.setup();
		renderEditor([makeSection("s1", "SEO"), makeField("b")]);

		// Enter rename mode via the section menu (sections.test.tsx idiom).
		await act(async () => {
			fireEvent.click(screen.getByLabelText("Section menu: SEO"));
		});
		await selectRenameMenuItem();

		const input = await screen.findByDisplayValue("SEO");

		// Type a new name WITHOUT pressing Enter — the rename is only
		// committed on blur or Enter, and this leaves it in-progress.
		await user.clear(input);
		await user.type(input, "Renamed");

		// user.click moves real focus to the toolbar's "+ Section" button
		// first, which fires a native blur on the still-focused rename input
		// (inside the canvas) BEFORE the button's own click handler runs in
		// SpecEditor — fireEvent.click cannot emulate this focus traversal.
		// getByText: with the canvas's floating row deleted, exactly ONE
		// "+ Section" exists — this query doubles as a single-source pin.
		await user.click(screen.getByText("+ Section"));

		// The rename committed via blur BEFORE the new section was added.
		expect(screen.getByRole("tab", { name: /Renamed/ })).toBeInTheDocument();
		// And the new section (which itself enters rename mode via the pulse,
		// defaulting to "New section") exists too.
		expect(screen.getByDisplayValue("New section")).toBeInTheDocument();
	});
});
```

Delete from `src/editor/__tests__/cards-canvas.test.tsx` the ENTIRE first two tests of the describe block — `"+ Card auto-wraps loose fields into an untitled card, then appends a new empty card"` (with its `onEditSpy` setup) and `"+ Card appends to the ACTIVE tab only"`. Both were re-homed at SpecEditor level in Task 2a's `editor-toolbar.test.tsx` ("+ Card auto-wraps…" / "+ Card inserts into the ACTIVE NON-FIRST tab…") — the behavior they pinned now lives in SpecEditor, not the canvas. No remaining test passes `onEditSpy`, so strip it from the Harness — replace:

```tsx
function Harness({
	schema,
	onSelectSpy,
	onEditSpy,
}: {
	schema: Schema;
	onSelectSpy?: (a: string | null) => void;
	onEditSpy?: (a: string) => void;
}) {
```

with:

```tsx
function Harness({
	schema,
	onSelectSpy,
}: {
	schema: Schema;
	onSelectSpy?: (a: string | null) => void;
}) {
```

and replace:

```tsx
				onEdit={(a) => {
					onEditSpy?.(a);
					setSelected(a);
				}}
```

with:

```tsx
				onEdit={(a) => setSelected(a)}
```

Delete from `src/editor/__tests__/sections.test.tsx` the ENTIRE first test — `"+ Section appends a tab and enters rename mode"` — re-homed in Task 2a as "+ Section appends a tab and opens its inline rename input".

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/editor-toolbar.test.tsx src/editor/__tests__/rename-blur.test.tsx src/editor/__tests__/cards-canvas.test.tsx src/editor/__tests__/sections.test.tsx`
Expected: the depth-pin FAILS (`getAllByText` finds 2 — toolbar + canvas row), the empty-spec single-source FAILS (`getByText` throws on 2 matches), rename-blur FAILS the same way at `user.click(screen.getByText("+ Section"))`. cards-canvas and sections pass (tests deleted, rest unaffected).

- [ ] **Step 3: Implement — delete the row from `editor-canvas.tsx`**

1. Imports — replace:

```tsx
import { Button, IconButton } from "@knkcs/anker/atoms";
```

with:

```tsx
import { IconButton } from "@knkcs/anker/atoms";
```

replace (delete the line):

```tsx
import { partitionSchemaBySections } from "../schema/partition";
```

with nothing, and in the draft-ops import block replace:

```tsx
import {
	addSection,
	createField,
```

with:

```tsx
import {
	createField,
```

and replace:

```tsx
	flatInsertIndex,
	insertCard,
	insertFieldAt,
```

with:

```tsx
	flatInsertIndex,
	insertFieldAt,
```

2. `CanvasLabels` — replace:

```ts
			| "addSection" // "+ Section" button label
			| "newSectionName" // default name for a freshly added section
			| "sectionNameInput" // aria-label for the inline rename input
			| "addCard" // "+ Card" button label
```

with:

```ts
			| "sectionNameInput" // aria-label for the inline rename input
```

(The keys moved with their consumers: `addCard`/`addSection` render in `EditorToolbar`, `newSectionName` is read by SpecEditor's `handleAddSection`.)

3. Delete `handleAddSection` entirely:

```ts
	const handleAddSection = () => {
		const next = addSection(draft, labels.newSectionName);
		const added = next[next.length - 1];
		apply(next);
		// Appending a section always adds exactly one tab at the end,
		// regardless of the current tab count (0, 1 implicit, or many).
		onActiveTabChange(partition.tabs.length);
		startRename(added.config.api_accessor);
	};
```

(replace with nothing).

4. Delete the button consts and `handleAddCard` — replace:

```tsx
	const addSectionButton = (
		<Button variant="ghost" size="xs" onClick={handleAddSection}>
			{labels.addSection}
		</Button>
	);

	const handleAddCard = () => {
		// Sectionless canvases have one tab (index 0) — clamp so any stale
		// controlled index still resolves to a real tab.
		const tabIndex = Math.min(
			activeTabIndex,
			Math.max(0, partition.tabs.length - 1),
		);
		const next = insertCard(draft, tabIndex);
		if (next === draft) return; // no tab to add to
		apply(next);
		// insertCard's contract: the freshly appended card is the LAST card
		// marker of the target tab — select it via onEdit, which also pulses
		// the panel's Name autofocus so the author can title it immediately.
		const newTab = partitionSchemaBySections(next).tabs[tabIndex];
		const added = [...(newTab?.fields ?? [])]
			.reverse()
			.find((f) => f.field_type === "card");
		if (added) onEdit(added.config.api_accessor);
	};

	const addCardButton = (
		<Button variant="ghost" size="xs" onClick={handleAddCard}>
			{labels.addCard}
		</Button>
	);
```

with nothing. (If Task 1's step 3.9 comment wording differs from the above — it was rewritten there — delete whatever `handleAddCard` body is present; the anchor is the whole `const addSectionButton … const addCardButton = (…);` span.)

5. Empty state — replace:

```tsx
						<Stack gap="3" align="center">
							<Text color="fg.muted">{labels.emptySpec}</Text>
							{insertionBoundary(0, 0, "flow", true)}
							{addSectionButton}
						</Stack>
```

with:

```tsx
						<Stack gap="3" align="center">
							<Text color="fg.muted">{labels.emptySpec}</Text>
							{insertionBoundary(0, 0, "flow", true)}
						</Stack>
```

6. Sectionless layout — replace:

```tsx
						<Box ref={containerRef}>
							{/* mb="5": the first field's overlay boundary reaches 20px above
							    the shell — this margin is the space it fills. */}
							<Flex justify="flex-end" gap="1" mb="5">
								{addCardButton}
								{addSectionButton}
							</Flex>
							{renderFields(partition.tabs[0].fields, 0)}
						</Box>
```

with:

```tsx
						{/* The first field's overlay boundary reaches 20px above the
						    shell — SpecEditor's p="5" mode container (0.8.2) provides
						    exactly that space now that the floating insert row is gone. */}
						<Box ref={containerRef}>
							{renderFields(partition.tabs[0].fields, 0)}
						</Box>
```

7. Sectioned layout — replace:

```tsx
								<Flex gap="1">
									{addCardButton}
									{addSectionButton}
								</Flex>
								<FieldSearch
```

with:

```tsx
								<FieldSearch
```

8. Comment truth — replace (inside `insertionBoundary`'s TypePickerPopover):

```tsx
					// "section"/"card" are inserted only via the strip's "+ Section"
					// and "+ Card" buttons — offering them here too would give
```

with:

```tsx
					// "section"/"card" are inserted only via the TOOLBAR's "+ Section"
					// and "+ Card" buttons (SpecEditor) — offering them here too would give
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — depth-pin, single-source, rename-blur all green; sections/cards-canvas/insertion/dnd suites green (the empty-state insertion-point test still passes: only the ghost button left, the ⊕ boundary stays).

- [ ] **Step 5: LABELS fixture cleanup (dead keys after the CanvasLabels shrink)**

In EACH of `sections.test.tsx`, `rename-blur.test.tsx` (skip — its LABELS const was deleted in the rewrite), `insertion.test.tsx`, `dnd.test.tsx`, `max-per-spec.test.tsx`, `validation-surfacing.test.tsx`, `editor-canvas.test.tsx`, replace:

```ts
	sectionMenu: "Section menu: {section}",
	addSection: "+ Section",
	newSectionName: "New section",
	sectionNameInput: "Section name",
```

with:

```ts
	sectionMenu: "Section menu: {section}",
	sectionNameInput: "Section name",
```

In `cards-canvas.test.tsx`, replace:

```ts
	addSection: "+ Section",
	newSectionName: "New section",
	sectionNameInput: "Section name",
	addCard: "+ Card",
	cardUntitled: "Untitled card",
```

with:

```ts
	sectionNameInput: "Section name",
	cardUntitled: "Untitled card",
```

(These consts are untyped object literals, so the stale keys compiled fine — this is hygiene, not a fix; the suite must stay green before AND after.)

- [ ] **Step 6: Full gates + commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): retire floating canvas insert row"
```

---

### Task 3: mdx contract + labels table + migration note + CLAUDE.md + version 0.9.0

**Files:**
- Modify: `src/editor/spec-editor.mdx`
- Modify: `CLAUDE.md` (editor directory-layout entries)
- Modify: `package.json` (`"version": "0.8.2"` → `"0.9.0"`)
- Modify: `package-lock.json` (via `npm install --package-lock-only`)

**Interfaces:**
- Consumes: everything above. Produces: release-ready branch. Tag push / npm publish NOT in this plan.

- [ ] **Step 1: `spec-editor.mdx` — toolbar contract, Preview sweep, labels, migration**

1. Intro — replace:

```
configure fields directly on a live preview of the form they're building, in
a **Build** mode, then flip to a **Try-it** mode to fill out and submit the
real thing. `SpecEditor` owns an internal draft session (see
```

with:

```
configure fields directly on a live preview of the form they're building, in
a **Build** mode, then flip to a **Preview** mode (label key `tryIt` — the
key predates the 0.9.0 rename) to fill out and submit the real thing.
`SpecEditor` owns an internal draft session (see
```

2. Props table `title` row — replace:

```
| `title`         | `ReactNode`                          | —       | Header-left slot, next to the dirty indicator — put a spec/content-type name here. |
```

with:

```
| `title`         | `ReactNode`                          | —       | Rendered on its own line **above the toolbar** — put a spec/content-type name here. Nothing renders when omitted. |
```

3. New toolbar contract section — insert directly before `## Build Mode` (i.e. replace the line `## Build Mode` with the block below):

```mdx
## The Toolbar

All editor chrome is ONE row (0.9.0, composition A2), left to right:

- **+ Card** and **+ Section** — outline buttons carrying the structural
  plugins' own icons (`PanelTop`, `LayoutDashboard`) beside their labels
  (`addCard`/`addSection`, defaults unchanged). "+ Card" appends an untitled
  card to the **active tab** (auto-wrap semantics unchanged — see
  [Cards](#cards)); "+ Section" appends a section and opens its inline
  rename input. Both are **disabled, never hidden**, in Preview mode — the
  bar keeps its shape across modes. "+ Card" is additionally disabled while
  the spec has no fields, with a tooltip (`labels.addCardDisabledEmpty`);
  "+ Section" works on an empty spec.
- **Dirty dot** — the unsaved-changes indicator (`labels.dirty`), beside
  the action cluster whose state it describes.
- **Build | Preview** — a segmented control (anker `SegmentedControl`; a
  radio group under the hood, so tests target `role="radio"`). The Preview
  segment is disabled while the draft has validation errors, with the
  `fixValidationFirst` tooltip. Switching semantics are unchanged: every
  entry into Preview mounts a fresh scratch form.
- **Discard** and **Save** (solid primary) — behavior unchanged.

The `title` prop renders on its own line above the bar; the bar itself
never contains it.

## Build Mode
```

4. Sections — replace:

```
"+ Section" appends a new section and immediately opens its rename input.
```

with:

```
"+ Section" (in the toolbar) appends a new section and immediately opens
its rename input.
```

5. Cards — replace:

```
**"+ Card"** (next to "+ Section") appends an empty, untitled card to the
active tab. Adding the FIRST card to a tab that already has loose fields
```

with:

```
**"+ Card"** (in the toolbar, next to "+ Section") appends an empty,
untitled card to the active tab. Adding the FIRST card to a tab that
already has loose fields
```

and replace:

```
`loose_field_in_carded_tab` on each loose field — those shells outline in
the danger color and Save/Try-it disable — while the canvas and renderer
```

with:

```
`loose_field_in_carded_tab` on each loose field — those shells outline in
the danger color and Save/Preview disable — while the canvas and renderer
```

6. Validation surfacing — replace:

```
trigger counting that tab's errors. **Save and Try-it are both disabled**
while `validation.valid` is `false` — Try-it's disabled state carries a
tooltip (`labels.fixValidationFirst`) explaining why. See the `InvalidDraft`
```

with:

```
trigger counting that tab's errors. **Save and the Preview segment are both
disabled** while `validation.valid` is `false` — Preview's disabled state
carries a tooltip (`labels.fixValidationFirst`) explaining why. See the `InvalidDraft`
```

7. Config panel section — replace:

```
panel can flip every preview's markers — asterisks on the required fields
versus a muted `(optional)` after the optional ones — the instant the
majority changes, without leaving Build mode. Try-it mode applies the
identical convention through the real `SpecForm`, so both modes render
markers exactly as the finished form will.
```

with:

```
panel can flip every preview's markers — asterisks on the required fields
versus a muted `(optional)` after the optional ones — the instant the
majority changes, without leaving Build mode. Preview mode applies the
identical convention through the real `SpecForm`, so both modes render
markers exactly as the finished form will.
```

8. Mode section — replace:

```
## Try-it Mode

Clicking **Try it** (disabled when the draft is invalid) mounts the draft
schema as a real, independent form — its own `react-hook-form` instance and
Zod resolver, sharing nothing with Build mode's scratch preview form or with
any host form. Submitting shows a success toast (`labels.testSubmitSuccess`);
nothing is persisted anywhere. **Every entry into Try-it force-remounts the
view** (via a bump counter), so scratch data typed in a previous visit can
never leak into or survive a later one. Clicking **Build** returns to
editing without losing the draft.
```

with:

```
## Preview Mode

Selecting **Preview** in the toolbar's mode control (disabled when the
draft is invalid) mounts the draft
schema as a real, independent form — its own `react-hook-form` instance and
Zod resolver, sharing nothing with Build mode's scratch preview form or with
any host form. Submitting shows a success toast (`labels.testSubmitSuccess`);
nothing is persisted anywhere. **Every entry into Preview force-remounts the
view** (via a bump counter), so scratch data typed in a previous visit can
never leak into or survive a later one. Selecting **Build** returns to
editing without losing the draft.
```

9. Labels table — replace:

```
| `unsavedChanges` | `"Unsaved changes"` | aria-label for per-field and per-tab dirty dots on the canvas and in Try-it (both pass through to `SpecForm`'s marker/tab-dot labels); the header's own dirty dot uses `dirty` instead |
```

with:

```
| `unsavedChanges` | `"Unsaved changes"` | aria-label for per-field and per-tab dirty dots on the canvas and in Preview (both pass through to `SpecForm`'s marker/tab-dot labels); the toolbar's own dirty dot uses `dirty` instead |
```

replace:

```
| `searchLabel` | `"Find field"` | Field search input's accessible name (aria-label; canvas + Try-it) |
```

with:

```
| `searchLabel` | `"Find field"` | Field search input's accessible name (aria-label; canvas + Preview) |
```

replace:

```
| `tabErrorsOne` | `"1 invalid field"` | Accessible name of a canvas tab's error badge at count 1 (canvas + Try-it) |
```

with:

```
| `tabErrorsOne` | `"1 invalid field"` | Accessible name of a canvas tab's error badge at count 1 (canvas + Preview) |
```

replace:

```
| `optionalMarker` | `"(optional)"` | §10 optional marker in canvas previews and Try-it (pass-through to SpecForm) |
```

with:

```
| `optionalMarker` | `"(optional)"` | §10 optional marker in canvas previews and Preview mode (pass-through to SpecForm) |
```

replace:

```
| `build` | `"Build"` | Header Build-mode toggle |
| `tryIt` | `"Try it"` | Header Try-it-mode toggle |
| `fixValidationFirst` | `"Fix validation errors before trying the form"` | Tooltip on a disabled Try-it button |
| `saveFailed` | `"Save failed"` | Error toast title on a rejected `onCommit` |
| `dirty` | `"Unsaved changes"` | Header dirty-dot indicator's aria-label |
| `testSubmit` | `"Test submit"` | Try-it's submit button |
| `testSubmitSuccess` | `"Form submitted successfully"` | Try-it's success toast |
| `addSection` | `"+ Section"` | Add-section button |
```

with:

```
| `build` | `"Build"` | Toolbar mode control, Build segment |
| `tryIt` | `"Preview"` | Toolbar mode control, Preview segment (key unchanged from the pre-0.9 "Try it" era; hosts overriding it are untouched) |
| `fixValidationFirst` | `"Fix validation errors before trying the form"` | Tooltip on the disabled Preview segment |
| `saveFailed` | `"Save failed"` | Error toast title on a rejected `onCommit` |
| `dirty` | `"Unsaved changes"` | Toolbar dirty-dot indicator's aria-label |
| `testSubmit` | `"Test submit"` | Preview mode's submit button |
| `testSubmitSuccess` | `"Form submitted successfully"` | Preview mode's success toast |
| `addSection` | `"+ Section"` | Toolbar add-section button (rendered with the section plugin's icon) |
```

replace:

```
| `addCard` | `"+ Card"` | Add-card button |
```

with:

```
| `addCard` | `"+ Card"` | Toolbar add-card button (rendered with the card plugin's icon) |
| `addCardDisabledEmpty` | `"Add a field before adding cards"` | Tooltip on the disabled + Card while the spec has no fields (Build mode) |
```

10. Migration note — insert before `## Migration from 0.1` (replace that heading line with):

```mdx
## Migration to 0.9.0

Visual-only rework — **no API changes**:

- The header's mode buttons and the canvas's floating "+ Card + Section"
  row merged into one toolbar. All props and all label KEYS are unchanged.
- The `tryIt` label's **default string** changed from `"Try it"` to
  `"Preview"`. Hosts overriding `labels.tryIt` keep their own string,
  untouched. Tests targeting the mode controls by role: the two mode
  buttons are now segments of a radio-group-based segmented control
  (`role="radio"`, no longer `role="button"`).
- `title` renders above the toolbar instead of inside the header row.
- One new label key: `addCardDisabledEmpty` — tooltip on the disabled
  "+ Card" over an empty spec (previously the button was simply absent on
  an empty canvas).

## Migration from 0.1
```

11. Known limitations — replace:

```
- **Toasts.** SpecEditor mounts anker's `<Toaster />` for its own toasts
  (save errors, delete-undo, Try-it submit). Hosts that mount a global
```

with:

```
- **Toasts.** SpecEditor mounts anker's `<Toaster />` for its own toasts
  (save errors, delete-undo, Preview submit). Hosts that mount a global
```

12. Examples — replace:

```
### Try It

Same spec as Build. `SpecEditor` keeps its Build/Try-it mode as internal
state with no prop to force it open on mount, so click **Try it** in the
header to preview the schema as a real, submittable form.
```

with:

```
### Try It

Same spec as Build. `SpecEditor` keeps its Build/Preview mode as internal
state with no prop to force it open on mount, so select **Preview** in the
toolbar's mode control to render the schema as a real, submittable form.
```

and replace:

```
headers carry a drag handle (block move), the title, and a ⋯ menu; "+ Card"
auto-wraps loose fields on first use in a tab. Flip to **Try it** to see
the rendered card layout.
```

with:

```
headers carry a drag handle (block move), the title, and a ⋯ menu; the
toolbar's "+ Card" auto-wraps loose fields on first use in a tab. Flip to
**Preview** to see the rendered card layout.
```

- [ ] **Step 2: CLAUDE.md directory layout**

Replace:

```
│   ├── spec-editor.tsx  # Public shell: header, Build/Try-it, Save/Discard, labels
```

with:

```
│   ├── spec-editor.tsx  # Public shell: Build/Preview modes, Save/Discard, labels, insert handlers
│   ├── editor-toolbar.tsx # Unified toolbar row: + Card/+ Section, mode control, Discard/Save
```

- [ ] **Step 3: Version bump + lockfile**

In `package.json`, replace `"version": "0.8.2",` with `"version": "0.9.0",` then sync the lockfile:

```bash
npm install --package-lock-only
```

- [ ] **Step 4: Full gates**

Run: `npm run test && npm run typecheck && npm run lint && npm run verify-exports && npm run build && npm run build:storybook`
Expected: all PASS (verify-exports: no public-surface change expected; build:storybook renders the updated notes and mdx).

- [ ] **Step 5: Commit**

```bash
git add src/editor/spec-editor.mdx CLAUDE.md package.json package-lock.json
git commit -m "docs(editor): toolbar contract + 0.9.0 migration; chore: v0.9.0"
```

---

## Post-plan (not tasks)

- Final whole-branch review, then runtime gate in Storybook (`npm run dev`): `Build` (bar composition, icons, disabled + Card tooltip on `Empty`, + Section rename-on-add), `InvalidDraft` (Preview segment disabled + `fixValidationFirst` tooltip), `BuildWithCards` (+ Card into the SEO tab after switching), `TryIt` (segmented switch round-trip, scratch reset), and the title-above-bar check with a host-style heading. Then merge to main.
- Release: tag `v0.9.0` push **only after explicit user OK**.
- mediahub follow-up (separate repo, on release): bump fieldkit to 0.9.0; if its editor screens pin "Try it" copy in e2e tests or docs, update to "Preview" (hosts overriding `labels.tryIt` are unaffected).
