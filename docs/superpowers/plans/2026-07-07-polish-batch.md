# Polish Batch Implementation Plan (#26, #30, #34 → 0.4.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining polish issues in one branch — read-mode fallback formatting + jump/selector fixes (#26), the nine open SpecEditor minors (#30), and the deferred test fixtures + nesting fix (#34) — shipping as fieldkit 0.4.2.

**Architecture:** Task 1 covers the renderer (read-tab fallback with two new translatable labels, `:disabled` selector, div-in-p fix, the two #34 fixtures). Task 2 covers the five #30 behavior fixes (undo-selection, discard-nonce, rename-baseline map lifted into SpecEditor, accessor trim, moveField no-op). Task 3 covers #30's DX items (data-invalid, userEvent blur test, onDirtyChange ref) plus the four lint warnings and the verify-and-tick checks.

**Tech Stack:** React, Vitest/RTL, `@testing-library/user-event` (new devDep, Task 3 only).

**Spec:** `docs/superpowers/specs/2026-07-07-polish-batch-design.md`

## Global Constraints

- fieldkit-only; ships **0.4.2** (controller bumps at release). Additive API: ONLY the two `SpecFormLabels` keys `booleanYes` (default `"Yes"`) / `booleanNo` (default `"No"`).
- Read-mode fallback semantics EXACTLY: boolean → labels; array of primitives (string/number/boolean entries) → entries joined with `", "` (booleans inside via the labels); plain objects and arrays containing any object → the existing em-dash empty convention; string/number → `String(value)` as today. `cellComponent` remains the API for full control (mdx states this).
- `FOCUSABLE_SELECTOR` becomes exactly: `"input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]"`.
- #30 fixes preserve existing behavior contracts (e.g. `moveField` still clamps out-of-range; the panel's collision gate stays); the rename-baseline map clears on successful save AND on discard.
- No new lint suppressions unless a finding is a genuine false positive with an in-code justification (the `virtual-table-field` positional key may qualify — mirror `read-tab.tsx`'s existing justified ignore).
- Gates with REAL exit codes (log file + `echo $?`; never pipe a gate into tail/head): `npm run test`, `npm run typecheck`, `npm run lint`.
- Conventional Commits; scopes `renderer` (T1) / `editor` (T2, T3).

---

### Task 1: renderer — read fallback, selector, nesting fix, #34 fixtures

**Files:**
- Modify: `src/renderer/spec-form/read-tab.tsx`
- Modify: `src/renderer/spec-form/spec-form.tsx` (SpecFormLabels + DEFAULT_LABELS + FOCUSABLE_SELECTOR:25 + the two `<ReadTab` call sites at ~388/~442)
- Modify: `src/renderer/spec-form/spec-form.mdx` (labels rows + cellComponent note)
- Test: `src/renderer/spec-form/__tests__/spec-form-read.test.tsx` (extend), `src/renderer/spec-form/__tests__/field-search.test.tsx` (extend: disabled-skip), `src/renderer/spec-form/__tests__/spec-form-read-search.test.tsx` (extend: #34 fixtures)

**Interfaces:**
- Consumes: existing `ReadValue`/`ReadTab`/`isEmpty`/`EMPTY` in read-tab.tsx; test helpers.
- Produces: `SpecFormLabels.booleanYes?/booleanNo?: string`; `ReadTabProps` gains `labels: { booleanYes: string; booleanNo: string }` (internal).

- [ ] **Step 0: Check `isEmpty`.** Read `read-tab.tsx`'s `isEmpty` — if `isEmpty(false)` returns true, `false` would render the em dash before the new fallback ever runs. If so, narrow it (e.g. `value == null || value === "" || (Array.isArray(value) && value.length === 0)`) so booleans always reach the fallback, and note the change in your report.

- [ ] **Step 1: Write the failing tests.**

Append to `spec-form-read.test.tsx` (reuse its harness; it registers plugins — add a cell-less custom plugin fixture in-file):

```tsx
	// A plugin with NO cellComponent: read mode must fall back to
	// type-aware formatting, not raw String(value).
	const rawPlugin: FieldTypePlugin = {
		id: "raw",
		name: "Raw",
		description: "",
		icon: () => null,
		category: "text",
		fieldComponent: () => null,
		toZodType: () => z.unknown(),
	};

	function rawField(accessor: string): Field {
		return {
			field_type: "raw",
			config: { name: accessor, api_accessor: accessor, required: false, instructions: "" },
			settings: null,
			system: false,
		};
	}

	describe("read mode — cell-less fallback formatting", () => {
		function renderRaw(value: unknown, labels?: SpecFormLabels) {
			render(
				<Wrapper extraPlugins={[rawPlugin]}>
					<SpecForm
						schema={[rawField("x")]}
						mode="read"
						values={{ x: value }}
						labels={labels}
					/>
				</Wrapper>,
			);
		}

		it("renders booleans via the translatable labels", () => {
			renderRaw(true);
			expect(screen.getByText("Yes")).toBeInTheDocument();
		});

		it("boolean false renders No (not the empty dash, not 'false')", () => {
			renderRaw(false);
			expect(screen.getByText("No")).toBeInTheDocument();
			expect(screen.queryByText("false")).toBeNull();
		});

		it("labels override the boolean strings", () => {
			renderRaw(true, { booleanYes: "Ja", booleanNo: "Nein" });
			expect(screen.getByText("Ja")).toBeInTheDocument();
		});

		it("joins primitive arrays with a comma separator", () => {
			renderRaw(["a", 2, true]);
			expect(screen.getByText("a, 2, Yes")).toBeInTheDocument();
		});

		it("renders objects and object-arrays as the empty dash", () => {
			renderRaw({ nested: 1 });
			expect(screen.getByText("—")).toBeInTheDocument();
		});

		it("passes strings and numbers through unchanged", () => {
			renderRaw("plain");
			expect(screen.getByText("plain")).toBeInTheDocument();
		});
	});
```

(If `Wrapper` has no `extraPlugins` prop, extend the helper additively — existing callers unaffected — or build a local wrapper registering `[...testPlugins, rawPlugin]`; disclose which.)

Append to `field-search.test.tsx` (edit-mode jump; reuse its schema/harness style — the point: a disabled control first in the container must not win the fallback focus):

```tsx
	it("skips disabled controls in the jump focus fallback", async () => {
		// A picker-style field whose FIRST focusable child is disabled: the
		// fallback must focus the next enabled control, not no-op on the
		// disabled one.
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("title", "Title"),
						makeSection("seo", "SEO"),
						makeDisabledFirstField("locked", "Locked picker"),
					]}
				/>
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "locked" },
		});
		const listbox = await screen.findByRole("listbox");
		fireEvent.click(within(listbox).getByText("Locked picker"));
		await waitFor(() => {
			expect(screen.getByLabelText("enabled-control")).toHaveFocus();
		});
	});
```

with a helper component/plugin in `helpers.tsx` (additive):

```tsx
// Picker-style field whose first focusable child is DISABLED — pins the
// jump fallback's :disabled skip.
function DisabledFirstField({ field }: FieldProps) {
	const accessor = field.config.api_accessor;
	return (
		<div data-testid={`field-${accessor}`}>
			<label htmlFor={accessor}>{field.config.name}</label>
			<button type="button" disabled aria-label="disabled-control">
				locked
			</button>
			<button type="button" aria-label="enabled-control">
				pick
			</button>
		</div>
	);
}
```

registered as plugin id `"disabled-first"` in `testPlugins`, plus `makeDisabledFirstField(accessor, name)` mirroring `makePickerField`. NOTE: for the container-fallback tier to run, the field must have no `[name=…]` control and no matching `label[for]`→input — mirror `PickerField`'s shape (label htmlFor pointing at nothing focusable directly).

Append to `spec-form-read-search.test.tsx` (the #34 fixtures — reuse its helpers):

```tsx
	it("scopes the jump to its own instance when two SpecForms share accessors", async () => {
		render(
			<Wrapper>
				<div data-testid="first">
					<SpecForm schema={schema} mode="read" values={{}} />
				</div>
				<div data-testid="second">
					<SpecForm schema={schema} mode="read" values={{}} />
				</div>
			</Wrapper>,
		);
		const first = screen.getByTestId("first");
		const firstSearch = within(first).getByPlaceholderText("Find field…");
		fireEvent.change(firstSearch, { target: { value: "meta" } });
		const listbox = await within(first).findByRole("listbox");
		fireEvent.click(within(listbox).getByText("Meta title"));

		await waitFor(() => {
			const row = within(first).getByText("Meta title", { exact: false });
			// The FIRST instance's row flashes…
			expect(
				first.querySelector<HTMLElement>(
					`[data-field-row="${CSS.escape("meta.title")}"]`,
				)?.style.boxShadow,
			).toContain("3px");
		});
		// …and the SECOND instance's identical row does not.
		const secondRow = screen
			.getByTestId("second")
			.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape("meta.title")}"]`,
			);
		expect(secondRow?.style.boxShadow ?? "").not.toContain("3px");
	});

	it("jumps to an accessor containing a double quote (CSS.escape load-bearing)", async () => {
		const quoted = [
			makeField("title", "Title"),
			makeSection("seo", "SEO"),
			makeField('we"ird', "Weird field"),
		];
		render(
			<Wrapper>
				<SpecForm schema={quoted} mode="read" values={{}} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "weird" },
		});
		const listbox = await screen.findByRole("listbox");
		fireEvent.click(within(listbox).getByText("Weird field"));
		await waitFor(() => {
			const row = document.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape('we"ird')}"]`,
			);
			expect(row?.style.boxShadow).toContain("3px");
		});
	});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/`
Expected failures: booleans render `true`/em-dash (no labels), array renders comma-joined raw string without label mapping (may partially pass — the assertion on `"a, 2, Yes"` fails), object renders `[object Object]`, disabled-skip focuses nothing, quote-accessor jump: PASSES already (CSS.escape landed in 0.4.1 — this is a pin; if it unexpectedly fails, STOP). Two-instance: PASSES already (scoping landed in 0.4.1 — pin; same STOP rule).

- [ ] **Step 3: Implement the fallback.** In `read-tab.tsx`:

```tsx
interface ReadValueLabels {
	booleanYes: string;
	booleanNo: string;
}

