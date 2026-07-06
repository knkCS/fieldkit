# Marker Convention (anker FormField markers + SpecForm §10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anker's `FormField`/`ControlledFormField` render §10 required/optional label markers (asterisk by default, `optionalText` for the optional convention, form-level defaults via a new `FormMarkersProvider`); fieldkit's SpecForm then auto-selects the per-form convention from the schema.

**Architecture:** anker hosts both the marker rendering and the form-level convention context (Approach B) — a new `src/forms/form-markers.tsx` holds the context, provider, and a shared `FieldLabelMarkers` fragment used by both label-rendering components. fieldkit adds a pure `resolveMarkerConvention(schema)` in `/schema` and wraps SpecForm's edit paths (and the editor's Build canvas + Try-it) in the provider. Zero fieldkit field-component edits.

**Tech Stack:** React contexts, Chakra v3 `Field.RequiredIndicator`, react-hook-form (existing), Vitest/RTL (jsdom), Storybook.

**Spec:** `docs/superpowers/specs/2026-07-05-marker-convention-design.md` (fieldkit repo)

## Global Constraints

- **Two repos.** Tasks 1–2 run in `~/repo/anker`; Tasks 3–5 run in `~/repo/fieldkit`. **HARD GATE between Task 2 and Task 3:** anker 3.1.0 must be merged, tagged, and published to npm before Task 3 starts (the controller handles merge/tag/release).
- anker ships **3.1.0** (minor; changelog flags the visual change). fieldkit ships **0.3.0** (version bump handled by the controller at release, not in a task).
- Marker resolution order, per value: **explicit prop → context → built-in default** (`showRequiredIndicator: true`, no `optionalText`).
- A field never shows both markers: `*` only when `required`, `optionalText` only when `!required`.
- Non-string (ReactNode) labels bypass `Field.Label` and get **no markers** — documented limitation, do not "fix".
- Convention math (fieldkit): `section` fields excluded; group children recursed AND the group itself counted; **required count > optional count** → `"optional-text"`; ties/empty/otherwise → `"asterisk"`.
- Default marker string is exactly `"(optional)"` (SpecForm + editor defaults). The asterisk is Chakra's `Field.RequiredIndicator` default (`*`).
- fieldkit peerDependencies AND devDependencies: `"@knkcs/anker": "^3.1.0"` (replaces `^2.0.0 || ^3.0.0`).
- SpecForm read mode renders no markers (no `FormField`s there) — must stay untouched.
- All exported React components set `displayName`. Conventional Commits: scope `forms` in anker; `schema`/`renderer`/`editor` in fieldkit.
- Full gates before every commit — anker: `npm run test && npm run typecheck && npm run lint && npm run verify-exports`; fieldkit: `npm run test && npm run typecheck && npm run lint`.

---

### Task 1: anker — form-markers context + FormField integration

**Repo:** `~/repo/anker`

**Files:**
- Create: `src/forms/form-markers.tsx`
- Modify: `src/forms/form-field.tsx` (props interface + destructure + label block)
- Modify: `src/forms/index.ts` (barrel export)
- Test: `src/forms/form-field.markers.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces (relied on by Tasks 2, 4, 5):
  - `interface FormMarkers { optionalText?: React.ReactNode; showRequiredIndicator?: boolean }`
  - `function FormMarkersProvider({ value: FormMarkers, children }): JSX` (public export from `@knkcs/anker/forms`)
  - `function FieldLabelMarkers({ required?, showRequiredIndicator?, optionalText? }): JSX` (module-internal, imported by `form-field.tsx` and `controlled-form-field.tsx` only — NOT in the barrel)
  - `FormFieldProps` gains `optionalText?: React.ReactNode` and `showRequiredIndicator?: boolean` (auto-forwarded by all 13 field wrappers via their existing `...rest` spread — do NOT edit any wrapper).

- [ ] **Step 1: Write the failing tests** — create `src/forms/form-field.markers.test.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { FormField } from "./form-field";
import { FormMarkersProvider } from "./form-markers";
import { InputField } from "./input-field";

function Harness({ children }: { children: ReactElement }) {
	const form = useForm({ defaultValues: { name: "" } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...form}>{children}</FormProvider>
		</ChakraProvider>
	);
}

const input = (field: { value?: unknown }) => (
	<input value={(field.value as string) ?? ""} readOnly />
);

