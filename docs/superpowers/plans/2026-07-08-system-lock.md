# System-Field Panel Lock Implementation Plan (sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** System fields (`field.system === true`) become fully read-only in the SpecEditor config panel — a definition summary replaces the editable sections — shipping as fieldkit 0.6.0 so the mediahub asset-detail project can pin it.

**Architecture:** One branch in `FieldConfigPanel`: when the active field is a system field, render a new `SystemFieldSummary` (panel-sections pattern) instead of the ConfigSection/ValidationSection/SettingsSection disclosures. Nothing interactive is mounted at all — the plugin's arbitrary `settingsComponent` cannot be force-disabled, so not mounting it is the only real guarantee. Dragging stays enabled; delete stays hidden; duplicate keeps resetting `system: false` (all pre-existing behavior).

**Tech Stack:** React 19, Chakra v3 via @knkcs/anker 4.0.0, Vitest + @testing-library/react (jsdom), Storybook 8, tsup.

**Spec:** `~/repo/mediahub/docs/superpowers/specs/2026-07-07-asset-detail-spec-composed-design.md`, section "A. fieldkit — system-lock hardening".

## Global Constraints

- For `field.system`, the entire config panel (config, validation, and type-settings sections) renders read-only — mirroring core's `isEditable = !value.system`. Implemented as: no interactive section is mounted; a read-only summary + notice renders instead.
- Dragging stays enabled; delete stays hidden; duplicate keeps resetting `system: false` — no changes to these (regression-guarded only).
- New `EditorLabels` key `panelSystemNotice`, default text exactly: `"System field — its definition is managed by the application. You can reposition it on the canvas."`
- All strings via `EditorLabels` (no hardcoded UI copy); `displayName` on every exported component; Lucide icons only; anker semantic tokens only.
- Conventional Commits; gates with real exit codes (`command; echo "NAME=$?"`, never piped into tail/head).
- Branch `feat/system-lock` off fieldkit main; version bump to 0.6.0 happens at release time (controller), NOT in a task.

---

### Task 1: SystemFieldSummary + panel branch + label + tests

**Files:**
- Create: `src/editor/panel-sections/system-summary.tsx`
- Modify: `src/editor/field-config-panel.tsx` (return body, ~lines 452–530: wrap the editable blocks in the non-system branch)
- Modify: `src/editor/spec-editor.tsx` (EditorLabels interface + DEFAULT_EDITOR_LABELS)
- Test: `src/editor/__tests__/field-config-panel.test.tsx`
- Test: `src/editor/__tests__/field-shell.test.tsx` (regression pin — see Step 2b)