/**
 * Type-aware fallback for plugins without a cellComponent: booleans and
 * primitive arrays render readably instead of raw String(value); objects
 * (and arrays containing objects) fall back to the em-dash convention —
 * a cellComponent is the API for full control over complex values.
 * Returns null for "render the em dash".
 */
function formatFallback(value: unknown, labels: ReadValueLabels): string | null {
	if (typeof value === "boolean") {
		return value ? labels.booleanYes : labels.booleanNo;
	}
	if (Array.isArray(value)) {
		const primitives = value.every(
			(v) =>
				typeof v === "string" ||
				typeof v === "number" ||
				typeof v === "boolean",
		);
		if (!primitives) return null;
		return value
			.map((v) =>
				typeof v === "boolean"
					? v
						? labels.booleanYes
						: labels.booleanNo
					: String(v),
			)
			.join(", ");
	}
	if (typeof value === "object") return null;
	return String(value);
}
```

`ReadValue` gains a `labels: ReadValueLabels` prop (threaded through the group recursion's inner `<ReadValue>` too); its tail becomes:

```tsx
	const Cell = getPlugin(field.field_type)?.cellComponent;
	if (Cell) return <Cell field={field} value={value} />;

	const formatted = formatFallback(value, labels);
	if (formatted == null) return <Text color="fg.muted">{EMPTY}</Text>;
	return <Text>{formatted}</Text>;