describe("FormField — §10 markers", () => {
	it("renders the required asterisk by default", () => {
		render(
			<Harness>
				<FormField name="name" label="Name" required>
					{input}
				</FormField>
			</Harness>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
	});

	it("renders no asterisk when not required", () => {
		render(
			<Harness>
				<FormField name="name" label="Name">
					{input}
				</FormField>
			</Harness>,
		);
		expect(screen.queryByText("*")).toBeNull();
	});

	it("renders optionalText on a non-required field", () => {
		render(
			<Harness>
				<FormField name="name" label="Name" optionalText="(optional)">
					{input}
				</FormField>
			</Harness>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});

	it("never shows optionalText on a required field (asterisk only)", () => {
		render(
			<Harness>
				<FormField name="name" label="Name" required optionalText="(optional)">
					{input}
				</FormField>
			</Harness>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("suppresses the asterisk with showRequiredIndicator={false}", () => {
		render(
			<Harness>
				<FormField name="name" label="Name" required showRequiredIndicator={false}>
					{input}
				</FormField>
			</Harness>,
		);
		expect(screen.queryByText("*")).toBeNull();
	});

	it("takes form-level defaults from FormMarkersProvider", () => {
		render(
			<Harness>
				<FormMarkersProvider
					value={{ showRequiredIndicator: false, optionalText: "(optional)" }}
				>
					<FormField name="name" label="Required one" required>
						{input}
					</FormField>
					<FormField name="name" label="Optional one">
						{input}
					</FormField>
				</FormMarkersProvider>
			</Harness>,
		);
		expect(screen.queryByText("*")).toBeNull();
		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});

	it("explicit props beat the provider", () => {
		render(
			<Harness>
				<FormMarkersProvider
					value={{ showRequiredIndicator: false, optionalText: "(optional)" }}
				>
					<FormField
						name="name"
						label="Name"
						required
						showRequiredIndicator
					>
						{input}
					</FormField>
					<FormField name="name" label="Other" optionalText="(optioneel)">
						{input}
					</FormField>
				</FormMarkersProvider>
			</Harness>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.getByText("(optioneel)")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("forwards through a field wrapper via rest props (InputField)", () => {
		render(
			<Harness>
				<InputField name="name" label="Name" optionalText="(optional)" />
			</Harness>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/forms/form-field.markers.test.tsx`
Expected: FAIL — `form-markers` module not found / `optionalText` not a prop (required-asterisk test also fails: nothing renders `*` today).

- [ ] **Step 3: Create `src/forms/form-markers.tsx`**

```tsx
import { Field } from "@chakra-ui/react";
import type React from "react";
import { createContext, useContext } from "react";
import { Text } from "../primitives/typography";

/** Form-level defaults for the §10 required/optional label markers. */
export interface FormMarkers {
	/** Appended after the label in muted color when the field is NOT required. */
	optionalText?: React.ReactNode;
	/** When false, suppresses the required asterisk. @default true */
	showRequiredIndicator?: boolean;
}

const FormMarkersContext = createContext<FormMarkers>({});

export interface FormMarkersProviderProps {
	value: FormMarkers;
	children: React.ReactNode;
}

/**
 * Sets form-level marker defaults so a whole form follows ONE §10
 * convention: mostly-required forms pass
 * `{ showRequiredIndicator: false, optionalText: "(optional)" }`;
 * mostly-optional forms need no provider (asterisk is the default).
 * Explicit `FormField` props always win over the provider.
 */
export function FormMarkersProvider({
	value,
	children,
}: FormMarkersProviderProps) {
	return (
		<FormMarkersContext.Provider value={value}>
			{children}
		</FormMarkersContext.Provider>
	);
}
FormMarkersProvider.displayName = "FormMarkersProvider";

export interface FieldLabelMarkersProps extends FormMarkers {
	required?: boolean;
}

/**
 * Internal: the marker fragment rendered inside a string label by
 * FormField and ControlledFormField. Resolution per value:
 * explicit prop → FormMarkersProvider → default (indicator on).
 * Must render inside a Chakra `Field.Root` (the indicator reads its
 * required state from field context).
 */
export function FieldLabelMarkers({
	required,
	showRequiredIndicator,
	optionalText,
}: FieldLabelMarkersProps) {
	const ctx = useContext(FormMarkersContext);
	const show = showRequiredIndicator ?? ctx.showRequiredIndicator ?? true;
	const text = optionalText ?? ctx.optionalText;
	return (
		<>
			{show && <Field.RequiredIndicator />}
			{!required && text != null && (
				<Text as="span" color="muted" fontWeight="normal" ms="1">
					{text}
				</Text>
			)}
		</>
	);
}
FieldLabelMarkers.displayName = "FieldLabelMarkers";
```

Note: `Field.RequiredIndicator` self-hides when the field is not required, so `show &&` is the only gate needed. If anker's `Text` primitive rejects the `as`/`ms` props (typecheck will say), fall back to `import { chakra } from "@chakra-ui/react"` and `<chakra.span color="muted" fontWeight="normal" ms="1">` — keep the styling identical.

- [ ] **Step 4: Integrate into `FormField`** — in `src/forms/form-field.tsx`:

Add to the props interface (after `readOnly?: boolean;`):

```ts
	/** Appended after the label in muted color when the field is NOT required.
	 * Form-level default via `FormMarkersProvider`. */
	optionalText?: React.ReactNode;
	/** When false, suppresses the required asterisk. Form-level default via
	 * `FormMarkersProvider`. @default true */
	showRequiredIndicator?: boolean;
```

Add `optionalText,` and `showRequiredIndicator,` to the destructure (after `readOnly,`). Add the import:

```ts
import { FieldLabelMarkers } from "./form-markers";
```

In the label block, insert the fragment between `{label}` and the dirty dot:

```tsx
									<Field.Label flex="1" htmlFor={name}>
										{label}
										<FieldLabelMarkers
											required={required}
											showRequiredIndicator={showRequiredIndicator}
											optionalText={optionalText}
										/>
										{isDirty && (
```

- [ ] **Step 5: Barrel export** — in `src/forms/index.ts`, directly after the `FormField` export line, add:

```ts
// FormMarkers
export {
	type FormMarkers,
	FormMarkersProvider,
	type FormMarkersProviderProps,
} from "./form-markers";
```

(Do NOT export `FieldLabelMarkers` — it is internal to the two label-rendering components.)

- [ ] **Step 6: GREEN + full gate**

```bash
cd ~/repo/anker
npx vitest run src/forms/form-field.markers.test.tsx
npm run test && npm run typecheck && npm run lint && npm run verify-exports
```
Expected: all pass. If any existing test asserted the absence of an asterisk on required fields, update it to the new default (spec-mandated behavior change) and say so in your report.

- [ ] **Step 7: Commit**

```bash
git add src/forms/
git commit -m "feat(forms): §10 required/optional label markers with form-level context"
```

---

### Task 2: anker — ControlledFormField, story, docs, version 3.1.0

**Repo:** `~/repo/anker`

**Files:**
- Modify: `src/forms/controlled-form-field.tsx`
- Modify: `src/forms/form-field.stories.tsx`
- Modify: `CHANGELOG.md` (new 3.1.0 section at top, below the header block)
- Modify: `CLAUDE-ANKER.md` (FormField documentation)
- Modify: `docs/page-patterns.md` (§10 pointer)
- Modify: `package.json` (version) + `package-lock.json` (sync)
- Test: `src/forms/controlled-form-field.markers.test.tsx` (new)

**Interfaces:**
- Consumes from Task 1: `FieldLabelMarkers`, `FormMarkersProvider` from `./form-markers`.
- Produces: `ControlledFormFieldProps` gains the same `optionalText?: React.ReactNode` / `showRequiredIndicator?: boolean`.

- [ ] **Step 1: Write the failing tests** — create `src/forms/controlled-form-field.markers.test.tsx` (ControlledFormField needs no react-hook-form context):

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ControlledFormField } from "./controlled-form-field";
import { FormMarkersProvider } from "./form-markers";

function wrap(ui: ReactNode) {
	return render(<ChakraProvider value={defaultSystem}>{ui}</ChakraProvider>);
}

describe("ControlledFormField — §10 markers", () => {
	it("renders the required asterisk by default", () => {
		wrap(
			<ControlledFormField name="a" label="Name" required>
				<input id="a" />
			</ControlledFormField>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
	});

	it("renders optionalText on a non-required field", () => {
		wrap(
			<ControlledFormField name="a" label="Name" optionalText="(optional)">
				<input id="a" />
			</ControlledFormField>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});

	it("takes form-level defaults from FormMarkersProvider", () => {
		wrap(
			<FormMarkersProvider
				value={{ showRequiredIndicator: false, optionalText: "(optional)" }}
			>
				<ControlledFormField name="a" label="Required one" required>
					<input id="a" />
				</ControlledFormField>
				<ControlledFormField name="b" label="Optional one">
					<input id="b" />
				</ControlledFormField>
			</FormMarkersProvider>,
		);
		expect(screen.queryByText("*")).toBeNull();
		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/anker && npx vitest run src/forms/controlled-form-field.markers.test.tsx`
Expected: FAIL — `optionalText` not a prop; no asterisk rendered.

- [ ] **Step 3: Integrate into `ControlledFormField`** — in `src/forms/controlled-form-field.tsx`:

Add to `ControlledFormFieldProps` (after `readOnly?: boolean;`):

```ts
	/** Appended after the label in muted color when the field is NOT required.
	 * Form-level default via `FormMarkersProvider`. */
	optionalText?: React.ReactNode;
	/** When false, suppresses the required asterisk. Form-level default via
	 * `FormMarkersProvider`. @default true */
	showRequiredIndicator?: boolean;
```

Add `optionalText,` and `showRequiredIndicator,` to the destructure (after `readOnly,`). Add the import:

```ts
import { FieldLabelMarkers } from "./form-markers";
```

In the label block:

```tsx
						<Field.Label flex="1" htmlFor={name}>
							{label}
							<FieldLabelMarkers
								required={required}
								showRequiredIndicator={showRequiredIndicator}
								optionalText={optionalText}
							/>
						</Field.Label>
```

- [ ] **Step 4: GREEN**

Run: `cd ~/repo/anker && npx vitest run src/forms/controlled-form-field.markers.test.tsx`
Expected: PASS.

- [ ] **Step 5: Storybook story** — in `src/forms/form-field.stories.tsx`:

Change the decorator's `defaultValues` to `{ example: "", other: "" }`. Extend the Chakra import to `import { Input, Stack } from "@chakra-ui/react";` and add `import { FormMarkersProvider } from "./form-markers";`. Append:

```tsx
export const OptionalText: Story = {
	args: {
		name: "example",
		label: "Optional Field",
		optionalText: "(optional)",
		children: (field) => <Input {...field} value={field.value ?? ""} />,
	},
};

/** §10 form-level convention: mostly-required forms mark the optionals
 * instead of showing asterisks — one provider at the form root. */
export const FormLevelConvention: Story = {
	args: {
		name: "example",
		label: "",
		children: () => null,
	},
	render: () => (
		<FormMarkersProvider
			value={{ showRequiredIndicator: false, optionalText: "(optional)" }}
		>
			<Stack gap="5">
				<FormField name="example" label="Required Field" required>
					{(field) => <Input {...field} value={field.value ?? ""} />}
				</FormField>
				<FormField name="other" label="Optional Field">
					{(field) => <Input {...field} value={field.value ?? ""} />}
				</FormField>
			</Stack>
		</FormMarkersProvider>
	),
};
```

(If the `satisfies Meta` typing rejects the dummy `args` on the render-only story, adapt the args to the minimal shape TypeScript accepts — the render function is what matters.)

- [ ] **Step 6: Docs.**

`CHANGELOG.md` — insert directly above the `## 3.0.0 — 2026-07-05` heading:

```md
## 3.1.0 — 2026-07-06

### Added

- **Required/optional label markers** on `FormField` and
  `ControlledFormField` (#146): `required` now renders the `*`
  indicator after string labels; new `optionalText` prop renders a
  muted marker (e.g. `(optional)`) after non-required labels; new
  `showRequiredIndicator` prop (default `true`) suppresses the
  asterisk. New `FormMarkersProvider` sets form-level defaults for
  both, enabling the one-convention-per-form rule from
  `docs/page-patterns.md` §10. Markers apply to string labels only
  (ReactNode labels bypass `Field.Label`, as with the dirty dot).

### Changed

- **Visual change:** required fields now show `*` by default.
  Suppress per field (`showRequiredIndicator={false}`) or per form
  (`FormMarkersProvider`).
```

`CLAUDE-ANKER.md` — find the `FormField` entry (search for `FormField`) and add, alongside its existing prop notes:

```md
- `FormField`/`ControlledFormField` render §10 label markers: `required`
  shows `*` (suppress with `showRequiredIndicator={false}`);
  `optionalText` renders a muted marker after non-required labels.
  `FormMarkersProvider` (from `@knkcs/anker/forms`) sets form-level
  defaults — mostly-required forms use
  `{ showRequiredIndicator: false, optionalText: "(optional)" }`.
  String labels only.
```

`docs/page-patterns.md` — in §10, directly after the "pick one and stick with it" paragraph (ends "…use `*` on the few that are required."), add:

```md
Implemented by `FormField`/`ControlledFormField`: `required` renders the
`*`, `optionalText` renders the muted marker, and `FormMarkersProvider`
sets the form-wide convention (pass
`{ showRequiredIndicator: false, optionalText: "(optional)" }` for
mostly-required forms).
```

- [ ] **Step 7: Version bump**

In `package.json` set `"version": "3.1.0"`, then:

```bash
cd ~/repo/anker && npm install --package-lock-only
```

- [ ] **Step 8: Full gate**

```bash
cd ~/repo/anker
npm run test && npm run typecheck && npm run lint && npm run verify-exports
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/forms/ CHANGELOG.md CLAUDE-ANKER.md docs/page-patterns.md package.json package-lock.json
git commit -m "feat(forms): markers in ControlledFormField; docs and 3.1.0 bump"
```

---

> **HARD GATE — controller work, not a task:** merge the anker branch to
> main, push, tag `v3.1.0` (tag-driven CI publishes to npm), verify
> `npm view @knkcs/anker version` → `3.1.0`. Only then start Task 3.

---

### Task 3: fieldkit — resolveMarkerConvention (pure schema helper)

**Repo:** `~/repo/fieldkit`

**Files:**
- Create: `src/schema/marker-convention.ts`
- Modify: `src/schema/index.ts` (export)
- Test: `src/schema/__tests__/marker-convention.test.ts` (new)

**Interfaces:**
- Consumes: `Field`, `Schema` from `src/schema/types` (`field.config.required: boolean`, `field.field_type: string`, `field.children?: Field[] | null`).
- Produces (relied on by Tasks 4, 5):
  - `export type MarkerConvention = "asterisk" | "optional-text";`
  - `export function resolveMarkerConvention(schema: Schema): MarkerConvention`

- [ ] **Step 1: Write the failing tests** — create `src/schema/__tests__/marker-convention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveMarkerConvention } from "../marker-convention";
import type { Field } from "../types";

function f(
	required: boolean,
	overrides: Partial<Field> = {},
	accessor = `f_${Math.trunc(Math.random() * 1e9)}`,
): Field {
	return {
		field_type: "text",
		config: { name: accessor, api_accessor: accessor, required, instructions: "" },
		settings: null,
		system: false,
		...overrides,
	};
}

describe("resolveMarkerConvention", () => {
	it("returns asterisk for an empty schema", () => {
		expect(resolveMarkerConvention([])).toBe("asterisk");
	});

	it("returns optional-text when required fields are the strict majority", () => {
		expect(resolveMarkerConvention([f(true), f(true), f(false)])).toBe(
			"optional-text",
		);
	});

	it("returns asterisk when optional fields are the majority", () => {
		expect(resolveMarkerConvention([f(true), f(false), f(false)])).toBe(
			"asterisk",
		);
	});

	it("returns asterisk on a tie", () => {
		expect(resolveMarkerConvention([f(true), f(false)])).toBe("asterisk");
	});

	it("excludes section fields from the count", () => {
		const section = f(false, { field_type: "section" });
		// Without the exclusion this would be 2 required vs 2 optional = tie.
		expect(
			resolveMarkerConvention([section, f(true), f(true), f(false)]),
		).toBe("optional-text");
	});

	it("recurses into group children and counts the group itself", () => {
		const group = f(false, {
			field_type: "group",
			children: [f(true), f(true), f(true)],
		});
		// group (optional) + 3 required children → 3 vs 1 → optional-text.
		expect(resolveMarkerConvention([group])).toBe("optional-text");
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/schema/__tests__/marker-convention.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/schema/marker-convention.ts`**

```ts
// src/schema/marker-convention.ts
import type { Field, Schema } from "./types";

export type MarkerConvention = "asterisk" | "optional-text";

/**
 * §10 (anker page-patterns): one marker convention per form. Forms with
 * mostly-required fields mark the optionals ("optional-text"); forms
 * with mostly-optional fields mark the required ones ("asterisk").
 *
 * Counts input fields only: `section` markers are excluded; group
 * children are recursed into (same traversal contract as validateSpec)
 * and the group field itself is counted — it renders a label too.
 * A STRICT majority of required fields (required > optional) selects
 * "optional-text"; ties, empty schemas, and required-minorities select
 * "asterisk" (the conventional default).
 */
export function resolveMarkerConvention(schema: Schema): MarkerConvention {
	const { required, optional } = countFields(schema);
	return required > optional ? "optional-text" : "asterisk";
}

function countFields(fields: Field[]): { required: number; optional: number } {
	let required = 0;
	let optional = 0;
	for (const field of fields) {
		if (field.field_type === "section") continue;
		if (field.config.required) required++;
		else optional++;
		if (field.children && field.children.length > 0) {
			const child = countFields(field.children);
			required += child.required;
			optional += child.optional;
		}
	}
	return { required, optional };
}
```

- [ ] **Step 4: Export** — in `src/schema/index.ts`, alongside the existing partition exports, add:

```ts
export {
	type MarkerConvention,
	resolveMarkerConvention,
} from "./marker-convention";
```

- [ ] **Step 5: GREEN + full gate**

```bash
cd ~/repo/fieldkit
npx vitest run src/schema/__tests__/marker-convention.test.ts
npm run test && npm run typecheck && npm run lint
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/schema/
git commit -m "feat(schema): resolveMarkerConvention for the §10 marker convention"
```

---

### Task 4: fieldkit — anker ^3.1.0 + SpecForm convention

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `package.json` + `package-lock.json` (anker `^3.1.0` in BOTH peerDependencies and devDependencies)
- Modify: `src/renderer/spec-form/spec-form.tsx`
- Modify: `src/renderer/spec-form/spec-form.mdx`
- Modify: `CLAUDE.md` (peer-deps line)
- Test: `src/renderer/spec-form/__tests__/marker-convention.test.tsx` (new)

**Interfaces:**
- Consumes: `resolveMarkerConvention`, `MarkerConvention` from `../../schema/marker-convention` (Task 3); `FormMarkersProvider`, `FormMarkers` from `@knkcs/anker/forms` (Task 1, via npm 3.1.0).
- Produces (relied on by Task 5): `SpecFormLabels` gains `optionalMarker?: string`; `DEFAULT_LABELS.optionalMarker === "(optional)"`.

- [ ] **Step 1: Bump anker**

In `package.json` set `"@knkcs/anker": "^3.1.0"` in **peerDependencies** (replacing `"^2.0.0 || ^3.0.0"`) and in **devDependencies**. Then:

```bash
cd ~/repo/fieldkit && npm install
npm ls @knkcs/anker   # expect 3.1.x
```

Also update `CLAUDE.md`'s Peer Dependencies section line to `@knkcs/anker ^3.1.0`.

- [ ] **Step 2: Write the failing tests** — create `src/renderer/spec-form/__tests__/marker-convention.test.tsx`. The standard `Wrapper`/`testPlugins` harness stubs field components WITHOUT anker `FormField`s, so markers never render through it — this file registers the real built-in plugins instead:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field, Schema } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

function textField(accessor: string, required: boolean): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function RealWrapper({ children }: { children: ReactNode }) {
	const methods = useForm({ defaultValues: { a: "", b: "", c: "" } });
	return (
		<ChakraProvider value={defaultSystem}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={builtInFieldTypes}>
					{children}
				</FieldKitProvider>
			</FormProvider>
		</ChakraProvider>
	);
}

const mostlyRequired: Schema = [
	textField("a", true),
	textField("b", true),
	textField("c", false),
];
const mostlyOptional: Schema = [
	textField("a", true),
	textField("b", false),
	textField("c", false),
];

describe("SpecForm — §10 marker convention", () => {
	it("mostly-required: marks optionals, suppresses all asterisks", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyRequired} />
			</RealWrapper>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("mostly-optional: asterisk on the required field, no optional marker", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyOptional} />
			</RealWrapper>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("labels.optionalMarker overrides the marker text", () => {
		render(
			<RealWrapper>
				<SpecForm
					schema={mostlyRequired}
					labels={{ optionalMarker: "(optioneel)" }}
				/>
			</RealWrapper>,
		);
		expect(screen.getByText("(optioneel)")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("read mode renders no markers", () => {
		render(
			<RealWrapper>
				<SpecForm schema={mostlyRequired} mode="read" values={{}} />
			</RealWrapper>,
		);
		expect(screen.queryByText("(optional)")).toBeNull();
		expect(screen.queryByText("*")).toBeNull();
	});
});
```

- [ ] **Step 3: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/__tests__/marker-convention.test.tsx`
Expected: the mostly-required and override tests FAIL (no provider yet → asterisks render, no `(optional)`); the mostly-optional test may already pass (anker 3.1.0's default asterisk) — that is fine.

- [ ] **Step 4: Implement in `src/renderer/spec-form/spec-form.tsx`**

Imports:

```ts
import { type FormMarkers, FormMarkersProvider } from "@knkcs/anker/forms";
import { resolveMarkerConvention } from "../../schema/marker-convention";
```

(Adjust the anker import to merge with any existing `@knkcs/anker/forms` import in the file.)

`SpecFormLabels` + defaults:

```ts
export interface SpecFormLabels {
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
	/** §10 optional marker shown after non-required labels when the form
	 * is mostly required. */
	optionalMarker?: string;
}

export const DEFAULT_LABELS: Required<SpecFormLabels> = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
	optionalMarker: "(optional)",
};
```

In `SpecForm`, after the `partition` memo (before the `loading` early return — hooks must stay unconditional):

```ts
	const convention = useMemo(() => resolveMarkerConvention(schema), [schema]);
	// Memoized so the context value doesn't change identity every render
	// (a fresh object each render would re-render every FormField subtree).
	const markers = useMemo<FormMarkers>(
		() =>
			convention === "optional-text"
				? {
						showRequiredIndicator: false,
						optionalText: resolvedLabels.optionalMarker,
					}
				: {},
		[convention, resolvedLabels.optionalMarker],
	);
```

Wrap BOTH edit-mode returns (read mode and loading stay untouched):

```tsx
	if (!partition.hasSections) {
		return (
			<FormMarkersProvider value={markers}>
				<FieldRenderer schema={partition.tabs[0].fields} readOnly={readOnly} />
			</FormMarkersProvider>
		);
	}

	return (
		<FormMarkersProvider value={markers}>
			<SpecFormTabs
				partition={partition}
				readOnly={readOnly}
				labels={resolvedLabels}
			/>
		</FormMarkersProvider>
	);
```

- [ ] **Step 5: GREEN**

Run: `cd ~/repo/fieldkit && npx vitest run src/renderer/spec-form/`
Expected: PASS (including all pre-existing spec-form tests — the stub `TestField` plugins render no `FormField`, so they cannot be affected by markers).

- [ ] **Step 6: Docs** — in `src/renderer/spec-form/spec-form.mdx`:

1. Add to the labels table: `optionalMarker` | `"(optional)"` | §10 marker shown after non-required labels when the form is mostly required.
2. Add a short "Marker convention" section near the labels docs:

```md
## Marker convention

SpecForm applies anker's §10 rule automatically — one convention per
form, chosen from the schema: when required fields are the strict
majority, optional fields get the muted `optionalMarker` and asterisks
are suppressed; otherwise required fields get the standard `*`. Group
children count toward the majority; section markers don't. Read mode
shows no markers. Standalone `FieldRenderer` (outside SpecForm) falls
back to anker's default (asterisks on required fields).
```

3. Delete the Known Limitations bullet about the missing marker convention ("No required/optional marker convention beyond the asterisk…"). If the Known Limitations section becomes empty, remove the section heading too.

- [ ] **Step 7: Full gate**

```bash
cd ~/repo/fieldkit
npm run test && npm run typecheck && npm run lint
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json CLAUDE.md src/renderer/spec-form/
git commit -m "feat(renderer): SpecForm auto-applies the §10 marker convention"
```

---

### Task 5: fieldkit — editor WYSIWYG markers (Build canvas + Try-it)

**Repo:** `~/repo/fieldkit`

**Files:**
- Modify: `src/editor/spec-editor.tsx` (EditorLabels + defaults + TryItView pass-through)
- Modify: `src/editor/try-it-view.tsx` (labels type + SpecForm pass-through)
- Modify: `src/editor/editor-canvas.tsx` (CanvasLabels + provider around the three FormProvider bodies)
- Modify: `src/editor/spec-editor.mdx` (labels table row)
- Test: `src/editor/__tests__/canvas-markers.test.tsx` (new)

**Interfaces:**
- Consumes: `resolveMarkerConvention` from `../schema/marker-convention` (Task 3); `FormMarkersProvider`, `FormMarkers` from `@knkcs/anker/forms`; `SpecFormLabels.optionalMarker` (Task 4).
- Produces: `EditorLabels.optionalMarker?: string` (default `"(optional)"`); `CanvasLabels.optionalMarker?: string` (optional, like the type-picker keys); `TryItViewProps.labels.optionalMarker?: string`.

- [ ] **Step 1: Write the failing tests** — create `src/editor/__tests__/canvas-markers.test.tsx`. Like Task 4, this needs REAL built-in plugins (the editor test helpers stub field components without `FormField`s). The live flip on required-toggle is runtime-verified in Storybook (see the end of this plan); jsdom covers the derivation statically for both conventions:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field, Schema } from "../../schema/types";
import { FieldKitProvider } from "../../renderer/provider";
import { SpecEditor } from "../spec-editor";
import { TryItView } from "../try-it-view";

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

function textField(accessor: string, required: boolean): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function Wrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={builtInFieldTypes}>
				{children}
			</FieldKitProvider>
		</ChakraProvider>
	);
}

const mostlyRequired: Schema = [
	textField("a", true),
	textField("b", true),
	textField("c", false),
];
const mostlyOptional: Schema = [
	textField("a", true),
	textField("b", false),
	textField("c", false),
];

describe("EditorCanvas — §10 markers (WYSIWYG)", () => {
	it("mostly-required draft: canvas previews show the optional marker, no asterisks", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={mostlyRequired}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("mostly-optional draft: canvas previews show the asterisk", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={mostlyOptional}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});
});

describe("TryItView — §10 markers", () => {
	const tryItLabels = {
		testSubmit: "Test submit",
		testSubmitSuccess: "OK",
	};

	it("applies the convention through the real SpecForm", () => {
		render(
			<Wrap>
				<TryItView
					schema={mostlyRequired}
					plugins={builtInFieldTypes}
					labels={tryItLabels}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("forwards a custom optionalMarker to SpecForm", () => {
		render(
			<Wrap>
				<TryItView
					schema={mostlyRequired}
					plugins={builtInFieldTypes}
					labels={{ ...tryItLabels, optionalMarker: "(optioneel)" }}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optioneel)")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: RED**

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/__tests__/canvas-markers.test.tsx`
Expected: FAIL — canvas shows asterisks in mostly-required mode (no provider yet); `optionalMarker` not a TryItView label; TryItView convention test PASSES already if Task 4 landed (SpecForm applies it) — only the custom-marker forwarding fails there.

- [ ] **Step 3: Labels plumbing.**

`src/editor/spec-editor.tsx`:
- `EditorLabels` gains (near the other renderer pass-through keys `defaultTab`/`searchPlaceholder`/`noResults`):

```ts
	/** §10 optional marker for canvas previews and Try-it (pass-through to
	 * SpecForm's `optionalMarker`). */
	optionalMarker?: string;
```

- `DEFAULT_EDITOR_LABELS` gains `optionalMarker: "(optional)",`.
- The `<TryItView ... labels={{ ... }}>` object gains `optionalMarker: mergedLabels.optionalMarker,`.
- The `<EditorCanvas ... labels=...>` call already passes the merged labels object; no change needed there beyond the CanvasLabels type below.

`src/editor/try-it-view.tsx`:
- `TryItViewProps["labels"]` gains `optionalMarker?: string;` (with the other SpecForm pass-through keys).
- The `<SpecForm labels={{ ... }}>` object gains `optionalMarker: labels.optionalMarker,`.

`src/editor/editor-canvas.tsx`:
- `CanvasLabels` — add to the OPTIONAL trailing block (beside the type-picker keys, NOT the `Required<EditorLabels>` Pick, so hand-rolled test fixtures stay valid):

```ts
	/** §10 optional marker for canvas previews; falls back to "(optional)". */
	optionalMarker?: string;
```

- [ ] **Step 4: Canvas provider.** In `src/editor/editor-canvas.tsx`:

Imports:

```ts
import { type FormMarkers, FormMarkersProvider } from "@knkcs/anker/forms";
import { resolveMarkerConvention } from "../schema/marker-convention";
```

After `const methods = useForm({ defaultValues: defaults });`:

```ts
	const markerConvention = useMemo(
		() => resolveMarkerConvention(spec.draft),
		[spec.draft],
	);
	// Memoized so the context value doesn't change identity every render.
	const markers = useMemo<FormMarkers>(
		() =>
			markerConvention === "optional-text"
				? {
						showRequiredIndicator: false,
						optionalText: labels.optionalMarker ?? "(optional)",
					}
				: {},
		[markerConvention, labels.optionalMarker],
	);
```

Wrap the children of ALL THREE `<FormProvider {...methods}>` blocks (empty-canvas, no-sections, sectioned) in `<FormMarkersProvider value={markers}>…</FormMarkersProvider>`, e.g.:

```tsx
		return (
			<FormProvider {...methods}>
				<FormMarkersProvider value={markers}>
					<Box data-testid="editor-canvas-empty" p="6" textAlign="center">
						...
					</Box>
				</FormMarkersProvider>
			</FormProvider>
		);
```

(The empty-canvas branch renders no field previews, but wrapping all three keeps the provider invariant unconditional.)

- [ ] **Step 5: GREEN**

Run: `cd ~/repo/fieldkit && npx vitest run src/editor/`
Expected: PASS, including all pre-existing editor tests (their stub plugins render no `FormField`s, so markers cannot affect them).

- [ ] **Step 6: Docs** — `src/editor/spec-editor.mdx`: add the labels-table row `optionalMarker` | `"(optional)"` | §10 optional marker in canvas previews and Try-it (pass-through to SpecForm). Mention in the Build-mode section that previews follow the same marker convention the rendered form will use, derived live from the draft.

- [ ] **Step 7: Full gate**

```bash
cd ~/repo/fieldkit
npm run test && npm run typecheck && npm run lint
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/editor/
git commit -m "feat(editor): canvas and Try-it previews follow the §10 marker convention"
```

---

## Runtime verification (controller, after Task 5)

Storybook (`npm run dev`, port 6007) via Playwright:

1. SpecForm story with a mostly-required schema → optional field labels show muted `(optional)`, no `*` anywhere.
2. Mostly-optional schema → required labels show `*`, no `(optional)`.
3. SpecEditor Build canvas → same markers as the form; open a field's config panel and toggle Required until the majority flips → every preview's markers flip live (asterisks ↔ optional markers).
4. anker Storybook (`~/repo/anker`): `Forms/FormField` `Required` story shows the new default asterisk; `FormLevelConvention` story shows the suppressed-asterisk + `(optional)` pairing.

## Release sequencing (controller)

- After Task 2: merge → tag `v3.1.0` in anker → CI publishes → verify npm. Comment on and close anker#146 from the release.
- After Task 5 + final review: merge fieldkit → bump `0.3.0` (`chore: v0.3.0` + `npm install --package-lock-only`) → tag `v0.3.0` → CI publishes → GH release notes link the anker 3.1.0 pairing.
