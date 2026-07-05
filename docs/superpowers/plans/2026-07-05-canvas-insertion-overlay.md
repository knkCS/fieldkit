# Canvas Overlay Insertion Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Build canvas's in-flow 24px insertion rows with hover-revealed overlay boundaries so field gaps match the renderer's 20px rhythm.

**Architecture:** `insertionRow` in `editor-canvas.tsx` becomes `insertionBoundary(tabIndex, position, variant, alwaysVisible?)` with two variants: `"overlay"` (absolute, fills the 20px gap above each field, inside a `position="relative"` wrapper Box around the shell) and `"flow"` (a real 20px element used ONLY as the trailing per-tab boundary and the empty-state drop zones). Insert logic (`insertAt`, `flatInsertIndex`, `TypePickerPopover`) is untouched.

**Tech Stack:** React 19, Chakra v3 (existing imports), Vitest/RTL.

**Spec:** docs/superpowers/specs/2026-07-05-canvas-insertion-overlay-design.md

## Global Constraints

- Conventional Commits, scope `editor`. No new dependencies. anker tokens only (`accent` hairline, `bg-surface` chip). All strings via labels (unchanged — reuses `labels.addField`).
- Field-boundary DOM order must keep position semantics: N fields → N+1 "Add field" buttons per tab, button k inserts at position k (existing tests rely on this).
- Full gate before commit: `npm run test && npm run typecheck && npm run lint`.

---

### Task 1: overlay insertion boundaries

**Files:**
- Modify: `src/editor/editor-canvas.tsx:506-599` (insertionRow → insertionBoundary; renderFields; empty-spec branch)
- Test: `src/editor/__tests__/insertion.test.tsx` (adapt + 1 new regression)

**Interfaces:**
- Consumes: existing `insertAt`, `TypePickerPopover`, `labels.addField`.
- Produces: no API change; internal only.

- [ ] **Step 1: Write the failing regression test** — append to `insertion.test.tsx`:

```tsx
it("insertion boundaries between fields are overlays inside the shells' wrappers (no flow rows)", () => {
	render(<EditorWrap><Harness schema={[makeField("a"), makeField("b")]} /></EditorWrap>);
	const buttons = screen.getAllByLabelText("Add field");
	expect(buttons).toHaveLength(3); // above a, above b, trailing
	// The boundary above "b" lives INSIDE b's relative wrapper (overlay), not
	// as a flow sibling between the shells:
	const shellB = screen.getByTestId("shell-b");
	expect(shellB.parentElement).toContainElement(buttons[1]);
	// The trailing boundary IS a flow element after the last wrapper:
	expect(shellB.parentElement?.nextElementSibling).toContainElement(buttons[2]);
});
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run src/editor/__tests__/insertion.test.tsx` → the new test fails (boundaries are currently flow siblings).

- [ ] **Step 3: Implement** — in `editor-canvas.tsx`, replace `insertionRow` with:

```tsx
	const insertionBoundary = (
		tabIndex: number,
		position: number,
		variant: "overlay" | "flow",
		alwaysVisible = false,
	) => (
		<Flex
			key={`insert-${tabIndex}-${position}`}
			role="group"
			justify="center"
			align="center"
			height="5"
			{...(variant === "overlay"
				? { position: "absolute" as const, top: "-5", left: "0", right: "0", zIndex: "docked" }
				: {})}
			opacity={alwaysVisible ? 1 : 0}
			_hover={{ opacity: 1 }}
			// Keyboard parity with _hover: without this, Tabbing onto the ⊕
			// button lands on an invisible control (WCAG 2.4.7).
			_focusWithin={{ opacity: 1 }}
			transition="opacity 0.15s"
		>
			{/* hairline across the gap; the ⊕ chip sits on top and breaks it */}
			<Box position="absolute" left="0" right="0" top="50%" borderTopWidth="2px" borderColor="accent" />
			<Box position="relative" bg="bg-surface" borderRadius="full">
				<TypePickerPopover
					// "section" is inserted only via the strip's "+ Section" button —
					// this path skips the section-marker bookkeeping (addSection).
					plugins={plugins.filter((p) => p.id !== "section")}
					context={context}
					currentSpec={draft}
					onPick={insertAt(tabIndex, position)}
					triggerLabel={labels.addField}
				/>
			</Box>
		</Flex>
	);
```

`renderFields` body (Stack contents only — keys/occurrence logic unchanged):

```tsx
			<Stack gap="5">
				{fields.map((field, i) => (
					<Fragment key={keyFor(field.config.api_accessor)}>
						<Box position="relative">
							{insertionBoundary(tabIndex, i, "overlay")}
							<FieldShell /* …all existing props verbatim… */>
								<ShellContent field={field} labels={labels} />
							</FieldShell>
						</Box>
					</Fragment>
				))}
				{insertionBoundary(
					tabIndex,
					fields.length,
					"flow",
					fields.length === 0, // empty tab: visible drop zone
				)}
			</Stack>
```

Empty-spec branch: `insertionRow(0, 0, true)` becomes `insertionBoundary(0, 0, "flow", true)`.

Notes: position-0 overlay reaches into the panel's `pt="4"`; `top="-5"` = -20px fills the Stack gap exactly. The Fragment wrapper stays (keys); the relative Box goes inside it.

- [ ] **Step 4: Adapt existing tests** — in `insertion.test.tsx`, the focus-visibility stylesheet test targets the row rendered by the old builder; re-point it at any rendered boundary (same `_focusWithin` emission assertion). Button-order semantics are unchanged (button k = position k) — the existing position/click tests must pass WITHOUT edits; if one fails, the implementation (not the test) is wrong.

- [ ] **Step 5: Run** — `npx vitest run src/editor/` → all pass.

- [ ] **Step 6: Full gate + commit**

```bash
npm run test && npm run typecheck && npm run lint
git add src/editor/
git commit -m "fix(editor): overlay insertion boundaries restore field rhythm"
```

Runtime verification (controller): Storybook screenshot of the Build story confirming ~20px gaps + hover/focus reveal.