```

`ReadTab` props gain `labels: ReadValueLabels`, passed to every `<ReadValue>`. Both `<ReadTab` call sites in `spec-form.tsx` pass `labels={{ booleanYes: resolvedLabels.booleanYes, booleanNo: resolvedLabels.booleanNo }}` (the sectioned site receives `labels` already; the sectionless site at ~442 uses `resolvedLabels` in scope).

`SpecFormLabels` gains:

```ts
	/** Read-mode fallback rendering of boolean true (cell-less plugins). */
	booleanYes?: string;
	/** Read-mode fallback rendering of boolean false (cell-less plugins). */
	booleanNo?: string;
```

`DEFAULT_LABELS` gains `booleanYes: "Yes",` / `booleanNo: "No",`.

- [ ] **Step 4: Selector + nesting fix.** In `spec-form.tsx:25`:

```ts
const FOCUSABLE_SELECTOR =
	"input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]";
```

In `read-tab.tsx`, the row wrapper (line ~85) becomes:

```tsx
						{/* span+block: DescriptionList.Row renders its value inside a
						    <p>, and a div child triggers React's DOM-nesting warning. */}
						<Box
							as="span"
							display="block"
							data-field-row={field.config.api_accessor}
						>
```

- [ ] **Step 5: GREEN + full gate**

```bash
cd ~/repo/fieldkit
npx vitest run src/renderer/spec-form/
npm run test > /tmp/fk-gate.log 2>&1; echo "TEST=$?"
npm run typecheck >> /tmp/fk-gate.log 2>&1; echo "TC=$?"
npm run lint >> /tmp/fk-gate.log 2>&1; echo "LINT=$?"
```
Expected: all 0.

- [ ] **Step 6: Docs.** `spec-form.mdx`: labels rows for `booleanYes`/`booleanNo`; a read-mode note: the fallback formats booleans/primitive arrays and em-dashes complex values — plugins with non-string values should ship a `cellComponent` for full control; update the prose labels enumeration.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/
git commit -m "feat(renderer): read-mode fallback formatting; jump and nesting fixes"
```

