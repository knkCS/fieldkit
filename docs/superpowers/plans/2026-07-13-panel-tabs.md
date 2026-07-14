# Config Panel Tabs + Persistent Drag Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldkit 0.10.0 — the config panel's collapsible General/Validation/Type-settings sections become anker **Tabs** (mockup A: side panel, tabs, live editing untouched), the duplicate-accessor banner renders **above** the tab strip, the panel gets a **fixed width** (#40 absorbed), and every field shell carries an **always-visible drag grip** (the card-header idiom) that becomes THE handle — the selection toolbar drops its grip button (#41). Closes fieldkit#42, #41, #40.

**Architecture:** `field-config-panel.tsx` swaps its private `Disclosure` component for anker `Tabs` (`@knkcs/anker/primitives` — the exact primitives `editor-canvas.tsx` already uses); the existing `panel-sections/` components become the three tab bodies unchanged. Panel-local `activeTab` state with a ref-compare reset effect keyed on the resolved drill chain (`chain.length` + active accessor). Structure order: Back row → header → duplicate-accessor banner → tab strip → tab body; the system-field and card branches short-circuit before the strip exactly as today. `field-shell.tsx` renders the grip absolutely positioned into a new left gutter (`pl="10"`), so the F8 inert wrapper below it is not touched at all; `useSortable`'s `attributes`/`listeners` move from the toolbar button to this grip.

**Tech Stack:** TypeScript, React 19, Chakra v3 via @knkcs/anker (semantic tokens), Vitest + @testing-library/react (jsdom), Biome, Storybook.

**Spec:** `docs/superpowers/specs/2026-07-13-panel-tabs-design.md` (approved, all seven decisions LOCKED). Branch: `feat/panel-tabs`.

## Global Constraints