**Interfaces:**
- Consumes: `PanelSectionProps` (exported from `field-config-panel.tsx`), `makeField`/`EditorWrap` from `__tests__/editor-helpers.tsx`, the test file's existing `testLabels`.
- Produces: `SystemFieldSummary: React.FC<Pick<PanelSectionProps, "field" | "plugin" | "labels">>`; testids `panel-system-summary`, `panel-system-notice`; label key `panelSystemNotice` — Task 2 documents these.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repo/fieldkit && git checkout -b feat/system-lock
```

- [ ] **Step 2: Write the failing tests**

Append to `src/editor/__tests__/field-config-panel.test.tsx` (reuse the file's existing imports, `testLabels`, `makeField`, `EditorWrap`; if `testLabels` is a hand-rolled partial object rather than `DEFAULT_EDITOR_LABELS`, add `panelSystemNotice: "System field notice"` to it):

```tsx
describe("system fields — panel lock", () => {
	function renderPanel(system: boolean) {
		const field = makeField("name", "Name");
		field.system = system;
		field.config.instructions = "The name of the asset.";
		const onFieldChangeSpy = vi.fn();
		render(
			<EditorWrap>
				<FieldConfigPanel
					field={field}
					plugin={undefined}
					draft={[field]}
					fieldErrors={[]}
					onFieldChange={onFieldChangeSpy}
					onClose={vi.fn()}
					committedAccessors={new Set()}
					baselineAccessor={field.config.api_accessor}
					labels={testLabels}
				/>
			</EditorWrap>,
		);
		return onFieldChangeSpy;
	}

	it("renders a read-only summary instead of the editable sections", () => {
		renderPanel(true);
		expect(screen.getByTestId("panel-system-summary")).toBeInTheDocument();
		expect(screen.getByTestId("panel-system-notice")).toBeInTheDocument();
		// None of the editable machinery mounts:
		expect(screen.queryByTestId("panel-name-input")).toBeNull();
		expect(screen.queryByTestId("panel-accessor-input")).toBeNull();
		expect(screen.queryByTestId("panel-required-input")).toBeNull();
		expect(screen.queryByTestId("panel-toggle-general")).toBeNull();
		expect(screen.queryByTestId("panel-toggle-validation")).toBeNull();
		expect(screen.queryByTestId("panel-toggle-type-settings")).toBeNull();
		// The strongest guarantee: zero form controls in the whole panel.
		expect(screen.queryAllByRole("textbox")).toHaveLength(0);
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});

	it("summary shows accessor, required state, and instructions", () => {
		renderPanel(true);
		const summary = within(screen.getByTestId("panel-system-summary"));
		expect(summary.getByText("name")).toBeInTheDocument(); // mono accessor
		expect(summary.getByText("The name of the asset.")).toBeInTheDocument();
	});

	it("non-system fields keep the editable panel (regression)", () => {
		renderPanel(false);
		expect(screen.queryByTestId("panel-system-summary")).toBeNull();
		expect(screen.getByTestId("panel-name-input")).toBeInTheDocument();
		expect(screen.getByTestId("panel-toggle-validation")).toBeInTheDocument();
	});
});
```

Add `within` to the file's `@testing-library/react` import if not already imported.

- [ ] **Step 2b: Pin the shell behaviors the release contract depends on**

The lock badge / hidden delete / drag-grip behaviors for system shells exist
in `field-shell.tsx` but have NO test today. Append to
`src/editor/__tests__/field-shell.test.tsx` (reusing the file's `field`,
`Wrap`, `noop`, `shellLabels`). These pass immediately — they are regression
pins, not part of the RED run:

```tsx
	it("system field: lock badge shown, delete hidden, drag handle kept", () => {
		const sysField: Field = { ...field, system: true };
		render(
			<Wrap>
				<FieldShell
					field={sysField}
					selected={true}
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
		expect(screen.getByLabelText(shellLabels.systemLocked)).toBeInTheDocument();
		expect(screen.queryByLabelText(shellLabels.deleteField)).toBeNull();
		expect(screen.getByLabelText(shellLabels.dragField)).toBeInTheDocument();
		expect(screen.getByLabelText(shellLabels.duplicateField)).toBeInTheDocument();
	});
```

(If the toolbar renders only on hover/selection state other than `selected`,
mirror whatever the file's existing toolbar tests do to reveal it.)

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/field-config-panel.test.tsx; echo "EXIT=$?"
```

Expected: FAIL — `panel-system-summary` not found (the first two tests); the regression test passes. `EXIT=1`.

- [ ] **Step 4: Add the label key**

In `src/editor/spec-editor.tsx`, add to the `EditorLabels` interface next to the other `panel*` keys:

```ts
	/** Notice shown in the config panel for system fields (read-only). */
	panelSystemNotice?: string;
```

and to `DEFAULT_EDITOR_LABELS`:

```ts
	panelSystemNotice:
		"System field — its definition is managed by the application. You can reposition it on the canvas.",
```

- [ ] **Step 5: Create SystemFieldSummary**

Create `src/editor/panel-sections/system-summary.tsx`:

```tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import type { PanelSectionProps } from "../field-config-panel";

/**
 * Read-only definition summary rendered INSTEAD of the editable sections
 * when the selected field is a system field (`field.system`). System
 * definitions are server-canonical: any edit made in the panel would
 * silently revert on the host's next read, so nothing interactive is
 * mounted at all — including the plugin's settingsComponent, which the
 * editor cannot force-disable (it is arbitrary consumer UI).
 */
export function SystemFieldSummary({
	field,
	labels,
}: Pick<PanelSectionProps, "field" | "plugin" | "labels">) {
	return (
		<Box data-testid="panel-system-summary">
			<Text
				fontSize="sm"
				color="fg.muted"
				mb="3"
				data-testid="panel-system-notice"
			>
				{labels.panelSystemNotice}
			</Text>
			<SummaryRow label={labels.accessor}>
				<Text as="span" fontFamily="mono" fontSize="xs">
					{field.config.api_accessor}
				</Text>
			</SummaryRow>
			<SummaryRow label={labels.required}>
				{field.config.required ? "✓" : "—"}
			</SummaryRow>
			{field.config.instructions && (
				<SummaryRow label={labels.instructions}>
					{field.config.instructions}
				</SummaryRow>
			)}
		</Box>
	);
}
SystemFieldSummary.displayName = "SystemFieldSummary";

function SummaryRow({
	label,
	children,
}: {
	label: string | undefined;
	children: React.ReactNode;
}) {
	return (
		<Flex gap="2" py="1" fontSize="sm" align="baseline">
			<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
				{label}
			</Text>
			<Box>{children}</Box>
		</Flex>
	);
}
```

(The `plugin` key stays in the `Pick` for interface stability even though the
component reads only `field` + `labels` — the panel header already shows the
plugin name. If lint flags the unused prop, narrow the Pick to
`"field" | "labels"` and drop `plugin` from the panel call site instead.)

- [ ] **Step 6: Branch the panel**

In `src/editor/field-config-panel.tsx`:

(a) Import the component (with the other panel-section imports):

```tsx
import { SystemFieldSummary } from "./panel-sections/system-summary";
```

(b) In the return body, wrap everything AFTER the header `Flex` (the
duplicate banner, the three `Disclosure`s, and the group-children block) in
a conditional. The result (existing blocks unchanged, only re-indented into
the fragment):

```tsx
			{activeField.system ? (
				<SystemFieldSummary
					field={activeField}
					plugin={activePlugin}
					labels={labels}
				/>
			) : (
				<>
					{isDuplicateSelection && (
						/* …existing duplicate banner block, unchanged… */
					)}

					<Disclosure title={labels.panelGeneral} defaultOpen testId="general">
						{/* …existing ConfigSection block, unchanged… */}
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
						/* …existing children block, unchanged… */
					)}
				</>
			)}
```

Keep the back button and header outside the branch (they apply to both).
Do NOT modify ConfigSection/ValidationSection/SettingsSection themselves —
the existing `disabled={field.system}` on the accessor input becomes
unreachable but stays as belt-and-braces.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/field-config-panel.test.tsx; echo "EXIT=$?"
```

Expected: all pass (existing + 3 new). `EXIT=0`.

- [ ] **Step 8: Run the full gates**

```bash
cd ~/repo/fieldkit && npm run test; echo "TEST=$?"
npm run lint; echo "LINT=$?"
npm run typecheck; echo "TYPECHECK=$?"
```

Expected: all `=0`. (Duplicate-resets-`system` has existing draft-ops
coverage; the shell behaviors are pinned by Step 2b's new test.)

- [ ] **Step 9: Commit**

```bash
cd ~/repo/fieldkit && git add src/editor/panel-sections/system-summary.tsx src/editor/field-config-panel.tsx src/editor/spec-editor.tsx src/editor/__tests__/field-config-panel.test.tsx src/editor/__tests__/field-shell.test.tsx
git commit -m "feat(editor): read-only config panel for system fields"
```

---

### Task 2: Storybook story + contract docs

**Files:**
- Modify: `src/editor/spec-editor.stories.tsx` (new fixture + story)
- Modify: `src/editor/spec-editor.mdx` (labels table + behavior section)

**Interfaces:**
- Consumes: Task 1's `panelSystemNotice` label, `panel-system-summary` testid behavior, and the existing `StoryWrapper`/`text`/`textarea`-builder conventions in the stories file.
- Produces: story `SystemFields` (Storybook path `editor-speceditor--system-fields`) — the release runtime check drives it.

- [ ] **Step 1: Add the fixture and story**

In `src/editor/spec-editor.stories.tsx`, add to the Specs section (builders
return `system: false`; spread-and-override makes them system fields — the
fixture uses only the `text` builder, already imported):

```tsx
// System fields as a host would inject them (server-canonical definitions,
// e.g. mediahub's asset name/description): locked in the panel, draggable
// on the canvas, undeletable. Mixed with one customer field.
const systemSpec: Schema = [
	{ ...text("name", { name: "Name", required: true, instructions: "The name of the asset." }), system: true },
	{ ...text("description", { name: "Description" }), system: true },
	text("internal_ref", { name: "Internal reference" }),
];
```

and to the Stories section:

```tsx
export const SystemFields: Story = {
	render: () => (
		<StoryWrapper
			initialSchema={systemSpec}
			note={
				<>
					<code>Name</code> and <code>Description</code> are system fields
					(<code>field.system</code>): the ⋮ toolbar shows a lock and no
					delete, the config panel renders a read-only summary, and dragging
					still works. <code>Internal reference</code> is a normal editable
					field. Duplicating a system field produces an editable copy.
				</>
			}
		/>
	),
};
```

- [ ] **Step 2: Verify the story renders**

```bash
cd ~/repo/fieldkit && npm run build:storybook; echo "SB=$?"
```

Expected: `SB=0` (static build catches story compile errors; visual check
happens in the release runtime gate).

- [ ] **Step 3: Document the contract**

In `src/editor/spec-editor.mdx`:

(a) Add a row to the labels table (keep the table's existing column format):

```
| `panelSystemNotice` | "System field — its definition is managed by the application. You can reposition it on the canvas." | Notice atop the read-only panel summary for system fields. |
```

(b) Add a short section (place it near the config-panel/live-preview
section, heading level matching its siblings):

```mdx
## System Fields

Fields with `system: true` are host-owned definitions (typically injected
server-side and re-canonicalized on every read). The editor treats them as
locked content:

- The config panel renders a **read-only summary** (`panelSystemNotice` +
  accessor/required/instructions) instead of the editable sections — nothing
  interactive is mounted, including the plugin's `settingsComponent`.
- The shell toolbar shows a lock, hides **Delete**, and keeps **drag**
  enabled — authors arrange system fields freely among their own.
- **Duplicate** produces a copy with `system: false` — a copy is always
  user-owned.

The editor never *creates* system fields; they arrive via the `schema` prop.
Hosts are responsible for re-canonicalizing system definitions on read so a
stored spec can never drift from the application's truth.
```

- [ ] **Step 4: Run the full gates**

```bash
cd ~/repo/fieldkit && npm run test; echo "TEST=$?"
npm run lint; echo "LINT=$?"
npm run typecheck; echo "TYPECHECK=$?"
npm run build; echo "BUILD=$?"
npm run verify-exports; echo "EXPORTS=$?"
```

Expected: all `=0`.

- [ ] **Step 5: Commit**

```bash
cd ~/repo/fieldkit && git add src/editor/spec-editor.stories.tsx src/editor/spec-editor.mdx
git commit -m "docs(editor): SystemFields story + system-field contract in spec-editor.mdx"
```

---

## After Task 2: final review, runtime gate, release

1. **Final whole-branch review** (most capable model): package from `git merge-base main HEAD`, Global Constraints as the lens.
2. **Runtime gate (Storybook :6007, `editor-speceditor--system-fields`):** lock icon + no delete on system shells; panel shows summary + notice with zero inputs; system field drags to a new position; duplicate of Name yields an editable copy with its full panel; `Internal reference` keeps the normal editable panel; Save/Discard flow unaffected.
3. **Release fieldkit 0.6.0** (minor: new label key + editor behavior change): merge `feat/system-lock` → `npm pkg set version=0.6.0` + lock sync → **explicit user OK (AskUserQuestion)** → tag `v0.6.0` → `publish-fieldkit.yml` → npm verify → GH release referencing the mediahub asset-detail design (sub-project A of it).
4. **Post-release:** update the memory arc record; sub-project B (mediahub backend) becomes plannable with fieldkit 0.6.0 pinnable.