---

### Task 2: editor — the five #30 behavior fixes

**Files:**
- Modify: `src/editor/spec-editor.tsx` (undo handler ~406-420; discard handler ~430; panel-apply handler ~390-401; rename-baseline map; panel prop)
- Modify: `src/editor/field-config-panel.tsx` (thread `baselineAccessor`)
- Modify: `src/editor/panel-sections/config-section.tsx` (replace `syncedAccessorRef` with the prop; trim in `validateAccessor`)
- Modify: `src/editor/draft-ops.ts` (`moveField` ~97-103)
- Test: `src/editor/__tests__/spec-editor.test.tsx` + `src/editor/__tests__/field-config-panel.test.tsx` + `src/editor/__tests__/draft-ops.test.ts` (extend each)

**Interfaces:**
- Consumes: existing `spec.apply`/`spec.discard`, `setSelected`, `insertFieldAt`, `updateField`, mocked `toaster.create` in spec-editor tests.
- Produces: `FieldConfigPanelProps` (and `ConfigSection` props) gain `baselineAccessor: string` — the accessor this field had in the last committed schema (identity-tracked across in-session renames).

- [ ] **Step 1: Write the failing tests.**

`draft-ops.test.ts`:

```ts
	it("moveField(schema, i, i) returns the SAME reference (no-op contract)", () => {
		const schema = [makeField("a"), makeField("b")];
		expect(moveField(schema, 1, 1)).toBe(schema);
	});
```