- All work on branch `feat/panel-tabs`; never commit to main.
- Conventional Commits, subject < 72 chars, scope here: `editor` (or none for cross-cutting docs/version).
- `npm run typecheck` && `npm run lint` must be green before every commit; `npm run test` (full suite) before finishing a task.
- Ships as **0.10.0** (bump in the final task). The release tag push / npm publish is NOT part of this plan — only after explicit user OK.
- **Live-edit semantics untouched.** The accessor-gate (ConfigSection's local `accessorInput` + collision gate), the auto-slug latch, the rename-baseline machinery (SpecEditor's map, `DrillFrame.baselineAccessor`, the rename-follow), and per-keystroke apply must not change. `panel-sections/*` files are NOT modified. Concretely this forbids `lazyMount`/`unmountOnExit` on the panel's Tabs: all three tab bodies stay **mounted** (zag's default `hidden` attribute — the editor-canvas idiom), because unmounting General on a tab switch would destroy ConfigSection's in-progress invalid-accessor state and re-derive the auto-slug latch.
- **Label KEY renames are forbidden.** Exactly THREE new keys: `panelTabGeneral`, `panelTabValidation`, `panelTabType` (English defaults `"General"`, `"Validation"`, `"Type settings"`). The old `panelGeneral`/`panelValidation`/`panelTypeSettings` keys STAY in `EditorLabels` and `DEFAULT_EDITOR_LABELS` (marked `@deprecated`, no longer rendered) — deleting an optional key breaks hosts' object literals via excess-property checks.
- **The F8 inert workaround in `field-shell.tsx` stays byte-identical** — comment block and the `{...({ inert: "true" } as Record<string, unknown>)}` Box included. The grip implementation below deliberately avoids wrapping that block (absolute positioning into a padding gutter) so its bytes are not even re-indented.
- Token-first styling (semantic tokens only); icons from lucide-react only; `displayName` on every exported React component.
- No new public exports: `PanelLabels` stays a non-index export of `field-config-panel.tsx`; `src/editor/index.ts` untouched.
- TDD: every task writes its failing test first (superpowers:test-driven-development).
- **Spec refinements (locked during planning):**
  1. **The group Children list lives inside the General tab body** (below ConfigSection, under a `panelChildren` heading). The spec locks a THREE-tab set with no fourth tab and doesn't name a home for the list; General is where a group's structural config lives, and the existing drill-in tests keep passing unchanged because General is the default tab.
  2. **Tab bodies stay mounted** (see the live-edit constraint above). Test consequence: body-switching assertions use `toBeVisible()`/`not.toBeVisible()` (jest-dom honors the ancestor `hidden` attribute), never presence/absence. Behavior consequence, documented in the mdx migration note: a plugin's `settingsComponent` now mounts as soon as its field is selected, not when Type settings is first expanded.
  3. **Tab-reset identity is `` `${chain.length}:${activeField.config.api_accessor}` `` via a ref-compare effect** — it covers selecting a different top-level field, drill-in push, Back pop, AND the broken-frame fallback (a drilled child deleted externally). A rename also changes the active accessor, but renames are only ever typed in the General tab's inputs, so that reset is always a same-value no-op.
  4. **Width-pin mechanics (verified by probe against the installed Chakra v3 in jsdom):** `width="72"` computes `getComputedStyle(el).width === "var(--chakra-sizes-72)"` while `minWidth="72"` computes `width === ""` — so the pin asserts the fixed token AND `minWidth === ""`, and asserts the same token across a custom and a system selection. This discriminates against the old `minWidth`-only panel.
  5. **The floating toolbar gains `data-testid={`shell-toolbar-${accessor}`}`** (additive test hook) so the "toolbar contains no grip" pin can scope into it; the SpecEditor-level pin counts grips (= shell count, selection adds none).
  6. **The new grip is NOT click-stopped**: a plain click (under PointerSensor's 8px activation distance) bubbles to the shell and selects it — exactly the card-header grip behavior. Keyboard keys from the grip are already ignored by the shell's `e.target !== e.currentTarget` guard.
  7. **`PanelLabels`' Pick swaps the three old heading keys for the three `panelTab*` keys** — PanelLabels states what the panel consumes, and it consumes the new captions. `EditorLabels` (the public type) keeps the old keys per the freeze; `Required<EditorLabels>` still satisfies PanelLabels structurally.
  8. **Panel tab queries in tests use `getByRole("tab", …)` directly only in panel-level harnesses** (no canvas there). SpecEditor-level tests must never query a tab named "General" unscoped — the canvas's implicit first tab shares that string; scope `within(screen.getByTestId("field-config-panel"))` if ever needed (no test in this plan needs it).
  9. **Closed anker Tooltips need no ResizeObserver** (verified precedent: `validation-surfacing.test.tsx` mounts the selected toolbar's three Tooltips with no stub) — so the always-mounted grip Tooltip does not force stubs into the canvas suites that lack them, and the panel's Tabs need none either (`editor-canvas.test.tsx` renders Tabs stub-free today).

---

### Task 1: Panel tabs — `field-config-panel.tsx` restructure + labels + test migration

**Files:**
- Modify: `src/editor/field-config-panel.tsx` (Disclosure → Tabs, `PanelTab` state + reset effect, `PanelLabels` Pick swap, Children list into the General body)
- Modify: `src/editor/spec-editor.tsx` (`EditorLabels` + 3 keys, deprecation notes, defaults)
- Modify: `src/editor/__tests__/field-config-panel.test.tsx` (testLabels swap, 4 existing-test edits, 3 new discriminating tests)

**Interfaces:**
- Consumes: anker `Tabs` (`Tabs.Root`/`List`/`Trigger`/`Content`, controlled `value`/`onValueChange` — the `e.value` dialect editor-canvas already uses), the untouched `panel-sections/` components.
- Produces (used VERBATIM by Tasks 2 and 4):

```ts
// EditorLabels gains (spec-editor.tsx):
panelTabGeneral?: string;   // default "General"
panelTabValidation?: string; // default "Validation"
panelTabType?: string;      // default "Type settings"
// panelGeneral / panelValidation / panelTypeSettings stay, @deprecated.

// field-config-panel.tsx internal:
type PanelTab = "general" | "validation" | "type-settings";
```

DOM contract: the editable branch renders exactly three `role="tab"` triggers captioned by the new labels; all three `role="tabpanel"` bodies stay mounted (inactive ones carry `hidden`); the duplicate-accessor banner (`panel-duplicate-banner`) sits OUTSIDE every tabpanel, before the tablist; the system branch renders ZERO `role="tab"` elements; the card branch renders ZERO `role="tab"` elements. The `panel-toggle-*` testids are GONE.

- [ ] **Step 1: Write the failing tests**

In `src/editor/__tests__/field-config-panel.test.tsx`:

1. testLabels — replace:

```ts
const testLabels: PanelLabels = {
	panelGeneral: "General",
	panelValidation: "Validation",
	panelTypeSettings: "Type Settings",
```

with:

```ts
const testLabels: PanelLabels = {
	panelTabGeneral: "General",
	panelTabValidation: "Validation",
	panelTabType: "Type settings",
```

2. The label-routing test — replace:

```tsx
		// Validation section starts collapsed — open it.
		fireEvent.click(screen.getByTestId("panel-toggle-validation"));
```

with:

```tsx
		// Switch to the Validation tab (all bodies are mounted-but-hidden —
		// the click keeps the interaction honest).
		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
```

3. The settingsComponent test — replace:

```tsx
		// Type Settings is collapsed by default (only General starts open).
		fireEvent.click(screen.getByTestId("panel-toggle-type-settings"));
```

with:

```tsx
		// Switch to the Type settings tab (the body is mounted either way —
		// the click keeps the interaction honest).
		fireEvent.click(screen.getByRole("tab", { name: "Type settings" }));
```

4. The system-lock summary test — replace:

```tsx
		expect(screen.queryByTestId("panel-toggle-general")).toBeNull();
		expect(screen.queryByTestId("panel-toggle-validation")).toBeNull();
		expect(screen.queryByTestId("panel-toggle-type-settings")).toBeNull();
```

with:

```tsx
		// The summary REPLACES the tabs entirely (0.6.0 contract; Decision 5).
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
```

5. The non-system regression test — replace:

```tsx
		expect(screen.getByTestId("panel-toggle-validation")).toBeInTheDocument();
```

with:

```tsx
		expect(screen.getByRole("tab", { name: "Validation" })).toBeInTheDocument();
```

6. New tests — insert before the close of `describe("FieldConfigPanel", …)`; replace:

```tsx
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("my_field");
	});
});

describe("system fields — panel lock", () => {
```

with:

```tsx
		expect(onFieldChangeSpy).not.toHaveBeenCalled();
		expect(readDump().config.api_accessor).toBe("my_field");
	});

	it("renders General | Validation | Type settings tabs; switching shows the right body", () => {
		render(
			<EditorWrap>
				<Harness initialField={makeField("my_field", "My Field")} />
			</EditorWrap>,
		);

		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
			"General",
			"Validation",
			"Type settings",
		]);
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// All three bodies stay MOUNTED (ConfigSection's local accessor state
		// and auto-slug latch must survive tab switches) — VISIBILITY is what
		// flips, driven by the inactive tabpanels' `hidden` attribute.
		expect(screen.getByTestId("panel-name-input")).toBeVisible();
		expect(screen.getByTestId("panel-min-length-input")).not.toBeVisible();

		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		expect(screen.getByTestId("panel-min-length-input")).toBeVisible();
		expect(screen.getByTestId("panel-name-input")).not.toBeVisible();

		fireEvent.click(screen.getByRole("tab", { name: "Type settings" }));
		expect(screen.getByText(testLabels.panelNoSettings)).toBeVisible();
	});

	it("active tab RESETS to General when a different field is selected (panel stays mounted)", () => {
		const fieldA = makeField("field_a", "Field A");
		const fieldB = makeField("field_b", "Field B");
		function SwitchHarness() {
			const [selected, setSelected] = useState<Field>(fieldA);
			return (
				<div>
					<FieldConfigPanel
						field={selected}
						plugin={undefined}
						draft={[fieldA, fieldB]}
						fieldErrors={[]}
						onFieldChange={() => {}}
						onClose={() => {}}
						committedAccessors={new Set()}
						baselineAccessor={selected.config.api_accessor}
						labels={testLabels}
					/>
					<button
						type="button"
						data-testid="select-b"
						onClick={() => setSelected(fieldB)}
					/>
				</div>
			);
		}
		render(
			<EditorWrap>
				<SwitchHarness />
			</EditorWrap>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// Select a DIFFERENT field: the panel does NOT remount (same component
		// instance, new `field` prop) — panel-local tab state would survive
		// without the reset effect. This is the discriminating half.
		fireEvent.click(screen.getByTestId("select-b"));
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Field B");
	});

	it("active tab resets to General when a drill frame pops (Back)", () => {
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);

		// Drill into the child (from the General tab, where the list lives).
		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));
		// The drilled child gets the FULL tab strip (spec Decision 5)…
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
		expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// …and popping the frame is a field change: back to General. (A panel
		// remembering Validation here would silently show the PARENT group's
		// validation — not what the author was looking at.)
		fireEvent.click(screen.getByTestId("panel-back"));
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});

describe("system fields — panel lock", () => {
```

(`makeGroupField` is a hoisted function declaration inside the same describe block; `useState`, `Field`, `makeField`, `makeCard`, `within` are already imported by this file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/field-config-panel.test.tsx`
Expected: the three new tests FAIL (no `role="tab"` exists anywhere), and the edited label-routing, settingsComponent, and non-system-regression tests FAIL the same way. The edited system-summary test still PASSES (zero tabs was true of the Disclosure panel too — it exists to pin "summary replaces the tabs" THROUGH the migration). Untouched tests stay green. `npm run typecheck` also fails (testLabels' `panelTab*` keys don't exist on `PanelLabels` yet) — same signal.

- [ ] **Step 3: Implement — `spec-editor.tsx` labels**

1. `EditorLabels` — replace:

```ts
	// panel
	panelGeneral?: string;
	panelValidation?: string;
	panelTypeSettings?: string;
```

with:

```ts
	// panel
	/** Caption of the config panel's General tab (0.10.0 tabs redesign). */
	panelTabGeneral?: string;
	/** Caption of the config panel's Validation tab (0.10.0). */
	panelTabValidation?: string;
	/** Caption of the config panel's Type-settings tab (0.10.0). */
	panelTabType?: string;
	/** @deprecated Unused since 0.10.0 — the panel's collapsible section
	 * headings became tabs, captioned by `panelTabGeneral`. The key stays
	 * (label KEYS are frozen) so hosts passing it don't break; its value is
	 * no longer rendered anywhere. */
	panelGeneral?: string;
	/** @deprecated Unused since 0.10.0 — see `panelTabValidation`. */
	panelValidation?: string;
	/** @deprecated Unused since 0.10.0 — see `panelTabType`. */
	panelTypeSettings?: string;
```

2. Defaults — replace:

```ts
	panelGeneral: "General",
	panelValidation: "Validation",
	panelTypeSettings: "Type settings",
```

with:

```ts
	panelTabGeneral: "General",
	panelTabValidation: "Validation",
	panelTabType: "Type settings",
	// Deprecated trio (unused since 0.10.0) — kept because label KEYS are
	// frozen and Required<EditorLabels> still demands values for them.
	panelGeneral: "General",
	panelValidation: "Validation",
	panelTypeSettings: "Type settings",
```

- [ ] **Step 4: Implement — `field-config-panel.tsx`**

1. Imports — replace:

```tsx
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { ChevronDown, ChevronLeft, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
```

with:

```tsx
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { Tabs } from "@knkcs/anker/primitives";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
```

(`ChevronDown` and `ReactNode` were only used by the deleted `Disclosure`.)

2. `PanelLabels` — replace:

```ts
/**
 * A Pick of EditorLabels — the panel consumes the SAME flat key names as
 * EditorLabels (general→panelGeneral, validation→panelValidation, etc.)
 * instead of its own shorter names, so a host's merged EditorLabels
 * satisfies this type structurally with no per-key renaming layer required
 * at the call site.
 */
export type PanelLabels = Pick<
	Required<EditorLabels>,
	| "panelGeneral"
	| "panelValidation"
	| "panelTypeSettings"
```

with:

```ts
/**
 * A Pick of EditorLabels — the panel consumes the SAME flat key names as
 * EditorLabels (tab captions → panelTabGeneral/panelTabValidation/
 * panelTabType, etc.) instead of its own shorter names, so a host's merged
 * EditorLabels satisfies this type structurally with no per-key renaming
 * layer required at the call site.
 */
export type PanelLabels = Pick<
	Required<EditorLabels>,
	| "panelTabGeneral"
	| "panelTabValidation"
	| "panelTabType"
```

3. Delete the `Disclosure` component entirely (replace with nothing):

```tsx
function Disclosure({
	title,
	defaultOpen,
	testId,
	children,
}: {
	title: string;
	defaultOpen: boolean;
	testId: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Box borderBottomWidth="1px" borderColor="border" pb="3" mb="3">
			<Button
				variant="ghost"
				width="full"
				justifyContent="space-between"
				px="0"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				data-testid={`panel-toggle-${testId}`}
			>
				<Text fontSize="sm" fontWeight="semibold">
					{title}
				</Text>
				<ChevronDown
					size={14}
					style={{ transform: open ? "rotate(180deg)" : undefined }}
				/>
			</Button>
			{open && <Box pt="2">{children}</Box>}
		</Box>
	);
}
Disclosure.displayName = "Disclosure";
```

4. `PanelTab` type — replace:

```ts
/**
 * A single level of the drill-in path. `accessor` is the LIVE lookup key —
```

with:

```ts
/** The config panel's three tab ids (0.10.0 tabs redesign). Captions come
 * from PanelLabels' panelTab* keys; these ids are internal state and the
 * Tabs value dialect only — never author-facing. */
type PanelTab = "general" | "validation" | "type-settings";

/**
 * A single level of the drill-in path. `accessor` is the LIVE lookup key —
```

5. State — replace:

```tsx
	const [drillStack, setDrillStack] = useState<DrillFrame[]>([]);
```

with:

```tsx
	const [drillStack, setDrillStack] = useState<DrillFrame[]>([]);
	// Panel-local active tab (spec Decision 3). General is the default; the
	// reset effect below (after `chain` resolves) returns here whenever the
	// panel starts showing a different field.
	const [activeTab, setActiveTab] = useState<PanelTab>("general");
```

6. Reset effect — replace:

```tsx
	const activePlugin = chain.length === 1 ? plugin : undefined;
```

with:

```tsx
	const activePlugin = chain.length === 1 ? plugin : undefined;

	// The active tab RESETS to General whenever the panel starts showing a
	// DIFFERENT field (spec Decision 3): selecting another top-level field,
	// drilling into a child, popping a frame with Back — and the broken-frame
	// fallback (a drilled child deleted externally drops the active field to
	// its deepest resolvable ancestor). `chain.length` + the active accessor
	// capture all of these. A RENAME also changes the active accessor, but
	// renames are only ever typed in the General tab's inputs, so that reset
	// is always a same-value no-op (React bails on same-state updates).
	// Ref-compare (not a bare dependency effect) so it can't fire on mount.
	const tabIdentity = `${chain.length}:${activeField.config.api_accessor}`;
	const tabIdentityRef = useRef(tabIdentity);
	useEffect(() => {
		if (tabIdentityRef.current !== tabIdentity) {
			tabIdentityRef.current = tabIdentity;
			setActiveTab("general");
		}
	}, [tabIdentity]);
```

7. The tabbed body — replace the entire Disclosure JSX span (from the General Disclosure open through the group-children Disclosure close):

```tsx
					<Disclosure title={labels.panelGeneral} defaultOpen testId="general">
						<ConfigSection
							{...sectionProps}
							nameInputRef={nameInputRef}
							// SpecEditor's rename-baseline map only tracks the TOP-LEVEL
							// selected field (see the prop doc below) — it always reflects
							// the top-level field's committed accessor, never a drilled-in
							// child's. Forwarding it unconditionally would compare a
							// drilled child's accessor against its PARENT's baseline (e.g.
							// child "item_name" !== group baseline "items") and produce a
							// false-positive disconnect warning for every untouched
							// committed child. Any drilled frame instead self-scopes to
							// its OWN drill-in frame's `baselineAccessor` — the child's
							// accessor AT THE MOMENT it was drilled into, frozen across
							// renames within the frame (see DrillFrame above) — so a LIVE
							// rename of a committed child still trips the disconnect
							// warning instead of silently chasing the field's current
							// accessor and never comparing against anything committed.
							// Indexed by the shared `activeFrameIndex` (see its comment):
							// the active frame is not necessarily the stack's last entry.
							baselineAccessor={
								chain.length === 1
									? baselineAccessor
									: (drillStack[activeFrameIndex]?.baselineAccessor ??
										activeField.config.api_accessor)
							}
						/>
					</Disclosure>

					<Disclosure
						title={labels.panelValidation}
						defaultOpen={false}
						testId="validation"
					>
						<ValidationSection {...sectionProps} />
					</Disclosure>

					<Disclosure
						title={labels.panelTypeSettings}
						defaultOpen={false}
						testId="type-settings"
					>
						<SettingsSection {...sectionProps} />
					</Disclosure>

					{activeField.field_type === "group" && (
						<Disclosure
							title={labels.panelChildren}
							defaultOpen
							testId="children"
						>
							<Box>
								{children.map((child) => (
									<Flex
										key={child.config.api_accessor}
										align="center"
										justify="space-between"
										py="1"
									>
										<Box>
											<Text fontSize="sm">{child.config.name}</Text>
											<Text fontSize="xs" color="fg.muted">
												{child.field_type}
											</Text>
										</Box>
										<Button
											size="xs"
											variant="ghost"
											onClick={() =>
												// Freeze `baselineAccessor` to the child's accessor AT
												// THIS MOMENT — the disconnect-warning baseline for the
												// whole time this frame stays on top of the stack. `accessor`
												// (the lookup key) starts equal to it but, unlike
												// `baselineAccessor`, follows subsequent renames — see the
												// rename-follow logic in `handleActiveFieldChange`.
												setDrillStack((s) => [
													...s,
													{
														accessor: child.config.api_accessor,
														baselineAccessor: child.config.api_accessor,
													},
												])
											}
											data-testid={`panel-child-edit-${child.config.api_accessor}`}
										>
											{labels.editChild}
										</Button>
									</Flex>
								))}
							</Box>
						</Disclosure>
					)}
```

with:

```tsx
					{/* The tab strip (spec Decisions 2–4). Structure order: banner
					    ABOVE the strip (rendered just before this Tabs.Root, so it
					    is visible from any tab), strip, body. All three bodies
					    stay MOUNTED (zag Tabs' default `hidden` attribute — the
					    editor-canvas idiom): `unmountOnExit` would reset
					    ConfigSection's local accessor state and auto-slug latch on
					    every tab switch, changing live-edit semantics. */}
					<Tabs.Root
						value={activeTab}
						onValueChange={(e) => setActiveTab(e.value as PanelTab)}
					>
						<Tabs.List>
							<Tabs.Trigger value="general">
								{labels.panelTabGeneral}
							</Tabs.Trigger>
							<Tabs.Trigger value="validation">
								{labels.panelTabValidation}
							</Tabs.Trigger>
							<Tabs.Trigger value="type-settings">
								{labels.panelTabType}
							</Tabs.Trigger>
						</Tabs.List>

						<Tabs.Content value="general">
							<Box pt="2">
								<ConfigSection
									{...sectionProps}
									nameInputRef={nameInputRef}
									// SpecEditor's rename-baseline map only tracks the TOP-LEVEL
									// selected field (see the prop doc below) — it always reflects
									// the top-level field's committed accessor, never a drilled-in
									// child's. Forwarding it unconditionally would compare a
									// drilled child's accessor against its PARENT's baseline (e.g.
									// child "item_name" !== group baseline "items") and produce a
									// false-positive disconnect warning for every untouched
									// committed child. Any drilled frame instead self-scopes to
									// its OWN drill-in frame's `baselineAccessor` — the child's
									// accessor AT THE MOMENT it was drilled into, frozen across
									// renames within the frame (see DrillFrame above) — so a LIVE
									// rename of a committed child still trips the disconnect
									// warning instead of silently chasing the field's current
									// accessor and never comparing against anything committed.
									// Indexed by the shared `activeFrameIndex` (see its comment):
									// the active frame is not necessarily the stack's last entry.
									baselineAccessor={
										chain.length === 1
											? baselineAccessor
											: (drillStack[activeFrameIndex]?.baselineAccessor ??
												activeField.config.api_accessor)
									}
								/>
								{activeField.field_type === "group" && (
									<Box mt="4" pt="3" borderTopWidth="1px" borderColor="border">
										{/* The locked tab set has no fourth tab — the group
										    children list lives in the General body under its own
										    heading (plan refinement 1). */}
										<Text fontSize="sm" fontWeight="semibold" mb="1">
											{labels.panelChildren}
										</Text>
										{children.map((child) => (
											<Flex
												key={child.config.api_accessor}
												align="center"
												justify="space-between"
												py="1"
											>
												<Box>
													<Text fontSize="sm">{child.config.name}</Text>
													<Text fontSize="xs" color="fg.muted">
														{child.field_type}
													</Text>
												</Box>
												<Button
													size="xs"
													variant="ghost"
													onClick={() =>
														// Freeze `baselineAccessor` to the child's accessor AT
														// THIS MOMENT — the disconnect-warning baseline for the
														// whole time this frame stays on top of the stack. `accessor`
														// (the lookup key) starts equal to it but, unlike
														// `baselineAccessor`, follows subsequent renames — see the
														// rename-follow logic in `handleActiveFieldChange`.
														setDrillStack((s) => [
															...s,
															{
																accessor: child.config.api_accessor,
																baselineAccessor: child.config.api_accessor,
															},
														])
													}
													data-testid={`panel-child-edit-${child.config.api_accessor}`}
												>
													{labels.editChild}
												</Button>
											</Flex>
										))}
									</Box>
								)}
							</Box>
						</Tabs.Content>

						<Tabs.Content value="validation">
							<Box pt="2">
								<ValidationSection {...sectionProps} />
							</Box>
						</Tabs.Content>

						<Tabs.Content value="type-settings">
							<Box pt="2">
								<SettingsSection {...sectionProps} />
							</Box>
						</Tabs.Content>
					</Tabs.Root>
```

(The banner block directly above this span is untouched — it already renders before the strip, which is exactly Decision 4's "above the tab strip, visible from any tab". The `minWidth="72"` on the root Box is deliberately NOT touched in this task — Task 2 owns #40 with its red-first pin.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — the whole editor suite. Notably: `spec-editor.test.tsx` (drives `panel-name-input` on the default General tab), `cards-editor.test.tsx` and `editor-toolbar.test.tsx` (card branch — unchanged, no tab strip), and every drill-in/latch/baseline test in `field-config-panel.test.tsx` (ConfigSection and the drill machinery are untouched; the Children list lives in the default tab).

- [ ] **Step 6: Full gates + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): config panel tabs replace collapsible sections"
```

---

### Task 2: Fixed panel width (#40) + banner-above-strip and four-states pins

**Files:**
- Modify: `src/editor/field-config-panel.tsx` (one line: `minWidth="72"` → `width="72"` + comment)
- Modify: `src/editor/__tests__/field-config-panel.test.tsx` (three new tests)

**Interfaces:**
- Produces: the panel root (`data-testid="field-config-panel"`) computes `width: var(--chakra-sizes-72)` and NO `min-width` — identical for custom, system, and card selections.

- [ ] **Step 1: Write the failing tests**

Append at the end of `describe("FieldConfigPanel", …)` — directly after the three tests added in Task 1, re-using the same insertion boundary (the tests go before that describe's closing `});`, never inside `describe("system fields — panel lock", …)`):

```tsx
	it("panel width is FIXED (#40): same width token for custom and system selections, no min-width", () => {
		function panelFor(field: Field) {
			return (
				<EditorWrap>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={vi.fn()}
						onClose={vi.fn()}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
				</EditorWrap>
			);
		}
		const widthOf = () =>
			window.getComputedStyle(screen.getByTestId("field-config-panel")).width;

		const { rerender } = render(panelFor(makeField("a", "A")));
		// Chakra resolves the `width` token to its CSS var in jsdom; the OLD
		// minWidth-only panel computes width "" here — the discriminating
		// assert (probe-verified against the installed Chakra v3).
		expect(widthOf()).toBe("var(--chakra-sizes-72)");
		expect(
			window.getComputedStyle(screen.getByTestId("field-config-panel"))
				.minWidth,
		).toBe("");

		rerender(panelFor({ ...makeField("name", "Name"), system: true }));
		expect(widthOf()).toBe("var(--chakra-sizes-72)");
	});

	it("duplicate-accessor banner renders ABOVE the tab strip — visible from the Validation tab", () => {
		const field = makeField("dup", "Dup A");
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field, makeField("dup", "Dup B")]}
					fieldErrors={[
						{
							accessor: "dup",
							code: "duplicate_accessor",
							message: 'Duplicate accessor "dup"',
						},
					]}
					onFieldChange={vi.fn()}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "Validation" }));

		const banner = screen.getByTestId("panel-duplicate-banner");
		// Visible while a NON-General tab is active: a banner living inside
		// the General body would be `hidden` right now.
		expect(banner).toBeVisible();
		expect(banner.closest("[role='tabpanel']")).toBeNull();
		// And ABOVE the strip in document order (Decision 4).
		const tablist = screen.getByRole("tablist");
		expect(
			banner.compareDocumentPosition(tablist) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("four selection states render the right chrome: tabs / summary / card Name / Back+tabs", () => {
		function panelFor(field: Field) {
			return (
				<EditorWrap>
					<FieldConfigPanel
						field={field}
						plugin={undefined}
						draft={[field]}
						fieldErrors={[]}
						onFieldChange={vi.fn()}
						onClose={vi.fn()}
						committedAccessors={new Set()}
						baselineAccessor={field.config.api_accessor}
						labels={testLabels}
					/>
				</EditorWrap>
			);
		}

		// (1) normal field: the full tab strip, no Back row.
		const normal = render(panelFor(makeField("a", "A")));
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		expect(screen.queryByTestId("panel-back")).toBeNull();
		normal.unmount();

		// (2) system field: the read-only summary REPLACES the tabs entirely.
		const system = render(panelFor({ ...makeField("name", "Name"), system: true }));
		expect(screen.getByTestId("panel-system-summary")).toBeInTheDocument();
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
		system.unmount();

		// (3) card marker: single Name body, NO tab strip.
		const card = render(panelFor(makeCard("c1", "Basics")));
		expect(screen.getByTestId("panel-card-name-input")).toBeInTheDocument();
		expect(screen.queryAllByRole("tab")).toHaveLength(0);
		card.unmount();

		// (4) drill-in child: Back row + the full tab strip.
		render(
			<EditorWrap>
				<Harness initialField={makeGroupField()} />
			</EditorWrap>,
		);
		fireEvent.click(screen.getByTestId("panel-child-edit-item_name"));
		expect(screen.getByTestId("panel-back")).toBeInTheDocument();
		expect(screen.getAllByRole("tab")).toHaveLength(3);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/field-config-panel.test.tsx`
Expected: the width pin FAILS (`width` computes `""` under `minWidth="72"`); the banner pin and four-states pin PASS (they pin Task 1's structure through the width change — expected-green pins, like the prior plan's wiring pin).

- [ ] **Step 3: Implement — the fixed width**

In `src/editor/field-config-panel.tsx`, replace:

```tsx
			minWidth="72"
```

with:

```tsx
			// #40 (absorbed into the tabs spec, Decision 7): FIXED width. The old
			// minWidth let intrinsic content stretch the panel, so system/custom/
			// card selections rendered three different panel sizes.
			width="72"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS — including every pre-existing panel/editor test (none asserts on `minWidth`).

- [ ] **Step 5: Full gates + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): fixed config panel width, tab chrome pins"
```

---

### Task 3: Persistent drag grip on every shell; the toolbar grip retires

**Files:**
- Modify: `src/editor/field-shell.tsx` (grip into a new left gutter, toolbar grip removed, toolbar testid)
- Modify: `src/editor/__tests__/field-shell.test.tsx` (2 new tests, keyboard-drag test re-targeted)
- Modify: `src/editor/__tests__/dnd.test.tsx` (3 handle grabs re-scoped, selection clicks dropped)
- Modify: `src/editor/__tests__/cards-canvas.test.tsx` (1 handle grab re-scoped)
- Modify: `src/editor/__tests__/spec-editor.test.tsx` (screen-level single-source pin)

**Enumerated blast radius of the grip move** (grep: `dragField` / `"Drag to reorder"` across `src/`):
- `field-shell.tsx` — the implementation (label key REUSED for the new grip; `dragField` stays in `FieldShellToolbarLabels`' Pick unchanged).
- Tests that GRAB the handle and now hit multiple matches (every shell has one): `dnd.test.tsx:175/247/280`, `cards-canvas.test.tsx:440`, `field-shell.test.tsx:180` — all re-scoped below. `field-shell.test.tsx:301` renders a single shell (query stays unique) — untouched, and it doubles as the system-field drag-carries-over pin.
- LABELS-fixture-only mentions (key still consumed — NO edits): `insertion.test.tsx:42`, `max-per-spec.test.tsx:21`, `dnd.test.tsx:68`, `editor-canvas.test.tsx:23`, `validation-surfacing.test.tsx:24`, `sections.test.tsx:93`, `cards-canvas.test.tsx:49`, `field-shell.test.tsx:34`, `spec-editor.tsx:98/230`.
- Docs/stories mentions: `spec-editor.mdx:164/237/322/347/416`, `spec-editor.stories.tsx` SystemFields note — Task 4.
- The card-header grip (`dragCard`, `card-frame.tsx`) is the idiom SOURCE and is not modified; its tests (`cards-canvas.test.tsx:187/266/355/522`) are unaffected.

**Interfaces:**
- Produces: every `FieldShell` renders one grip (`aria-label={labels.dragField}`, `IconButton size="2xs"` + `GripVertical size={14}`, `useSortable` `attributes`+`listeners`) inside `shell-${accessor}`, OUTSIDE the inert wrapper; the selection toolbar (`data-testid={`shell-toolbar-${accessor}`}`) contains Edit/Duplicate/moveMenu/Delete and the system lock badge, but NO grip. `FieldShellProps` and `FieldShellToolbarLabels` are unchanged.

- [ ] **Step 1: Write the failing tests**

1. `src/editor/__tests__/field-shell.test.tsx` — extend the RTL import; replace:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
```

with:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
```

Append inside `describe("FieldShell", …)` (after the last test, before its closing `});`):

```tsx
	it("renders the drag grip WITHOUT selection (persistent handle, #41)", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected={false}
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		const grip = screen.getByLabelText(shellLabels.dragField);
		expect(grip).toBeInTheDocument();
		// It must live OUTSIDE the inert preview wrapper — an inert grip
		// would be unfocusable and undraggable.
		expect(grip.closest("[inert]")).toBeNull();
	});

	it("the selection toolbar contains NO grip — the shell grip is the single handle", () => {
		render(
			<Wrap>
				<FieldShell
					field={field}
					selected
					onSelect={noop}
					onEdit={noop}
					onDuplicate={noop}
					onDelete={noop}
					labels={shellLabels}
				>
					<span>x</span>
				</FieldShell>
			</Wrap>,
		);
		// The toolbar is up (Edit proves it) and grip-free; exactly ONE grip
		// exists on a selected shell — pre-0.10 the toolbar carried it.
		const toolbar = screen.getByTestId("shell-toolbar-title");
		expect(
			within(toolbar).getByLabelText(shellLabels.editField),
		).toBeInTheDocument();
		expect(within(toolbar).queryByLabelText(shellLabels.dragField)).toBeNull();
		expect(screen.getAllByLabelText(shellLabels.dragField)).toHaveLength(1);
	});
```

Re-target the keyboard-drag lifecycle test at an UNSELECTED shell (the #41 discriminating update — keyboard drag + Escape-cancel must carry over to the new grip). Replace:

```tsx
	it("keyboard drag lifecycle works from the toolbar drag handle", async () => {
```

with:

```tsx
	it("keyboard drag lifecycle works from the grip of an UNSELECTED shell", async () => {
```

then replace (this deeper-nested render is the only place with this indentation):

```tsx
						<FieldShell
							field={field}
							selected
							onSelect={noop}
```

with:

```tsx
						<FieldShell
							field={field}
							selected={false}
							onSelect={noop}
```

then replace:

```tsx
		const handle = screen.getByLabelText("Drag to reorder");
		handle.focus();
		fireEvent.keyDown(handle, { key: "Enter", code: "Enter" });
```

with:

```tsx
		// Two shells render, each with its own persistent grip — scope to the
		// one under test.
		const handle = within(screen.getByTestId("shell-title")).getByLabelText(
			"Drag to reorder",
		);
		handle.focus();
		fireEvent.keyDown(handle, { key: "Enter", code: "Enter" });
```

2. `src/editor/__tests__/dnd.test.tsx` — extend the RTL import; replace:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
```

with:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
```

then ONE `replace_all` covering all three handle grabs (lines 174–175, 246–247, 279–280 are byte-identical pairs) — replace ALL occurrences of:

```tsx
		fireEvent.click(screen.getByTestId("shell-a"));
		const handle = screen.getByLabelText("Drag to reorder");
```

with:

```tsx
		// Persistent grip (0.10.0): the handle lives on the UNSELECTED shell —
		// no selection click. Discriminating against the old
		// selection-toolbar-only handle (#41).
		const handle = within(screen.getByTestId("shell-a")).getByLabelText(
			"Drag to reorder",
		);
```

(The dropped click was only ever there to mount the toolbar handle; no assertion in these three tests depends on selection. The keyboard-reorder test thereby BECOMES the canvas-level "drag works from an unselected shell" pin.)

3. `src/editor/__tests__/cards-canvas.test.tsx` — replace:

```tsx
		// Select f4 — FieldShell only mounts its drag handle once selected.
		fireEvent.click(screen.getByTestId("shell-f4"));
		const handle = screen.getByLabelText("Drag to reorder");
```

with:

```tsx
		// Persistent grip (0.10.0): the handle lives on the unselected shell.
		const handle = within(screen.getByTestId("shell-f4")).getByLabelText(
			"Drag to reorder",
		);
```

(`within` is already imported there.)

4. `src/editor/__tests__/spec-editor.test.tsx` — append inside `describe("SpecEditor", …)` (after its last test, before the describe's closing `});`):

```tsx
	it("every shell carries its own grip; selecting adds none (the toolbar grip is gone)", () => {
		renderEditor([makeField("a"), makeField("b")]);
		// Unselected shells already expose their handles (#41).
		expect(screen.getAllByLabelText(L.dragField)).toHaveLength(2);

		fireEvent.click(screen.getByTestId("shell-a"));
		// The selection toolbar is up (Edit proves it) but contributed NO
		// grip — pre-0.10 this whole screen had exactly ONE handle, the
		// selected toolbar's.
		expect(screen.getByLabelText(L.editField)).toBeInTheDocument();
		expect(screen.getAllByLabelText(L.dragField)).toHaveLength(2);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor/__tests__/field-shell.test.tsx src/editor/__tests__/dnd.test.tsx src/editor/__tests__/cards-canvas.test.tsx src/editor/__tests__/spec-editor.test.tsx`
Expected: the two new field-shell tests FAIL (no grip without selection; no `shell-toolbar-title` testid); the re-targeted keyboard-drag test FAILS (unselected shell renders no handle); all three dnd grabs and the cards-canvas grab FAIL (`within(shell)` finds no grip pre-implementation); the spec-editor pin FAILS (`getAllByLabelText` finds 0, then 1).

- [ ] **Step 3: Implement — `field-shell.tsx`**

1. Toolbar testid — replace:

```tsx
					boxShadow="sm"
					zIndex="docked"
					onClick={(e) => e.stopPropagation()}
				>
```

with:

```tsx
					boxShadow="sm"
					zIndex="docked"
					data-testid={`shell-toolbar-${accessor}`}
					onClick={(e) => e.stopPropagation()}
				>
```

2. Remove the toolbar grip — replace:

```tsx
					{/* closeOnEscape=false: the open tooltip's Escape handler stops
					    propagation at the document (capture phase), which would
					    swallow the Escape that cancels a keyboard drag. */}
					<Tooltip content={labels.dragField} closeOnEscape={false}>
						<IconButton
							aria-label={labels.dragField}
							size="2xs"
							variant="ghost"
							{...attributes}
							{...listeners}
						>
							<GripVertical size={14} />
						</IconButton>
					</Tooltip>
					<Tooltip content={labels.editField}>
```

with:

```tsx
					<Tooltip content={labels.editField}>
```

3. Left gutter on the shell — replace:

```tsx
			p="2"
			cursor="pointer"
```

with:

```tsx
			py="2"
			pr="2"
			// pl clears the absolutely-positioned persistent grip below — the
			// inert preview must not render underneath it.
			pl="10"
			cursor="pointer"
```

4. The persistent grip — replace:

```tsx
			)}
			{/* F8: the JSX boolean shorthand `inert` (i.e. passing the JS boolean
```

with:

```tsx
			)}
			{/* Persistent drag handle (panel-tabs spec 2026-07-13, Decision 6):
			    THE handle — always visible, before the field content, the
			    card-header grip idiom (same GripVertical, same 2xs IconButton).
			    The selection toolbar above no longer carries one. Absolutely
			    positioned into the shell's pl="10" gutter so the F8 inert
			    wrapper below stays byte-identical.
			    closeOnEscape=false: the open tooltip's Escape handler stops
			    propagation at the document (capture phase), which would swallow
			    the Escape that cancels a keyboard drag. A plain click on the
			    grip (under PointerSensor's 8px activation distance) bubbles to
			    the shell's onClick and selects — the card-header behavior. */}
			<Box position="absolute" top="2" left="1.5">
				<Tooltip content={labels.dragField} closeOnEscape={false}>
					<IconButton
						aria-label={labels.dragField}
						size="2xs"
						variant="ghost"
						{...attributes}
						{...listeners}
					>
						<GripVertical size={14} />
					</IconButton>
				</Tooltip>
			</Box>
			{/* F8: the JSX boolean shorthand `inert` (i.e. passing the JS boolean
```

(The shell root is already `position="relative"`, so the grip anchors to it. NOTHING between the F8 comment's first line and the component's end is touched — `git diff` for this task must show zero changes inside the F8 block.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor/ && npm run typecheck`
Expected: PASS. Notably green WITHOUT edits (the enumerated no-touch set): `insertion.test.tsx`, `max-per-spec.test.tsx`, `validation-surfacing.test.tsx`, `sections.test.tsx`, `editor-canvas.test.tsx`, `canvas-markers.test.tsx` (their toolbar queries target Edit/Duplicate/Delete/lock, all unique per selection; their LABELS fixtures keep the still-consumed `dragField`; closed Tooltips need no ResizeObserver — refinement 9), `field-shell.test.tsx`'s system-field tests (lock badge + drag handle kept, delete hidden — the system drag+lock carry-over the spec demands), and the dnd keyboard suites (keyboard lift/move/drop/Escape all still driven through `attributes`/`listeners`, now on the shell grip).

- [ ] **Step 5: Full gates + commit**

Run: `npm run test && npm run lint`
Expected: PASS.

```bash
git add src/editor/
git commit -m "feat(editor): persistent shell drag grip; toolbar grip retired"
```

---

### Task 4: mdx contract + labels table + migration note + stories + CLAUDE.md + version 0.10.0

**Files:**
- Modify: `src/editor/spec-editor.mdx`
- Modify: `src/editor/spec-editor.stories.tsx` (SystemFields note)
- Modify: `CLAUDE.md` (editor directory-layout entries)
- Modify: `package.json` (`"version": "0.9.0"` → `"0.10.0"`)
- Modify: `package-lock.json` (via `npm install --package-lock-only`)

**Interfaces:**
- Consumes: everything above. Produces: release-ready branch. Tag push / npm publish NOT in this plan.

- [ ] **Step 1: `spec-editor.mdx` — panel contract rewrite, grip sweep, labels, migration**

1. Selection & toolbar — replace:

```
Click (or focus + <kbd>Enter</kbd>/<kbd>Space</kbd>) a field's shell to
select it — a floating toolbar appears above the shell (drag handle, Edit,
Duplicate, a cross-tab "Move to section" menu when the spec has 2+ tabs, and
Delete), and the [config panel](#config-panel--live-preview) opens to its
right. System fields (`field.system`) show a lock badge in place of Delete —
see [System Fields](#system-fields).
```

with:

```
Every shell carries an **always-visible drag grip** before its content —
the same header-grip treatment cards use — so reordering never requires
selecting first (0.10.0). Click (or focus + <kbd>Enter</kbd>/<kbd>Space</kbd>)
a field's shell to select it — a floating toolbar appears above the shell
(Edit, Duplicate, a cross-tab "Move to section" menu when the spec has 2+
tabs, and Delete; the grip lives on the shell, never in the toolbar), and
the [config panel](#config-panel--live-preview) opens to its right. System
fields (`field.system`) show a lock badge in place of Delete — see
[System Fields](#system-fields).
```

2. Drag & drop — replace:

```
Fields reorder within a tab via a drag handle (pointer or keyboard — see
[Keyboard Support](#keyboard-support)). Dragging a field's row onto another
```

with:

```
Fields reorder within a tab via the shell's always-visible grip (pointer or
keyboard — see
[Keyboard Support](#keyboard-support)). Dragging a field's row onto another
```

3. Config panel contract — replace:

```
Selecting a field opens a right-hand panel with collapsible sections:
General (name, accessor, instructions, required, default value,
hidden/read-only/localizable), Validation (min/max length, pattern +
message, unique), Type Settings (the plugin's own settings UI), and —
`group` fields only — a read-only Children list with per-row Edit buttons
that drill the panel into a child (with a Back control). The canvas
```

with:

```
Selecting a field opens a fixed-width right-hand panel with three **tabs**
(0.10.0 — previously collapsible sections): **General** (name, accessor,
instructions, required, default value, hidden/read-only/localizable, and —
`group` fields only — a read-only Children list with per-row Edit buttons
that drill the panel into a child, with a Back control), **Validation**
(min/max length, pattern + message, unique), and **Type settings** (the
plugin's own settings UI). Panel order, top to bottom: Back row (drill-in
only) → header (name/type/close) → duplicate-accessor banner (above the
strip — visible from ANY tab) → tab strip → tab body. The active tab is
panel-local state: General is the default, and the panel RESETS to General
whenever the selected field changes, drill-in frame changes included. All
three tab bodies stay mounted (hidden, not unmounted), so an in-progress
accessor edit survives a tab switch. System fields short-circuit BEFORE the
tab strip (the read-only summary replaces the tabs entirely); cards render
their single Name body with no tab strip. The canvas
```

4. System fields bullet — replace:

```
- The shell toolbar shows a lock, hides **Delete**, and keeps **drag**
  enabled — authors arrange system fields freely among their own.
```

with:

```
- The shell toolbar shows a lock and hides **Delete**; the shell's
  always-visible grip stays enabled — authors arrange system fields freely
  among their own.
```

5. Keyboard support — replace:

```
- **Reordering**: the drag handle is a `dnd-kit` `KeyboardSensor` target —
```

with:

```
- **Reordering**: the shell grip (always visible — no selection needed) is
  a `dnd-kit` `KeyboardSensor` target —
```

6. Labels table — replace:

```
| `dragField` | `"Drag to reorder"` | Drag handle aria-label / tooltip |
```

with:

```
| `dragField` | `"Drag to reorder"` | Shell grip aria-label / tooltip (always visible; the selection toolbar carries no grip since 0.10.0) |
```

then replace:

```
| `panelGeneral` | `"General"` | Panel section heading |
| `panelValidation` | `"Validation"` | Panel section heading |
| `panelTypeSettings` | `"Type settings"` | Panel section heading |
```

with:

```
| `panelTabGeneral` | `"General"` | Config panel tab caption |
| `panelTabValidation` | `"Validation"` | Config panel tab caption |
| `panelTabType` | `"Type settings"` | Config panel tab caption |
| `panelGeneral` | `"General"` | **Deprecated, unused since 0.10.0** — superseded by `panelTabGeneral` (key kept: label keys are frozen) |
| `panelValidation` | `"Validation"` | **Deprecated, unused since 0.10.0** — superseded by `panelTabValidation` |
| `panelTypeSettings` | `"Type settings"` | **Deprecated, unused since 0.10.0** — superseded by `panelTabType` |
```

then replace:

```
| `panelChildren` | `"Children"` | Group field's children section heading |
```

with:

```
| `panelChildren` | `"Children"` | Group children heading inside the General tab |
```

7. Migration note — insert before `## Migration to 0.9.0` (replace that heading line with):

```mdx
## Migration to 0.10.0

Visual-only rework — **no API changes**:

- The config panel's collapsible General/Validation/Type-settings sections
  became **tabs** (anker Tabs: `role="tab"` / `role="tabpanel"`). Tests that
  clicked the old `panel-toggle-*` disclosure buttons should click the tabs
  instead. Three new label keys caption them — `panelTabGeneral`,
  `panelTabValidation`, `panelTabType` — while the old `panelGeneral`/
  `panelValidation`/`panelTypeSettings` keys still exist (keys are frozen)
  but are no longer rendered anywhere.
- All three tab bodies stay **mounted** (inactive ones `hidden`): a
  plugin's `settingsComponent` now mounts as soon as its field is selected,
  not when the Type-settings section is first expanded.
- The panel has a **fixed width** — it previously grew with its widest
  section's content, so system/custom/card selections rendered different
  panel sizes.
- The drag handle is **always visible** on every shell (the card-header
  grip idiom) and the selection toolbar no longer contains one. Keyboard
  drag, Escape-cancel, and system-field drag+lock behavior are unchanged.
  Tests that selected a field to reach the `labels.dragField` handle should
  instead query the grip inside the shell (it is no longer unique
  page-wide).

## Migration to 0.9.0
```

8. Known limitations — replace:

```
- **Group children have no add/remove UI.** The panel's Children section
  (drill-in only) lets you *edit* an existing child field's config, but
```

with:

```
- **Group children have no add/remove UI.** The General tab's Children list
  (drill-in only) lets you *edit* an existing child field's config, but
```

- [ ] **Step 2: Stories — SystemFields note**

In `src/editor/spec-editor.stories.tsx`, replace:

```tsx
					<code>Name</code> and <code>Description</code> are system fields (
					<code>field.system</code>): the ⋮ toolbar shows a lock and no delete,
					the config panel renders a read-only summary, and dragging still
					works. <code>Internal reference</code> is a normal editable field.
					Duplicating a system field produces an editable copy.
```

with:

```tsx
					<code>Name</code> and <code>Description</code> are system fields (
					<code>field.system</code>): the toolbar shows a lock and no delete,
					the config panel renders a read-only summary with no tab strip, and
					dragging still works from the shell's always-visible grip.{" "}
					<code>Internal reference</code> is a normal editable field.
					Duplicating a system field produces an editable copy.
```

- [ ] **Step 3: CLAUDE.md directory layout**

Replace:

```
│   ├── field-shell.tsx  # Per-field wrapper: selection, toolbar, inert content
```

with:

```
│   ├── field-shell.tsx  # Per-field wrapper: persistent grip, selection, toolbar, inert content
```

and replace:

```
│   ├── field-config-panel.tsx  # Side panel (live edits, accessor gate, group drill-in)
│   ├── panel-sections/  # Config / validation / type-settings panel sections
```

with:

```
│   ├── field-config-panel.tsx  # Side panel: General/Validation/Type-settings tabs, accessor gate, drill-in
│   ├── panel-sections/  # Tab bodies (config/validation/settings) + system summary
```

- [ ] **Step 4: Version bump + lockfile**

In `package.json`, replace `"version": "0.9.0",` with `"version": "0.10.0",` then sync the lockfile:

```bash
npm install --package-lock-only
```

- [ ] **Step 5: Full gates + commit**

Run: `npm run test && npm run typecheck && npm run lint && npm run verify-exports && npm run build && npm run build:storybook`
Expected: all PASS (verify-exports: no public-surface change; build:storybook renders the updated note and mdx).

```bash
git add src/editor/spec-editor.mdx src/editor/spec-editor.stories.tsx CLAUDE.md package.json package-lock.json
git commit -m "docs(editor): panel tabs + grip contract; chore: v0.10.0"
```

---

## Post-plan (not tasks)

- Final whole-branch review, then runtime gate in Storybook (`npm run dev`):
  - `Build`: select a field → tab strip with General active; switch to Validation, select another field → General again; banner check via `InvalidDraft` (select a duplicate field, switch tabs, banner stays); panel width identical across selections.
  - `SystemFields`: read-only summary, NO tab strip, identical panel width; drag a system field by its shell grip.
  - `BuildWithCards`: card panel = Name body without tabs; card header grip unchanged.
  - Grip: reorder an UNSELECTED field by pointer AND by keyboard (Space, arrows, Space; Escape cancels); confirm the selected toolbar shows Edit/Duplicate/Delete only.
  - Then merge to main.
- Release: tag `v0.10.0` push **only after explicit user OK**.
- mediahub follow-up (separate repo, on release): bump fieldkit to 0.10.0; if its e2e tests reach the panel's disclosure toggles or the selection-toolbar drag handle, re-target tabs/shell grips (hosts overriding the deprecated `panel*` label keys are unaffected — the keys still typecheck).