`spec-editor.test.tsx` (uses the file's mocked `toaster.create` and `renderEditor`):

```tsx
	it("undo restores the deleted field AND its panel selection", async () => {
		renderEditor([makeField("title", "Title"), makeField("body", "Body")]);
		// Delete "body" via its shell toolbar (adapt to the file's existing
		// delete-flow test if one exists — reuse its exact interaction).
		// …delete interaction…
		const call = vi.mocked(toaster.create).mock.calls.at(-1)?.[0];
		await act(async () => {
			call?.action?.onClick?.();
		});
		// The restored field is selected: its config panel shows its name.
		expect(screen.getByTestId("panel-name-input")).toHaveValue("Body");
	});

	it("discard while in Try-it resets scratch values (nonce bump)", async () => {
		renderEditor([makeField("title", "Title")]);
		// dirty the draft, enter Try-it, type a scratch value
		// …rename Title→Title2 via panel, click Try-it, type "scratch" into the field…
		// then Discard (header button stays available in Try-it)
		fireEvent.click(screen.getByText(L.discard));
		await waitFor(() => {
			const input = screen.getByLabelText(/Title/);
			expect(input).toHaveValue("");
		});
	});
```

(These two need the file's existing interaction idioms — the delete-toolbar click and the Try-it entry flow both already exist in this suite or its siblings (`try-it.test.tsx`); REUSE those exact interactions rather than inventing new ones. The assertions above are the contract; if `panel-name-input` isn't the testid, use the panel's actual name-input testid from `field-config-panel.test.tsx`.)

`field-config-panel.test.tsx`:

```tsx
	it("keeps the committed-accessor warning after deselect/reselect mid-rename", () => {
		// Committed field "title" renamed to "title2" in the panel → warning
		// shows. Simulate deselect/reselect by re-rendering with the SAME
		// field (new accessor) and baselineAccessor="title".
		// Pre-fix, the panel re-baselined to the draft accessor and the
		// warning vanished. Adapt to this file's harness: render the panel
		// with committedAccessors={new Set(["title"])} and
		// baselineAccessor="title" for a field whose api_accessor="title2";
		// assert the disconnect warning text is visible.
	});

	it("blur with a colliding trimmed accessor never applies the untrimmed value", () => {
		// Type "body " (trailing space) as accessor where "body" is taken:
		// validateAccessor must flag the collision (trimmed check) and the
		// draft must NOT receive "body ". Assert via the file's apply-spy /
		// readDump idiom.
	});
```

(Write these two against the file's real harness — it drives the panel directly with an apply spy (`readDump()` idiom seen at lines ~393-403). The contracts are as stated; fill the interactions from the file's own patterns. This is the ONE place the plan delegates test-body detail to the file's conventions — the harness is bespoke and already in front of the implementer.)

- [ ] **Step 2: RED** — run the three test files; the new tests fail (moveField returns a new array; undo leaves selection empty; discard keeps scratch values; warning vanishes on reselect; trailing-space accessor reaches the draft).

- [ ] **Step 3: Implement.**

`draft-ops.ts` `moveField` — after the bounds checks:

```ts
	if (fromIndex === toIndex) return schema;
```

`spec-editor.tsx`:

1. Undo selection — in `handleDeleteField`'s toast action:

```ts
				onClick: () => {
					spec.apply((draft) => insertFieldAt(draft, field, flatIndex));
					// Restore the panel context the delete destroyed.
					setSelected(field.config.api_accessor);
				},
```

2. Discard nonce — in `handleDiscard`:

```ts
	function handleDiscard() {
		spec.discard();
		// A Try-it view mounted against the pre-discard draft would keep its
		// scratch values; remount it against the reset draft.
		setTryItNonce((n) => n + 1);
		renameBaselinesRef.current.clear();
	}
```

3. Rename baselines — beside the other refs:

```ts
	// Draft-accessor -> last-COMMITTED accessor for fields renamed this
	// session. The config panel's committed-accessor disconnect warning
	// compares against this baseline; without it, deselect/reselect
	// re-baselines to the draft accessor and the warning vanishes
	// mid-rename.
	const renameBaselinesRef = useRef(new Map<string, string>());
```

In the panel-apply handler's accessor-change branch (currently `if (next.config.api_accessor !== selected) { setSelected(...) }`):

```ts
		if (next.config.api_accessor !== selected) {
			const baselines = renameBaselinesRef.current;
			const base = baselines.get(selected) ?? selected;
			baselines.delete(selected);
			if (base === next.config.api_accessor) {
				// Renamed back to its committed accessor — no disconnect.
				baselines.delete(next.config.api_accessor);
			} else {
				baselines.set(next.config.api_accessor, base);
			}
			setSelected(next.config.api_accessor);
		}
```

Clear the map on successful save (wherever `spec.save`/commit resolves — same place other post-save state resets happen) and in `handleDiscard` (above). Pass to the panel:

```tsx
	baselineAccessor={
		selected != null
			? (renameBaselinesRef.current.get(selected) ?? selected)
			: ""
	}
```

`field-config-panel.tsx`: props gain `/** The accessor this field had in the last committed schema (rename-tracked). */ baselineAccessor: string;` — forwarded to `ConfigSection`.

`config-section.tsx`:
- Props gain `baselineAccessor: string`.
- DELETE `syncedAccessorRef` (declaration + the resync-effect write). The two usages switch to the prop: `isCommittedField = committedAccessors.has(baselineAccessor)` and the warning comparison `accessorInput !== baselineAccessor` (adjust the exact expression at ~189-193 accordingly).
- `validateAccessor` trims for the collision check:

```ts
	function validateAccessor(value: string): string | null {
		if (value.trim() === "") return labels.accessorEmpty;
		// Trim before the collision check: a trailing-whitespace variant of a
		// taken accessor must be flagged, or blur-in-error-state leaves the
		// untrimmed value in the draft.
		if (takenAccessors.has(value.trim())) return labels.accessorInUse;
		return null;
	}
```

- [ ] **Step 4: GREEN + full gate** (same three commands/log pattern). All existing panel/editor tests must stay green — the `baselineAccessor` prop is new but existing tests that hand-roll panel props will need the new required prop added; that is an EXPECTED mechanical test-harness update (add `baselineAccessor={<the field's accessor>}`), not a behavior change — list every touched test file in your report.

- [ ] **Step 5: Commit**

```bash
git add src/editor/
git commit -m "fix(editor): undo selection, Try-it discard, rename baseline, trim, moveField no-op"
```

---

### Task 3: editor DX — data-invalid, userEvent blur test, onDirtyChange ref, lint sweep

**Files:**
- Modify: `package.json` (devDep `@testing-library/user-event`) + lockfile
- Modify: `src/editor/field-shell.tsx` (data-invalid) + its border test (locate the danger-outline assertion — `field-shell.test.tsx` or `validation-surfacing.test.tsx`)
- Modify: `src/editor/use-spec-draft.ts` (onDirtyChange ref, ~lines 49/104-109)
- Modify: `src/renderer/fields/virtual-table-field.tsx` (~121), `src/rich-text-spec/editor-spec-editor.tsx` (~177), `src/table/__tests__/edit-drawer.test.tsx` (~21), `src/table/__tests__/spec-data-table.test.tsx` (~25) — the four lint warnings
- Modify: `src/editor/spec-editor.mdx` (onDirtyChange row note)
- Test: `src/editor/__tests__/use-spec-draft.test.tsx` (extend), new userEvent test in `src/editor/__tests__/sections.test.tsx` or a new `rename-blur.test.tsx`

**Interfaces:**
- Consumes: Task 2's committed state (no interface coupling).
- Produces: `FieldShell` root carries `data-invalid="true"` when invalid.

- [ ] **Step 1: devDep**

```bash
cd ~/repo/fieldkit && npm install -D @testing-library/user-event
```

- [ ] **Step 2: Write the failing tests.**

`use-spec-draft.test.tsx`:

```tsx
	it("calls the LATEST onDirtyChange without re-firing on identity churn", () => {
		const calls: Array<[string, boolean]> = [];
		function Host({ tag }: { tag: string }) {
			// Deliberately unmemoized callback — a new identity every render.
			const spec = useSpecDraft(schema, onCommit, (d) => calls.push([tag, d]));
			return <button onClick={() => spec.apply((dr) => [...dr])}>mutate</button>;
		}
		const { rerender } = render(<Host tag="a" />);
		const before = calls.length;
		// Re-render with a NEW callback identity but unchanged dirty state:
		rerender(<Host tag="b" />);
		expect(calls.length).toBe(before); // no re-fire on identity churn
	});
```

(Adapt `useSpecDraft`'s exact signature/harness from the file's existing tests — the contract: identity-only changes don't re-fire; when dirty DOES flip, the latest callback is the one invoked.)

FieldShell test — locate the existing danger-outline assertion (grep `danger.600`/`borderColor` in the editor tests) and replace/augment it:

```tsx
	expect(shell).toHaveAttribute("data-invalid", "true");
```

plus the negative (`not.toHaveAttribute("data-invalid")`) on a valid shell.

Rename blur-ordering (new `src/editor/__tests__/rename-blur.test.tsx`, userEvent-based):

```tsx
	it("commits an in-progress rename before + Section acts (native blur ordering)", async () => {
		const user = userEvent.setup();
		renderEditor([...sectioned schema...]);
		// start a section rename (adapt: the section ⌄ menu → Rename, per
		// sections.test.tsx's existing idiom), type a new name WITHOUT
		// pressing Enter, then user.click the "+ Section" button.
		await user.click(screen.getByText("+ Section"));
		// The rename committed via blur BEFORE the new section was added:
		expect(screen.getByRole("tab", { name: /Renamed/ })).toBeInTheDocument();
		// and the new section exists too.
	});
```

(Adapt the rename-entry idiom from `sections.test.tsx` — it exercises the rename input already with fireEvent; this test's added value is REAL focus traversal via userEvent, which fireEvent cannot emulate. The assertions are the contract.)

- [ ] **Step 3: Implement.**

`use-spec-draft.ts`:

```ts
	// Call-latest ref: consumers need not memoize onDirtyChange — identity
	// churn must not re-fire the notification effect.
	const onDirtyChangeRef = useRef(onDirtyChange);
	useEffect(() => {
		onDirtyChangeRef.current = onDirtyChange;
	});
	useEffect(() => {
		onDirtyChangeRef.current?.(dirty);
	}, [dirty]);
```

(replacing the current `[dirty, onDirtyChange]` effect).

`field-shell.tsx`: on the root element alongside the border props, add `data-invalid={invalid ? "true" : undefined}`.

Lint sweep:
- `virtual-table-field.tsx:121`: preview rows are arbitrary user JSON with no stable id — positional keys are genuinely correct here; add a justified ignore mirroring `read-tab.tsx`'s existing one: `// biome-ignore lint/suspicious/noArrayIndexKey: preview rows are positional; virtual-table records carry no stable id`.
- `editor-spec-editor.tsx:177`: the bare `<label>` labels nothing — change the element to `<span>` (same style object).
- The two table test files (~21/~25): associate properly by nesting: `<label>{field.config.name}<input {...register(...)} /></label>` (queries use testids — unaffected).

`spec-editor.mdx`: the `onDirtyChange` row gains "(need not be memoized — the hook latches the latest callback)".

- [ ] **Step 4: Verify-and-tick sweep (report-only).** Confirm in the current tree and state in your report with file:line evidence: (a) `getDefaultValues` is called once per render in editor-canvas (memoized); (b) blocks/group share `NestedItemFields` with a render-count probe test; (c) TryItView forwards labels plainly and SpecForm's `mergeLabels` ignores explicit-undefined (the canvas-markers fallback test pins it). No code changes for these.

- [ ] **Step 5: GREEN + full gate** (same three commands/log pattern). Lint must now report ZERO warnings (the 4 pre-existing ones are gone) — state the before/after warning count.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/
git commit -m "fix(editor): data-invalid pin, onDirtyChange latch, lint sweep"
```

---

## Controller work (after Task 3)

1. File the anker issue: anker text inputs render `id` but no `name` attribute (RHF's field props include `name`; something drops it) — fieldkit's edit-jump tier-1 `[name=…]` selector never matches (works via fallbacks; the tier is dead). Reference the #24 runtime pass.
2. Runtime pass (Storybook): read-mode story with a boolean/cell-less value → formatted "Yes"; editor — delete a field, Undo → panel shows the restored field selected; Try-it → type scratch → Discard → re-enter → values reset.
3. Final whole-branch review → merge → `chore: v0.4.2` → tag → publish → GH release → close #26, #30, #34.
