# Per-Field Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Storybook stories (CSF3) and MDX documentation for all 24 fieldkit field types.

**Architecture:** Each field type gets a `.stories.tsx` and `.mdx` file in `src/renderer/fields/`. A shared `FieldStoryWrapper` eliminates FormProvider/FieldKitProvider boilerplate. Stories provide interactive demos; MDX provides prose reference with settings tables, Zod output, and known limitations.

**Tech Stack:** Storybook 8, @storybook/react-vite, CSF3, MDX, React, TypeScript

---

## Chunk 1: Setup

### Task 1: Update `.storybook/main.ts` to add MDX glob

- [ ] **Step 1: Edit `.storybook/main.ts`**

Update the `stories` array to include MDX files alongside TypeScript stories.

**File: `.storybook/main.ts`**
```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
	addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	typescript: {
		reactDocgen: "react-docgen-typescript",
	},
};

export default config;
```

---

### Task 2: Create `src/renderer/fields/__stories__/field-story-wrapper.tsx`

- [ ] **Step 1: Create the shared wrapper component**

This wrapper eliminates all `FormProvider` / `FieldKitProvider` / `zodResolver` boilerplate from individual story files. Every field story will import and render this component.

**File: `src/renderer/fields/__stories__/field-story-wrapper.tsx`**
```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import type { FieldKitAdapters } from "../../adapters";
import { FieldRenderer } from "../../field-renderer";
import { FieldKitProvider } from "../../provider";

export interface FieldStoryWrapperProps {
	fields: Field[];
	defaultValues?: Record<string, unknown>;
	readOnly?: boolean;
	adapters?: Partial<FieldKitAdapters>;
}

export function FieldStoryWrapper({
	fields,
	defaultValues,
	readOnly,
	adapters,
}: FieldStoryWrapperProps) {
	const [submittedValues, setSubmittedValues] = useState<Record<
		string,
		unknown
	> | null>(null);

	const schema = specToZodSchema(fields, builtInFieldTypes);
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaultValues ?? {},
		mode: "onBlur",
	});

	return (
		<FieldKitProvider
			plugins={builtInFieldTypes}
			adapters={adapters as FieldKitAdapters | undefined}
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit((data) => {
						setSubmittedValues(data);
					})}
				>
					<FieldRenderer schema={fields} readOnly={readOnly} />
					{!readOnly && (
						<button type="submit" style={{ marginTop: 16 }}>
							Submit
						</button>
					)}
				</form>
			</FormProvider>
			{submittedValues && (
				<pre
					style={{
						marginTop: 16,
						padding: 12,
						background: "#f5f5f5",
						borderRadius: 4,
						fontSize: 13,
						overflowX: "auto",
					}}
				>
					{JSON.stringify(submittedValues, null, 2)}
				</pre>
			)}
		</FieldKitProvider>
	);
}
FieldStoryWrapper.displayName = "FieldStoryWrapper";
```

---

## Chunk 2: Simple Text Fields (text, textarea, number, boolean, color)

### Task 3: Text field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/text-field.stories.tsx`**

**File: `src/renderer/fields/text-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTextField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "Enter a title for this entry",
	},
	settings: {
		placeholder: "e.g. My First Post",
	},
	children: null,
	system: false,
};

const prependAppendField: Field = {
	field_type: "text",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "Enter the domain name",
	},
	settings: {
		prepend: "https://",
		append: ".com",
		placeholder: "example",
	},
	children: null,
	system: false,
};

const validationField: Field = {
	field_type: "text",
	config: {
		name: "Username",
		api_accessor: "username",
		required: true,
		instructions: "3-20 characters, letters and numbers only",
	},
	validation: {
		min_length: 3,
		max_length: 20,
		pattern: "^[a-zA-Z0-9]+$",
		pattern_message: "Only letters and numbers are allowed",
	},
	settings: {
		placeholder: "johndoe",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Text",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTextField]}
			defaultValues={{ title: "" }}
		/>
	),
};

export const WithPrependAppend: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[prependAppendField]}
			defaultValues={{ website: "" }}
		/>
	),
};

export const WithValidation: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[validationField]}
			defaultValues={{ username: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ title: "Read-only value" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/text-field.mdx`**

**File: `src/renderer/fields/text-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./text-field.stories";

<Meta of={Stories} />

# Text

A single line of text input. The most common field type for short-form content such as titles, names, and labels.

## When to Use

Use **Text** for short, single-line values. For multi-line content, use [Textarea](?path=/docs/fields-textarea--docs). For formatted content, use [Markdown](?path=/docs/fields-markdown--docs) or [Rich Text](?path=/docs/fields-rich-text--docs).

## Settings

| Setting       | Type     | Default | Description                                    |
|---------------|----------|---------|------------------------------------------------|
| `placeholder` | `string` | `""`    | Placeholder text shown when the field is empty  |
| `prepend`     | `string` | —       | Text or icon displayed before the input          |
| `append`      | `string` | —       | Text or icon displayed after the input           |

## Validation

| Rule         | Type     | Description                                               |
|--------------|----------|-----------------------------------------------------------|
| `required`   | `boolean`| When true, the field must have at least 1 character        |
| `min_length` | `number` | Minimum number of characters                               |
| `max_length` | `number` | Maximum number of characters (validated on submit, not input) |
| `pattern`    | `string` | Regex pattern the value must match                         |
| `pattern_message` | `string` | Custom error message when pattern fails              |

## Zod Output

```ts
// Required
z.string().min(1, "Title is required")

// Optional
z.string().optional()

// With validation
z.string()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9]+$/, "Only letters and numbers are allowed")
```

## Table Cell

Renders the raw string value via `TextCell`. No truncation or formatting applied.

## Known Limitations

- No `maxLength` HTML attribute — Zod catches on submit, not during input
- TextCell doesn't truncate (no `text-overflow: ellipsis`)

## Examples

### Default

<Canvas of={Stories.Default} />

### With Prepend / Append

<Canvas of={Stories.WithPrependAppend} />

### With Validation

Submit with fewer than 3 characters or special characters to see validation errors.

<Canvas of={Stories.WithValidation} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 4: Textarea field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/textarea-field.stories.tsx`**

**File: `src/renderer/fields/textarea-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTextareaField: Field = {
	field_type: "textarea",
	config: {
		name: "Description",
		api_accessor: "description",
		required: false,
		instructions: "Enter a description",
	},
	settings: {
		placeholder: "Write something...",
	},
	children: null,
	system: false,
};

const customRowsField: Field = {
	field_type: "textarea",
	config: {
		name: "Long Description",
		api_accessor: "long_description",
		required: false,
		instructions: "This textarea has 8 rows",
	},
	settings: {
		placeholder: "Write a detailed description...",
		rows: 8,
	},
	children: null,
	system: false,
};

const maxLengthField: Field = {
	field_type: "textarea",
	config: {
		name: "Summary",
		api_accessor: "summary",
		required: true,
		instructions: "Max 200 characters",
	},
	validation: {
		max_length: 200,
	},
	settings: {
		placeholder: "Brief summary...",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "textarea",
	config: {
		name: "Description",
		api_accessor: "description",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Textarea",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTextareaField]}
			defaultValues={{ description: "" }}
		/>
	),
};

export const CustomRows: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[customRowsField]}
			defaultValues={{ long_description: "" }}
		/>
	),
};

export const WithMaxLength: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[maxLengthField]}
			defaultValues={{ summary: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ description: "This is a read-only textarea value.\n\nIt spans multiple lines." }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/textarea-field.mdx`**

**File: `src/renderer/fields/textarea-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./textarea-field.stories";

<Meta of={Stories} />

# Textarea

Multiple lines of plain text. Used for descriptions, notes, and other longer-form content that does not require formatting.

## When to Use

Use **Textarea** when you need multi-line plain text input. For single-line values, use [Text](?path=/docs/fields-text--docs). For formatted multi-line content, use [Markdown](?path=/docs/fields-markdown--docs) or [Rich Text](?path=/docs/fields-rich-text--docs).

## Settings

| Setting       | Type     | Default | Description                                    |
|---------------|----------|---------|------------------------------------------------|
| `placeholder` | `string` | `""`    | Placeholder text shown when the field is empty  |
| `rows`        | `number` | `4`     | Number of visible text rows                      |

## Validation

| Rule         | Type     | Description                                               |
|--------------|----------|-----------------------------------------------------------|
| `required`   | `boolean`| When true, the field must have at least 1 character        |
| `min_length` | `number` | Minimum number of characters                               |
| `max_length` | `number` | Maximum number of characters (validated on submit, not input) |

## Zod Output

```ts
// Required
z.string().min(1, "Description is required")

// Optional
z.string().optional()

// With max length
z.string().min(1, "Summary is required").max(200)
```

## Table Cell

Renders the raw string value via `TextareaCell`. No truncation or formatting applied.

## Known Limitations

- No `pattern` validation (unlike text)
- No auto-resize / resize setting

## Examples

### Default

<Canvas of={Stories.Default} />

### Custom Rows

A textarea configured with 8 rows for longer content.

<Canvas of={Stories.CustomRows} />

### With Max Length

Submit with more than 200 characters to see the validation error.

<Canvas of={Stories.WithMaxLength} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 5: Number field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/number-field.stories.tsx`**

**File: `src/renderer/fields/number-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultNumberField: Field = {
	field_type: "number",
	config: {
		name: "Quantity",
		api_accessor: "quantity",
		required: false,
		instructions: "Enter a quantity",
	},
	settings: null,
	children: null,
	system: false,
};

const minMaxField: Field = {
	field_type: "number",
	config: {
		name: "Age",
		api_accessor: "age",
		required: true,
		instructions: "Must be between 0 and 150",
	},
	settings: {
		min: 0,
		max: 150,
	},
	children: null,
	system: false,
};

const stepField: Field = {
	field_type: "number",
	config: {
		name: "Price",
		api_accessor: "price",
		required: false,
		instructions: "Enter price in EUR",
	},
	settings: {
		min: 0,
		step: 0.01,
		prepend: "EUR",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "number",
	config: {
		name: "Quantity",
		api_accessor: "quantity",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Number",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultNumberField]}
			defaultValues={{ quantity: 0 }}
		/>
	),
};

export const WithMinMax: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[minMaxField]}
			defaultValues={{ age: 25 }}
		/>
	),
};

export const WithStep: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[stepField]}
			defaultValues={{ price: 9.99 }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ quantity: 42 }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/number-field.mdx`**

**File: `src/renderer/fields/number-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./number-field.stories";

<Meta of={Stories} />

# Number

A numeric input field. Supports minimum/maximum bounds, step increments, and optional prepend/append labels.

## When to Use

Use **Number** for any numeric value (integers or decimals). For currency, set `step: 0.01` and use `prepend` or `append` for the currency symbol.

## Settings

| Setting   | Type     | Default | Description                                    |
|-----------|----------|---------|------------------------------------------------|
| `min`     | `number` | —       | Minimum allowed value                            |
| `max`     | `number` | —       | Maximum allowed value                            |
| `step`    | `number` | —       | Step increment for the input spinner             |
| `prepend` | `string` | —       | Text displayed before the input                  |
| `append`  | `string` | —       | Text displayed after the input                   |

## Validation

`min` and `max` from settings are applied as Zod constraints. There is no separate validation object for number fields — bounds are inferred from settings.

| Rule       | Source   | Description                                     |
|------------|----------|-------------------------------------------------|
| `min`      | settings | Minimum value (`z.number().min(...)`)             |
| `max`      | settings | Maximum value (`z.number().max(...)`)             |

## Zod Output

```ts
// No constraints
z.number().optional()

// With min/max
z.number().min(0).max(150)

// Required field — note: required is NOT checked in Zod for numbers
z.number().min(0).max(150)
```

## Table Cell

Renders the numeric value via `NumberCell`. No formatting (no thousand separators, no currency symbols).

## Known Limitations

- `required` not checked in Zod schema — a number field marked `required` has no `.min(1)` or similar check
- `prepend`/`append` settings are defined in the schema but not passed to the `NumberField` component
- No integer vs decimal distinction
- `step` is not validated in Zod (UI-only constraint on the spinner)

## Examples

### Default

<Canvas of={Stories.Default} />

### With Min / Max

The field value is constrained between 0 and 150. Submit an out-of-range value to see validation.

<Canvas of={Stories.WithMinMax} />

### With Step

Price field with `step: 0.01` and a `prepend` label. Note that `prepend` is defined in settings but not passed through to the component.

<Canvas of={Stories.WithStep} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 6: Boolean field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/boolean-field.stories.tsx`**

**File: `src/renderer/fields/boolean-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const booleanField: Field = {
	field_type: "boolean",
	config: {
		name: "Published",
		api_accessor: "published",
		required: false,
		instructions: "Toggle to publish this entry",
	},
	settings: null,
	children: null,
	system: false,
};

const withHelperTextField: Field = {
	field_type: "boolean",
	config: {
		name: "Send Notifications",
		api_accessor: "send_notifications",
		required: false,
		instructions: "When enabled, subscribers will receive an email notification when this entry is published.",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "boolean",
	config: {
		name: "Published",
		api_accessor: "published",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Boolean",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultOff: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[booleanField]}
			defaultValues={{ published: false }}
		/>
	),
};

export const DefaultOn: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[booleanField]}
			defaultValues={{ published: true }}
		/>
	),
};

export const WithHelperText: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withHelperTextField]}
			defaultValues={{ send_notifications: false }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ published: true }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/boolean-field.mdx`**

**File: `src/renderer/fields/boolean-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./boolean-field.stories";

<Meta of={Stories} />

# Boolean

A true/false toggle rendered as a switch. Used for binary settings such as "Published", "Active", or "Featured".

## When to Use

Use **Boolean** for any on/off, yes/no, or true/false value. For selecting from a set of options, use [Select](?path=/docs/fields-select--docs), [Radio](?path=/docs/fields-radio--docs), or [Checkboxes](?path=/docs/fields-checkboxes--docs).

## Settings

This field type has no configurable settings.

## Validation

The Zod schema is always `z.boolean()`. There is no `required` validation — a boolean always has a value (`true` or `false`).

## Zod Output

```ts
// Always
z.boolean().optional()
```

## Table Cell

Renders "Yes" or "No" via `BooleanCell`.

## Known Limitations

- Hardcoded "Yes"/"No" cell text (no custom labels, no icons)
- No explicit `defaultValue` setting — consumers must set the default via `defaultValues` on the form

## Examples

### Default Off

<Canvas of={Stories.DefaultOff} />

### Default On

<Canvas of={Stories.DefaultOn} />

### With Helper Text

The `instructions` field config is used to provide additional context below the toggle.

<Canvas of={Stories.WithHelperText} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 7: Color field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/color-field.stories.tsx`**

**File: `src/renderer/fields/color-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultColorField: Field = {
	field_type: "color",
	config: {
		name: "Brand Color",
		api_accessor: "brand_color",
		required: false,
		instructions: "Pick a brand color",
	},
	settings: {
		default_color: "#3B82F6",
	},
	children: null,
	system: false,
};

const requiredColorField: Field = {
	field_type: "color",
	config: {
		name: "Primary Color",
		api_accessor: "primary_color",
		required: true,
		instructions: "A primary color is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "color",
	config: {
		name: "Brand Color",
		api_accessor: "brand_color",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Color",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultColorField]}
			defaultValues={{ brand_color: "#3B82F6" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredColorField]}
			defaultValues={{ primary_color: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ brand_color: "#10B981" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/color-field.mdx`**

**File: `src/renderer/fields/color-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./color-field.stories";

<Meta of={Stories} />

# Color

A color picker field. Allows users to select a color value via a visual picker or hex input.

## When to Use

Use **Color** when you need a hex color value, such as brand colors, theme accents, or category colors.

## Settings

| Setting         | Type     | Default     | Description                                    |
|-----------------|----------|-------------|------------------------------------------------|
| `default_color` | `string` | `"#000000"` | Default color value (currently unused by the component) |

## Validation

| Rule       | Type     | Description                                     |
|------------|----------|-------------------------------------------------|
| `required` | `boolean`| When true, the string must have at least 1 character |

## Zod Output

```ts
// Required
z.string().min(1, "Primary Color is required")

// Optional
z.string().optional()
```

## Table Cell

Renders a color swatch next to the hex value via `ColorCell`.

## Known Limitations

- `default_color` setting is defined but unused by the component — it does not pre-fill the picker
- No hex format validation in Zod (accepts any string, not just valid hex colors)
- Plugin category is `"text"` instead of a dedicated `"color"` category

## Examples

### Default

<Canvas of={Stories.Default} />

### Required

Submit without selecting a color to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Chunk 2 Commit

- [ ] **Step: Commit all Chunk 1 and Chunk 2 files**

```bash
git add \
  .storybook/main.ts \
  src/renderer/fields/__stories__/field-story-wrapper.tsx \
  src/renderer/fields/text-field.stories.tsx \
  src/renderer/fields/text-field.mdx \
  src/renderer/fields/textarea-field.stories.tsx \
  src/renderer/fields/textarea-field.mdx \
  src/renderer/fields/number-field.stories.tsx \
  src/renderer/fields/number-field.mdx \
  src/renderer/fields/boolean-field.stories.tsx \
  src/renderer/fields/boolean-field.mdx \
  src/renderer/fields/color-field.stories.tsx \
  src/renderer/fields/color-field.mdx

git commit -m "docs(renderer): add stories and MDX for text, textarea, number, boolean, color field types"
```

## Chunk 3: Specialized Text Fields (email, url, time, date, slug)

### Task 8: Email field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/email-field.stories.tsx`**

**File: `src/renderer/fields/email-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultEmailField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: false,
		instructions: "Enter your email address",
	},
	settings: {
		placeholder: "you@example.com",
	},
	children: null,
	system: false,
};

const requiredEmailField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: true,
		instructions: "A valid email address is required",
	},
	settings: {
		placeholder: "you@example.com",
	},
	children: null,
	system: false,
};

const optionalEmailField: Field = {
	field_type: "email",
	config: {
		name: "Secondary Email",
		api_accessor: "secondary_email",
		required: false,
		instructions: "Optional backup email",
	},
	settings: {
		placeholder: "backup@example.com",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "email",
	config: {
		name: "Email",
		api_accessor: "email",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Email",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultEmailField]}
			defaultValues={{ email: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredEmailField]}
			defaultValues={{ email: "" }}
		/>
	),
};

export const Optional: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[optionalEmailField]}
			defaultValues={{ secondary_email: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ email: "user@example.com" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/email-field.mdx`**

**File: `src/renderer/fields/email-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./email-field.stories";

<Meta of={Stories} />

# Email

An email address input. Uses the browser's native `type="email"` and Zod's `.email()` validator for format checking.

## When to Use

Use **Email** for email address values. For generic short text, use [Text](?path=/docs/fields-text--docs). For URLs, use [URL](?path=/docs/fields-url--docs).

## Settings

| Setting       | Type     | Default | Description                                    |
|---------------|----------|---------|------------------------------------------------|
| `placeholder` | `string` | `""`    | Placeholder text shown when the field is empty  |

## Validation

| Rule       | Type     | Description                                                     |
|------------|----------|-----------------------------------------------------------------|
| `required` | `boolean`| When true, the field must contain a valid email address          |

When optional, an empty string is also accepted (via `z.literal("")` union).

## Zod Output

```ts
// Required
z.string().email("Email must be a valid email")

// Optional
z.string().email("Invalid email format").or(z.literal(""))
```

## Table Cell

Renders the raw email string via `EmailCell`. No `mailto:` link is rendered.

## Known Limitations

- Cell doesn't render as a `mailto:` link — displays plain text identical to TextCell
- Cell has no email-specific behavior

## Examples

### Default

<Canvas of={Stories.Default} />

### Required

Submit with an invalid email to see the validation error.

<Canvas of={Stories.Required} />

### Optional

An empty value is accepted. If a value is provided, it must be a valid email.

<Canvas of={Stories.Optional} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 9: URL field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/url-field.stories.tsx`**

**File: `src/renderer/fields/url-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultUrlField: Field = {
	field_type: "url",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "Enter a full URL including protocol",
	},
	settings: {
		placeholder: "https://example.com",
	},
	children: null,
	system: false,
};

const requiredUrlField: Field = {
	field_type: "url",
	config: {
		name: "Homepage",
		api_accessor: "homepage",
		required: true,
		instructions: "A valid URL is required",
	},
	settings: {
		placeholder: "https://example.com",
	},
	children: null,
	system: false,
};

const optionalUrlField: Field = {
	field_type: "url",
	config: {
		name: "Portfolio",
		api_accessor: "portfolio",
		required: false,
		instructions: "Optional link to your portfolio",
	},
	settings: {
		placeholder: "https://portfolio.example.com",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "url",
	config: {
		name: "Website",
		api_accessor: "website",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const cellNoteField: Field = {
	field_type: "url",
	config: {
		name: "Documentation",
		api_accessor: "documentation",
		required: false,
		instructions: "Note: z.string().url() requires a protocol prefix (e.g. https://)",
	},
	settings: {
		placeholder: "https://docs.example.com/very/long/path/to/resource",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/URL",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultUrlField]}
			defaultValues={{ website: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredUrlField]}
			defaultValues={{ homepage: "" }}
		/>
	),
};

export const Optional: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[optionalUrlField]}
			defaultValues={{ portfolio: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ website: "https://example.com" }}
			readOnly
		/>
	),
};

export const CellNote: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[cellNoteField]}
			defaultValues={{ documentation: "" }}
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/url-field.mdx`**

**File: `src/renderer/fields/url-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./url-field.stories";

<Meta of={Stories} />

# URL

A web address input. Uses the browser's native `type="url"` and Zod's `.url()` validator for format checking.

## When to Use

Use **URL** for web addresses. For email addresses, use [Email](?path=/docs/fields-email--docs). For generic short text, use [Text](?path=/docs/fields-text--docs).

## Settings

| Setting       | Type     | Default | Description                                    |
|---------------|----------|---------|------------------------------------------------|
| `placeholder` | `string` | `""`    | Placeholder text shown when the field is empty  |

## Validation

| Rule       | Type     | Description                                                     |
|------------|----------|-----------------------------------------------------------------|
| `required` | `boolean`| When true, the field must contain a valid URL                    |

When optional, an empty string is also accepted (via `z.literal("")` union).

## Zod Output

```ts
// Required
z.string().url("Website must be a valid URL")

// Optional
z.string().url("Invalid URL format").or(z.literal(""))
```

## Table Cell

Renders the raw URL string via `UrlCell`. No truncation or clickable link is rendered.

## Known Limitations

- `z.string().url()` requires a protocol prefix — values like `example.com` will fail validation; must be `https://example.com`
- No URL truncation in cell (long URLs overflow)
- No `prepend` setting for protocol prefix

## Examples

### Default

<Canvas of={Stories.Default} />

### Required

Submit with an invalid URL to see the validation error.

<Canvas of={Stories.Required} />

### Optional

An empty value is accepted. If a value is provided, it must be a valid URL.

<Canvas of={Stories.Optional} />

### Read Only

<Canvas of={Stories.ReadOnly} />

### Cell Note

Demonstrates the protocol requirement. Try submitting `example.com` without `https://` to see the validation error.

<Canvas of={Stories.CellNote} />
```

---

### Task 10: Time field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/time-field.stories.tsx`**

**File: `src/renderer/fields/time-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultTimeField: Field = {
	field_type: "time",
	config: {
		name: "Start Time",
		api_accessor: "start_time",
		required: false,
		instructions: "Select a start time",
	},
	settings: null,
	children: null,
	system: false,
};

const requiredTimeField: Field = {
	field_type: "time",
	config: {
		name: "Deadline",
		api_accessor: "deadline",
		required: true,
		instructions: "A deadline time is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "time",
	config: {
		name: "Start Time",
		api_accessor: "start_time",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Time",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTimeField]}
			defaultValues={{ start_time: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredTimeField]}
			defaultValues={{ deadline: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ start_time: "14:30" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/time-field.mdx`**

**File: `src/renderer/fields/time-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./time-field.stories";

<Meta of={Stories} />

# Time

A time input rendered via `DatePickerField` with `type="time"`. Stores the value as a plain string.

## When to Use

Use **Time** for time-of-day values. For date values, use [Date](?path=/docs/fields-date--docs).

## Settings

This field type has no configurable settings.

## Validation

| Rule       | Type     | Description                                               |
|------------|----------|-----------------------------------------------------------|
| `required` | `boolean`| When true, the string must have at least 1 character       |

## Zod Output

```ts
// Required
z.string().min(1, "Start Time is required")

// Optional
z.string()
```

## Table Cell

Renders the raw string value via `TimeCell`. No time formatting is applied.

## Known Limitations

- No settings at all (no format, no min/max time, no step)
- No time format validation in Zod — accepts any string, not just valid time strings
- Cell doesn't format the value (raw string displayed)
- Value format is undocumented (depends on browser `<input type="time">` output)

## Examples

### Default

<Canvas of={Stories.Default} />

### Required

Submit without entering a time to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 11: Date field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/date-field.stories.tsx`**

**File: `src/renderer/fields/date-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultDateField: Field = {
	field_type: "date",
	config: {
		name: "Publish Date",
		api_accessor: "publish_date",
		required: false,
		instructions: "Select a publish date",
	},
	settings: null,
	children: null,
	system: false,
};

const withMinMaxDateField: Field = {
	field_type: "date",
	config: {
		name: "Event Date",
		api_accessor: "event_date",
		required: false,
		instructions: "Must be within the next year",
	},
	settings: {
		min_date: "2026-01-01",
		max_date: "2026-12-31",
	},
	children: null,
	system: false,
};

const requiredDateField: Field = {
	field_type: "date",
	config: {
		name: "Start Date",
		api_accessor: "start_date",
		required: true,
		instructions: "A start date is required",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "date",
	config: {
		name: "Publish Date",
		api_accessor: "publish_date",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Date",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultDateField]}
			defaultValues={{ publish_date: "" }}
		/>
	),
};

export const WithMinMaxDate: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withMinMaxDateField]}
			defaultValues={{ event_date: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredDateField]}
			defaultValues={{ start_date: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ publish_date: "2026-03-15" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/date-field.mdx`**

**File: `src/renderer/fields/date-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./date-field.stories";

<Meta of={Stories} />

# Date

A date input rendered via `DatePickerField` with `type="date"`. Stores the value as a plain string.

## When to Use

Use **Date** for calendar date values. For time-of-day values, use [Time](?path=/docs/fields-time--docs).

## Settings

| Setting        | Type      | Default | Description                                                    |
|----------------|-----------|---------|----------------------------------------------------------------|
| `enable_range` | `boolean` | `false` | Intended for date range selection — **not implemented**         |
| `min_date`     | `string`  | —       | Minimum selectable date (passed to DatePickerField `min` prop)  |
| `max_date`     | `string`  | —       | Maximum selectable date (passed to DatePickerField `max` prop)  |

## Validation

| Rule       | Type     | Description                                               |
|------------|----------|-----------------------------------------------------------|
| `required` | `boolean`| When true, the string must have at least 1 character       |

`min_date` and `max_date` are UI-only constraints — they are **not** validated in the Zod schema.

## Zod Output

```ts
// Required
z.string().min(1, "Publish Date is required")

// Optional
z.string()
```

## Table Cell

Renders the raw string value via `DateCell`. No date formatting is applied.

## Known Limitations

- `enable_range` is defined in settings but not implemented — it is a dead setting
- `min_date`/`max_date` are not validated in Zod (UI-only constraint on the picker)
- No date format validation in Zod — accepts any string, not just valid date strings
- Cell doesn't format the value (raw string displayed)

## Examples

### Default

<Canvas of={Stories.Default} />

### With Min / Max Date

The picker constrains selection to dates within 2026.

<Canvas of={Stories.WithMinMaxDate} />

### Required

Submit without selecting a date to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 12: Slug field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/slug-field.stories.tsx`**

**File: `src/renderer/fields/slug-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultSlugField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "URL-friendly identifier",
	},
	settings: {},
	children: null,
	system: false,
};

const sourceTextField: Field = {
	field_type: "text",
	config: {
		name: "Title",
		api_accessor: "title",
		required: false,
		instructions: "Type here to auto-generate the slug below",
	},
	settings: {
		placeholder: "e.g. My Blog Post",
	},
	children: null,
	system: false,
};

const slugWithSourceField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "Auto-generated from the Title field above",
	},
	settings: {
		source_field: "title",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "slug",
	config: {
		name: "Slug",
		api_accessor: "slug",
		required: false,
		instructions: "",
	},
	settings: {},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Slug",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultSlugField]}
			defaultValues={{ slug: "" }}
		/>
	),
};

export const WithSourceField: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[sourceTextField, slugWithSourceField]}
			defaultValues={{ title: "", slug: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ slug: "my-existing-slug" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/slug-field.mdx`**

**File: `src/renderer/fields/slug-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./slug-field.stories";

<Meta of={Stories} />

# Slug

A URL-friendly identifier field. Optionally auto-generates from a source field using the built-in `toSlug` function. Validates against the pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

## When to Use

Use **Slug** for URL path segments, API identifiers, or any value that must be lowercase-alphanumeric-with-hyphens. For generic short text, use [Text](?path=/docs/fields-text--docs).

## Settings

| Setting        | Type     | Default | Description                                                          |
|----------------|----------|---------|----------------------------------------------------------------------|
| `source_field` | `string` | —       | `api_accessor` of another field to auto-generate the slug from        |

## Validation

| Rule       | Type     | Description                                                              |
|------------|----------|--------------------------------------------------------------------------|
| `required` | `boolean`| When true, must match the slug regex pattern                              |

When optional, an empty string is also accepted (via `z.literal("")` union).

## Zod Output

```ts
// Required
z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a valid slug (lowercase letters, numbers, and hyphens)")

// Optional
z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a valid slug (lowercase letters, numbers, and hyphens)").or(z.literal(""))
```

## Slugify Algorithm

The internal `toSlug` function performs these steps:
1. `.toLowerCase()`
2. `.trim()`
3. Strip non-word characters except whitespace and hyphens
4. Replace whitespace/underscores with hyphens
5. Collapse consecutive hyphens
6. Strip leading/trailing hyphens

## Table Cell

Renders the raw slug string via `SlugCell`.

## Known Limitations

- Auto-slug always overwrites the slug field — there is no lock or manual-edit mechanism to prevent overwriting user edits
- Hardcoded placeholder `"e.g. my-page-slug"` (not configurable via settings)
- `toSlug` strips unicode characters without transliteration (e.g. `u` instead of `ue`, or simply removed)
- Nested source fields (dot-path accessors) are not supported

## Examples

### Default

A standalone slug field without a source. Enter a value manually.

<Canvas of={Stories.Default} />

### With Source Field

Type in the Title field to see the slug auto-generated below it.

<Canvas of={Stories.WithSourceField} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Chunk 3 Commit

- [ ] **Step: Commit all Chunk 3 files**

```bash
git add \
  src/renderer/fields/email-field.stories.tsx \
  src/renderer/fields/email-field.mdx \
  src/renderer/fields/url-field.stories.tsx \
  src/renderer/fields/url-field.mdx \
  src/renderer/fields/time-field.stories.tsx \
  src/renderer/fields/time-field.mdx \
  src/renderer/fields/date-field.stories.tsx \
  src/renderer/fields/date-field.mdx \
  src/renderer/fields/slug-field.stories.tsx \
  src/renderer/fields/slug-field.mdx

git commit -m "docs(renderer): add stories and MDX for email, url, time, date, slug field types"
```

---

## Chunk 4: Selection Fields (select, radio, checkboxes)

### Task 13: Select field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/select-field.stories.tsx`**

**File: `src/renderer/fields/select-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultSingleField: Field = {
	field_type: "select",
	config: {
		name: "Category",
		api_accessor: "category",
		required: false,
		instructions: "Select a category",
	},
	settings: {
		options: {
			news: "News",
			blog: "Blog",
			tutorial: "Tutorial",
		},
	},
	children: null,
	system: false,
};

const multiSelectField: Field = {
	field_type: "select",
	config: {
		name: "Tags",
		api_accessor: "tags",
		required: false,
		instructions: "Select one or more tags",
	},
	settings: {
		options: {
			javascript: "JavaScript",
			typescript: "TypeScript",
			react: "React",
			vue: "Vue",
			angular: "Angular",
		},
		multiple: true,
	},
	children: null,
	system: false,
};

const manyOptionsField: Field = {
	field_type: "select",
	config: {
		name: "Country",
		api_accessor: "country",
		required: false,
		instructions: "Select your country",
	},
	settings: {
		options: {
			de: "Germany",
			at: "Austria",
			ch: "Switzerland",
			us: "United States",
			gb: "United Kingdom",
			fr: "France",
			es: "Spain",
			it: "Italy",
			nl: "Netherlands",
			be: "Belgium",
			se: "Sweden",
			no: "Norway",
			dk: "Denmark",
			fi: "Finland",
			pl: "Poland",
		},
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "select",
	config: {
		name: "Status",
		api_accessor: "status",
		required: true,
		instructions: "A status is required",
	},
	settings: {
		options: {
			draft: "Draft",
			review: "In Review",
			published: "Published",
		},
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "select",
	config: {
		name: "Category",
		api_accessor: "category",
		required: false,
		instructions: "",
	},
	settings: {
		options: {
			news: "News",
			blog: "Blog",
			tutorial: "Tutorial",
		},
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Select",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultSingle: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultSingleField]}
			defaultValues={{ category: "" }}
		/>
	),
};

export const MultiSelect: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[multiSelectField]}
			defaultValues={{ tags: [] }}
		/>
	),
};

export const ManyOptions: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[manyOptionsField]}
			defaultValues={{ country: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ status: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ category: "blog" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/select-field.mdx`**

**File: `src/renderer/fields/select-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./select-field.stories";

<Meta of={Stories} />

# Select

A dropdown selection field. Supports single and multiple selection modes. Options are defined as a `Record<string, string>` mapping value keys to display labels.

## When to Use

Use **Select** for choosing from a predefined list. For small option sets (2-5 items), consider [Radio](?path=/docs/fields-radio--docs) for single-select or [Checkboxes](?path=/docs/fields-checkboxes--docs) for multi-select.

## Settings

| Setting    | Type                     | Default | Description                                    |
|------------|--------------------------|---------|------------------------------------------------|
| `options`  | `Record<string, string>` | `{}`    | Map of option values to display labels          |
| `multiple` | `boolean`                | —       | When true, enables multi-select mode            |

## Validation

| Rule       | Type     | Description                                               |
|------------|----------|-----------------------------------------------------------|
| `required` | `boolean`| Single: string min 1 character. Multi: array min 1 item.   |

## Zod Output

```ts
// Single — required
z.string().min(1, "Category is required")

// Single — optional
z.string()

// Multiple — required
z.array(z.string()).min(1, "Tags is required")

// Multiple — optional
z.array(z.string())
```

## Table Cell

Renders the selected value(s) as plain text via `SelectCell`.

## Known Limitations

- Multi-select uses raw HTML `<select multiple>` instead of anker's BaseSelect (chakra-react-select) — no searchable, creatable, or proper tag UI
- No option validation in Zod — any string is accepted, not just defined option keys
- Hardcoded placeholder `"Select..."` (not configurable)
- No BaseSelect integration for single-select either (uses anker's SelectField which wraps a native `<select>`)

## Examples

### Default (Single)

<Canvas of={Stories.DefaultSingle} />

### Multi-Select

Hold Ctrl/Cmd to select multiple options. Note the raw `<select multiple>` UI.

<Canvas of={Stories.MultiSelect} />

### Many Options

A select with 15 options demonstrating scroll behavior.

<Canvas of={Stories.ManyOptions} />

### Required

Submit without selecting a value to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 14: Radio field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/radio-field.stories.tsx`**

**File: `src/renderer/fields/radio-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultRadioField: Field = {
	field_type: "radio",
	config: {
		name: "Priority",
		api_accessor: "priority",
		required: false,
		instructions: "Select a priority level",
	},
	settings: {
		options: {
			low: "Low",
			medium: "Medium",
			high: "High",
		},
	},
	children: null,
	system: false,
};

const manyOptionsField: Field = {
	field_type: "radio",
	config: {
		name: "Department",
		api_accessor: "department",
		required: false,
		instructions: "Select your department",
	},
	settings: {
		options: {
			engineering: "Engineering",
			design: "Design",
			marketing: "Marketing",
			sales: "Sales",
			hr: "Human Resources",
			finance: "Finance",
			legal: "Legal",
			operations: "Operations",
		},
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "radio",
	config: {
		name: "Plan",
		api_accessor: "plan",
		required: true,
		instructions: "You must select a plan",
	},
	settings: {
		options: {
			free: "Free",
			pro: "Pro",
			enterprise: "Enterprise",
		},
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "radio",
	config: {
		name: "Priority",
		api_accessor: "priority",
		required: false,
		instructions: "",
	},
	settings: {
		options: {
			low: "Low",
			medium: "Medium",
			high: "High",
		},
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Radio",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultRadioField]}
			defaultValues={{ priority: "" }}
		/>
	),
};

export const ManyOptions: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[manyOptionsField]}
			defaultValues={{ department: "" }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ plan: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ priority: "medium" }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/radio-field.mdx`**

**File: `src/renderer/fields/radio-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./radio-field.stories";

<Meta of={Stories} />

# Radio

A set of radio buttons for single selection. Options are defined as a `Record<string, string>` mapping value keys to display labels. Uses anker's `RadioGroupField` component.

## When to Use

Use **Radio** when you have 2-5 options and want all choices visible at once. For longer option lists, use [Select](?path=/docs/fields-select--docs). For multi-selection, use [Checkboxes](?path=/docs/fields-checkboxes--docs).

## Settings

| Setting   | Type                     | Default | Description                         |
|-----------|--------------------------|---------|-------------------------------------|
| `options` | `Record<string, string>` | `{}`    | Map of option values to display labels |

## Validation

| Rule       | Type     | Description                                               |
|------------|----------|-----------------------------------------------------------|
| `required` | `boolean`| When true, the string must have at least 1 character       |

## Zod Output

```ts
// Required
z.string().min(1, "Plan is required")

// Optional
z.string()
```

## Table Cell

Renders the selected value as plain text via `RadioCell`.

## Known Limitations

- No orientation/layout setting (horizontal vs vertical) — always renders vertically
- No option validation in Zod — any string is accepted, not just defined option keys

## Examples

### Default

<Canvas of={Stories.Default} />

### Many Options

A radio group with 8 options.

<Canvas of={Stories.ManyOptions} />

### Required

Submit without selecting a value to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 15: Checkboxes field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/checkboxes-field.stories.tsx`**

**File: `src/renderer/fields/checkboxes-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultCheckboxesField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Interests",
		api_accessor: "interests",
		required: false,
		instructions: "Select your interests",
	},
	settings: {
		options: {
			sports: "Sports",
			music: "Music",
			travel: "Travel",
			cooking: "Cooking",
		},
	},
	children: null,
	system: false,
};

const preSelectedField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Notifications",
		api_accessor: "notifications",
		required: false,
		instructions: "Choose which notifications to receive",
	},
	settings: {
		options: {
			email: "Email notifications",
			sms: "SMS notifications",
			push: "Push notifications",
			in_app: "In-app notifications",
		},
	},
	children: null,
	system: false,
};

const requiredField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Terms",
		api_accessor: "terms",
		required: true,
		instructions: "You must accept at least one agreement",
	},
	settings: {
		options: {
			tos: "Terms of Service",
			privacy: "Privacy Policy",
			marketing: "Marketing Communications",
		},
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "checkboxes",
	config: {
		name: "Interests",
		api_accessor: "interests",
		required: false,
		instructions: "",
	},
	settings: {
		options: {
			sports: "Sports",
			music: "Music",
			travel: "Travel",
			cooking: "Cooking",
		},
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Checkboxes",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultCheckboxesField]}
			defaultValues={{ interests: [] }}
		/>
	),
};

export const PreSelected: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[preSelectedField]}
			defaultValues={{ notifications: ["email", "push"] }}
		/>
	),
};

export const Required: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[requiredField]}
			defaultValues={{ terms: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ interests: ["sports", "travel"] }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/checkboxes-field.mdx`**

**File: `src/renderer/fields/checkboxes-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./checkboxes-field.stories";

<Meta of={Stories} />

# Checkboxes

A set of checkboxes for multiple selection. Options are defined as a `Record<string, string>` mapping value keys to display labels. The value is stored as a `string[]` array.

## When to Use

Use **Checkboxes** when users can select zero or more options from a small set. For single-select with visible options, use [Radio](?path=/docs/fields-radio--docs). For multi-select from a long list, use [Select](?path=/docs/fields-select--docs) with `multiple: true`.

## Settings

| Setting   | Type                     | Default | Description                         |
|-----------|--------------------------|---------|-------------------------------------|
| `options` | `Record<string, string>` | `{}`    | Map of option values to display labels |

## Validation

| Rule       | Type     | Description                                               |
|------------|----------|-----------------------------------------------------------|
| `required` | `boolean`| When true, the array must have at least 1 item             |

## Zod Output

```ts
// Required
z.array(z.string()).min(1, "Terms is required")

// Optional
z.array(z.string())
```

## Table Cell

Renders the selected values as plain text via `CheckboxesCell`.

## Known Limitations

- Uses `disabled` instead of `readOnly` for read-only state — this is inconsistent with other field types
- No columns/layout setting for arranging checkboxes in a grid
- No option validation in Zod — any string values are accepted in the array, not just defined option keys
- No min/max selection count settings

## Examples

### Default

<Canvas of={Stories.Default} />

### Pre-Selected

Checkboxes with default values already selected.

<Canvas of={Stories.PreSelected} />

### Required

Submit without selecting any checkbox to see the validation error.

<Canvas of={Stories.Required} />

### Read Only

Checkboxes are rendered as `disabled` (not `readOnly`) in read-only mode.

<Canvas of={Stories.ReadOnly} />
```

---

### Chunk 4 Commit

- [ ] **Step: Commit all Chunk 4 files**

```bash
git add \
  src/renderer/fields/select-field.stories.tsx \
  src/renderer/fields/select-field.mdx \
  src/renderer/fields/radio-field.stories.tsx \
  src/renderer/fields/radio-field.mdx \
  src/renderer/fields/checkboxes-field.stories.tsx \
  src/renderer/fields/checkboxes-field.mdx

git commit -m "docs(renderer): add stories and MDX for select, radio, checkboxes field types"
```

---

## Chunk 5: Structural Fields (section, group, blocks, array)

### Task 16: Section field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/section-field.stories.tsx`**

**File: `src/renderer/fields/section-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const sectionField: Field = {
	field_type: "section",
	config: {
		name: "General Settings",
		api_accessor: "general_settings",
		required: false,
		instructions: "This section should group related fields — but rendering is not implemented",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Section",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[sectionField]}
			defaultValues={{}}
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/section-field.mdx`**

**File: `src/renderer/fields/section-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./section-field.stories";

<Meta of={Stories} />

# Section

A structural divider intended to organize fields into tabbed groups. **This field type is currently non-functional.**

## When to Use

Section is meant to create tabbed layouts in the form renderer. However, since the implementation is missing, it currently has no effect. Fields before and after a section field are rendered in the same flat list.

## Settings

This field type has no configurable settings.

## Validation

The Zod schema returns `z.never()` — section fields should never appear in form data.

## Zod Output

```ts
z.never()
```

## Table Cell

No cell component — section fields are not data-bearing.

## Known Limitations

- **Completely non-functional.** The `fieldComponent` returns `null`. No visual rendering occurs.
- No tabbed layout — the plan specified: tabbed layout when sections detected, fields grouped by section, default tab for fields before first section. None of this is implemented.
- FieldRenderer ignores section fields entirely — they produce no DOM output
- Zod schema uses `z.never()` which may cause issues if the accessor appears in form data

## Examples

### Default

This story renders a section field. Notice that nothing visible appears — this documents the current gap.

<Canvas of={Stories.Default} />
```

---

### Task 17: Group field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/group-field.stories.tsx`**

**File: `src/renderer/fields/group-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultGroupField: Field = {
	field_type: "group",
	config: {
		name: "Links",
		api_accessor: "links",
		required: false,
		instructions: "Add related links",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Label",
				api_accessor: "label",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "Link text" },
			children: null,
			system: false,
		},
		{
			field_type: "url",
			config: {
				name: "URL",
				api_accessor: "url",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "https://example.com" },
			children: null,
			system: false,
		},
	],
	system: false,
};

const withChildrenField: Field = {
	field_type: "group",
	config: {
		name: "Team Members",
		api_accessor: "team_members",
		required: false,
		instructions: "Add team members with their details",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Name",
				api_accessor: "name",
				required: true,
				instructions: "",
			},
			settings: { placeholder: "Full name" },
			children: null,
			system: false,
		},
		{
			field_type: "email",
			config: {
				name: "Email",
				api_accessor: "email",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "name@company.com" },
			children: null,
			system: false,
		},
		{
			field_type: "select",
			config: {
				name: "Role",
				api_accessor: "role",
				required: false,
				instructions: "",
			},
			settings: {
				options: {
					developer: "Developer",
					designer: "Designer",
					manager: "Manager",
				},
			},
			children: null,
			system: false,
		},
	],
	system: false,
};

const withMinMaxField: Field = {
	field_type: "group",
	config: {
		name: "Features",
		api_accessor: "features",
		required: false,
		instructions: "Between 1 and 5 features",
	},
	settings: {
		min_items: 1,
		max_items: 5,
	},
	children: [
		{
			field_type: "text",
			config: {
				name: "Feature",
				api_accessor: "feature",
				required: false,
				instructions: "",
			},
			settings: { placeholder: "Describe the feature" },
			children: null,
			system: false,
		},
	],
	system: false,
};

const readOnlyField: Field = {
	field_type: "group",
	config: {
		name: "Links",
		api_accessor: "links",
		required: false,
		instructions: "",
	},
	settings: {},
	children: [
		{
			field_type: "text",
			config: {
				name: "Label",
				api_accessor: "label",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
		{
			field_type: "url",
			config: {
				name: "URL",
				api_accessor: "url",
				required: false,
				instructions: "",
			},
			settings: null,
			children: null,
			system: false,
		},
	],
	system: false,
};

const meta = {
	title: "Fields/Group",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultGroupField]}
			defaultValues={{ links: [] }}
		/>
	),
};

export const WithChildren: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withChildrenField]}
			defaultValues={{ team_members: [] }}
		/>
	),
};

export const WithMinMax: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withMinMaxField]}
			defaultValues={{ features: [{ feature: "" }] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				links: [
					{ label: "Homepage", url: "https://example.com" },
					{ label: "Docs", url: "https://docs.example.com" },
				],
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/group-field.mdx`**

**File: `src/renderer/fields/group-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./group-field.stories";

<Meta of={Stories} />

# Group

A repeating group of child fields. Each item in the group contains the same set of fields. Uses React Hook Form's `useFieldArray` for dynamic add/remove.

## When to Use

Use **Group** when you need a repeating set of structured fields (e.g., links with label+URL, team members with name+email+role). For unstructured key-value pairs, use [Array](?path=/docs/fields-array--docs). For heterogeneous content, use [Blocks](?path=/docs/fields-blocks--docs).

## Settings

| Setting     | Type     | Default | Description                                    |
|-------------|----------|---------|------------------------------------------------|
| `min_items` | `number` | —       | Minimum number of items (enforced in Zod and UI) |
| `max_items` | `number` | —       | Maximum number of items (enforced in Zod and UI) |

## Children

The `children: Field[]` property on the field definition defines the child fields rendered within each group item. Each child field uses the standard `Field` interface.

## Validation

The Zod schema validates the array length via `min_items`/`max_items`. However, individual child fields within each item are **not** validated — the array items use `z.record(z.unknown())`.

## Zod Output

```ts
// No constraints
z.array(z.record(z.unknown()))

// With min/max
z.array(z.record(z.unknown())).min(1).max(5)
```

## Table Cell

Renders the item count via `GroupCell`.

## Known Limitations

- Child fields are not validated in Zod — items use `z.record(z.unknown())` instead of composing child field schemas
- No drag-to-reorder (the plan specified dnd-kit integration)
- `append({})` ignores child field defaults — new items start with empty objects
- No collapse/expand per item
- "Add item" button is above the list instead of below

## Examples

### Default

An empty group with two child fields (Label + URL). Click "Add item" to add entries.

<Canvas of={Stories.Default} />

### With Children

A group with three child fields (Name, Email, Role).

<Canvas of={Stories.WithChildren} />

### With Min / Max

Constrained to between 1 and 5 items. The "Add item" button disappears at 5, and the delete button disappears at 1.

<Canvas of={Stories.WithMinMax} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 18: Blocks field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/blocks-field.stories.tsx`**

**File: `src/renderer/fields/blocks-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultBlocksField: Field = {
	field_type: "blocks",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "Build your content using blocks",
	},
	settings: {
		allowed_blocks: [],
	},
	children: null,
	system: false,
};

const withBlockTypesField: Field = {
	field_type: "blocks",
	config: {
		name: "Page Content",
		api_accessor: "page_content",
		required: false,
		instructions: "Add text, image, or call-to-action blocks",
	},
	settings: {
		allowed_blocks: [
			{
				type: "text_block",
				name: "Text Block",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Heading",
							api_accessor: "heading",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Block heading" },
						children: null,
						system: false,
					},
					{
						field_type: "textarea",
						config: {
							name: "Body",
							api_accessor: "body",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Block body text" },
						children: null,
						system: false,
					},
				],
			},
			{
				type: "image_block",
				name: "Image Block",
				fields: [
					{
						field_type: "url",
						config: {
							name: "Image URL",
							api_accessor: "image_url",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "https://example.com/image.png" },
						children: null,
						system: false,
					},
					{
						field_type: "text",
						config: {
							name: "Alt Text",
							api_accessor: "alt_text",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Describe the image" },
						children: null,
						system: false,
					},
				],
			},
			{
				type: "cta_block",
				name: "Call to Action",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Button Text",
							api_accessor: "button_text",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "Click me" },
						children: null,
						system: false,
					},
					{
						field_type: "url",
						config: {
							name: "Button URL",
							api_accessor: "button_url",
							required: false,
							instructions: "",
						},
						settings: { placeholder: "https://example.com" },
						children: null,
						system: false,
					},
				],
			},
		],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "blocks",
	config: {
		name: "Page Content",
		api_accessor: "page_content",
		required: false,
		instructions: "",
	},
	settings: {
		allowed_blocks: [
			{
				type: "text_block",
				name: "Text Block",
				fields: [
					{
						field_type: "text",
						config: {
							name: "Heading",
							api_accessor: "heading",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
					{
						field_type: "textarea",
						config: {
							name: "Body",
							api_accessor: "body",
							required: false,
							instructions: "",
						},
						settings: null,
						children: null,
						system: false,
					},
				],
			},
		],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Blocks",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultBlocksField]}
			defaultValues={{ content: [] }}
		/>
	),
};

export const WithBlockTypes: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withBlockTypesField]}
			defaultValues={{ page_content: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				page_content: [
					{ _type: "text_block", heading: "Welcome", body: "Hello world" },
					{ _type: "text_block", heading: "About", body: "About us content" },
				],
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/blocks-field.mdx`**

**File: `src/renderer/fields/blocks-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./blocks-field.stories";

<Meta of={Stories} />

# Blocks

Dynamic content zones with different block types. Each block has a `_type` discriminator and its own set of fields defined via `BlockDefinition`. Uses React Hook Form's `useFieldArray` for add/remove/reorder.

## When to Use

Use **Blocks** when content is heterogeneous — different items have different field structures (e.g., a page builder with text blocks, image blocks, and CTA blocks). For homogeneous repeating fields, use [Group](?path=/docs/fields-group--docs). For simple key-value pairs, use [Array](?path=/docs/fields-array--docs).

## Settings

| Setting          | Type                | Default | Description                        |
|------------------|---------------------|---------|------------------------------------|
| `allowed_blocks` | `BlockDefinition[]` | `[]`    | The block types available for use   |

### BlockDefinition

```ts
interface BlockDefinition {
  type: string;     // Unique block type identifier (stored as _type)
  name: string;     // Display name shown in the block picker
  fields: Field[];  // Child fields within this block type
}
```

## Validation

The Zod schema validates the array structure but does not validate per-block-type fields:

```ts
z.array(z.object({ _type: z.string() }).passthrough())
```

## Zod Output

```ts
// Always (regardless of settings)
z.array(z.object({ _type: z.string() }).passthrough())
```

## Table Cell

Renders the block count via `BlocksCell`.

## Known Limitations

- No per-block-type Zod validation — all blocks use a passthrough object schema
- No drag-to-reorder — uses arrow buttons for moving blocks up/down
- No min/max block limits
- No per-block-type limits (e.g., max 1 hero block)
- New blocks start without child field defaults (`append({ _type: blockType })` only)

## Examples

### Default

A blocks field with no block types configured. The "Add block" picker shows an empty state.

<Canvas of={Stories.Default} />

### With Block Types

Three block types available: Text Block, Image Block, and Call to Action. Click "Add block" to select a type.

<Canvas of={Stories.WithBlockTypes} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 19: Array field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/array-field.stories.tsx`**

**File: `src/renderer/fields/array-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const dynamicModeField: Field = {
	field_type: "array",
	config: {
		name: "Metadata",
		api_accessor: "metadata",
		required: false,
		instructions: "Add key-value pairs",
	},
	settings: {
		mode: "dynamic",
	},
	children: null,
	system: false,
};

const keyedModeField: Field = {
	field_type: "array",
	config: {
		name: "Social Links",
		api_accessor: "social_links",
		required: false,
		instructions: "Fill in your social media profiles",
	},
	settings: {
		mode: "keyed",
		keys: ["twitter", "github", "linkedin", "website"],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "array",
	config: {
		name: "Metadata",
		api_accessor: "metadata",
		required: false,
		instructions: "",
	},
	settings: {
		mode: "dynamic",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Array",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DynamicMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[dynamicModeField]}
			defaultValues={{ metadata: [] }}
		/>
	),
};

export const KeyedMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[keyedModeField]}
			defaultValues={{ social_links: {} }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				metadata: [
					{ key: "author", value: "Jane Doe" },
					{ key: "version", value: "1.0.0" },
				],
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/array-field.mdx`**

**File: `src/renderer/fields/array-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./array-field.stories";

<Meta of={Stories} />

# Array

A list of key-value pairs or keyed values. Supports two modes: **dynamic** (user adds/removes pairs) and **keyed** (fixed keys with editable values). Wraps anker's `ArrayField` component.

## When to Use

Use **Array** for simple key-value data (metadata, social links, environment variables). For repeating structured fields, use [Group](?path=/docs/fields-group--docs). For heterogeneous content blocks, use [Blocks](?path=/docs/fields-blocks--docs).

## Settings

| Setting | Type                   | Default     | Description                                    |
|---------|------------------------|-------------|------------------------------------------------|
| `mode`  | `"dynamic" \| "keyed"` | `"dynamic"` | Dynamic: add/remove pairs. Keyed: fixed keys.   |
| `keys`  | `string[]`             | —           | List of fixed keys (only used in keyed mode)     |

## Validation

The Zod schema depends on the mode:

- **Dynamic mode**: `z.array(z.object({ key: z.string(), value: z.string() }))`
- **Keyed mode**: `z.record(z.string())`

## Zod Output

```ts
// Dynamic mode
z.array(z.object({ key: z.string(), value: z.string() }))

// Keyed mode
z.record(z.string())
```

## Table Cell

Renders the item count or key count via `ArrayCell`.

## Known Limitations

- `keys` mapping may not match anker's `ArrayField` prop shape — the component maps keys to `{ key, value: "" }` objects
- No `required` validation in Zod — neither mode has a minimum items check
- Values are always strings (no other types supported)
- Keyed mode doesn't restrict to configured keys in Zod — `z.record(z.string())` accepts any keys
- No min/max item limits

## Examples

### Dynamic Mode

Users can add and remove key-value pairs freely.

<Canvas of={Stories.DynamicMode} />

### Keyed Mode

Fixed keys (twitter, github, linkedin, website) with editable values.

<Canvas of={Stories.KeyedMode} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Chunk 5 Commit

- [ ] **Step: Commit all Chunk 5 files**

```bash
git add \
  src/renderer/fields/section-field.stories.tsx \
  src/renderer/fields/section-field.mdx \
  src/renderer/fields/group-field.stories.tsx \
  src/renderer/fields/group-field.mdx \
  src/renderer/fields/blocks-field.stories.tsx \
  src/renderer/fields/blocks-field.mdx \
  src/renderer/fields/array-field.stories.tsx \
  src/renderer/fields/array-field.mdx

git commit -m "docs(renderer): add stories and MDX for section, group, blocks, array field types"
```

## Chunk 6: Complex Text Fields (markdown, code, rich_text)

### Task 20: Markdown field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/markdown-field.stories.tsx`**

**File: `src/renderer/fields/markdown-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultMarkdownField: Field = {
	field_type: "markdown",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions: "Write your content using Markdown syntax",
	},
	settings: {
		placeholder: "Start writing...",
	},
	children: null,
	system: false,
};

const withContentField: Field = {
	field_type: "markdown",
	config: {
		name: "Article Body",
		api_accessor: "article_body",
		required: false,
		instructions: "Full article content in Markdown",
	},
	settings: {
		placeholder: "Write your article...",
	},
	children: null,
	system: false,
};

const withValidationField: Field = {
	field_type: "markdown",
	config: {
		name: "Summary",
		api_accessor: "summary",
		required: true,
		instructions: "A brief summary (10-500 characters)",
	},
	validation: {
		min_length: 10,
		max_length: 500,
	},
	settings: {
		placeholder: "Write a summary...",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "markdown",
	config: {
		name: "Body",
		api_accessor: "body",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Markdown",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultMarkdownField]}
			defaultValues={{ body: "" }}
		/>
	),
};

export const WithContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withContentField]}
			defaultValues={{
				article_body:
					"# Introduction\n\nThis is a **bold** statement and this is *italic*.\n\n## Features\n\n- First item\n- Second item\n- Third item\n\n> A blockquote for emphasis.\n\n```js\nconsole.log('Hello, world!');\n```\n\n[Learn more](https://example.com)",
			}}
		/>
	),
};

export const WithValidation: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withValidationField]}
			defaultValues={{ summary: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				body: "# Read Only Content\n\nThis markdown content cannot be edited.",
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/markdown-field.mdx`**

**File: `src/renderer/fields/markdown-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./markdown-field.stories";

<Meta of={Stories} />

# Markdown

Markdown-formatted text content. Renders an editor powered by anker's `MarkdownField` component with toolbar controls for common formatting.

## When to Use

Use **Markdown** when content needs formatting (headings, bold, links, lists, code) but you want a lightweight syntax instead of a full WYSIWYG editor. For plain multi-line text, use [Textarea](?path=/docs/fields-textarea--docs). For full rich text editing, use [Rich Text](?path=/docs/fields-rich-text--docs).

## Settings

| Setting       | Type     | Default | Description                                    |
|---------------|----------|---------|------------------------------------------------|
| `placeholder` | `string` | `""`    | Placeholder text shown when the field is empty (currently not passed to the component) |

## Validation

| Rule         | Type     | Description                                               |
|--------------|----------|-----------------------------------------------------------|
| `required`   | `boolean`| When true, the field must have at least 1 character        |
| `min_length` | `number` | Minimum number of characters                               |
| `max_length` | `number` | Maximum number of characters (validated on submit, not input) |

## Zod Output

```ts
// Required
z.string().min(1, "Body is required")

// Optional
z.string().optional()

// With validation
z.string().min(10).max(500)
```

## Table Cell

Renders a plain-text preview via `MarkdownCell`. Basic markdown formatting (headings, bold, italic, inline code, links, images) is stripped. Truncated at 100 characters with a `title` attribute showing the full text.

## Known Limitations

- `placeholder` setting is defined in the schema but not passed to the component
- `stripMarkdown` in the cell does not handle code blocks, blockquotes, tables, or strikethrough
- No toolbar configuration setting
- No preview mode

## Examples

### Default

<Canvas of={Stories.Default} />

### With Content

Pre-populated with various Markdown features: headings, bold, italic, lists, blockquotes, code blocks, and links.

<Canvas of={Stories.WithContent} />

### With Validation

Required field with min/max character length. Submit with fewer than 10 characters to see the validation error.

<Canvas of={Stories.WithValidation} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 21: Code field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/code-field.stories.tsx`**

**File: `src/renderer/fields/code-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultCodeField: Field = {
	field_type: "code",
	config: {
		name: "Code Snippet",
		api_accessor: "code_snippet",
		required: false,
		instructions: "Enter source code or preformatted text",
	},
	settings: null,
	children: null,
	system: false,
};

const withLanguageField: Field = {
	field_type: "code",
	config: {
		name: "JavaScript Code",
		api_accessor: "js_code",
		required: false,
		instructions: "Enter JavaScript code",
	},
	settings: {
		language: "javascript",
	},
	children: null,
	system: false,
};

const withContentField: Field = {
	field_type: "code",
	config: {
		name: "CSS Styles",
		api_accessor: "css_styles",
		required: false,
		instructions: "Custom CSS styles",
	},
	settings: {
		language: "css",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "code",
	config: {
		name: "Configuration",
		api_accessor: "configuration",
		required: false,
		instructions: "",
	},
	settings: {
		language: "json",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Code",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultCodeField]}
			defaultValues={{ code_snippet: "" }}
		/>
	),
};

export const WithLanguage: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withLanguageField]}
			defaultValues={{ js_code: "" }}
		/>
	),
};

export const WithContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withContentField]}
			defaultValues={{
				css_styles:
					".container {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 0 1rem;\n}\n\n.header {\n  background-color: #1a1a2e;\n  color: #e0e0e0;\n  padding: 1rem 0;\n}",
			}}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				configuration: JSON.stringify(
					{
						api_version: "2.0",
						base_url: "https://api.example.com",
						timeout: 30000,
						features: {
							caching: true,
							rate_limiting: { max_requests: 100, window_ms: 60000 },
						},
					},
					null,
					2,
				),
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/code-field.mdx`**

**File: `src/renderer/fields/code-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./code-field.stories";

<Meta of={Stories} />

# Code

Source code or preformatted text. Renders a code editor powered by anker's `CodeField` component with optional language-specific syntax highlighting.

## When to Use

Use **Code** for source code snippets, configuration files (JSON, YAML), or any preformatted text that should display in a monospace font. For plain text, use [Textarea](?path=/docs/fields-textarea--docs). For Markdown content, use [Markdown](?path=/docs/fields-markdown--docs).

## Settings

| Setting    | Type     | Default     | Description                                    |
|------------|----------|-------------|------------------------------------------------|
| `language` | `string` | `undefined` | Programming language for syntax highlighting (e.g. `"javascript"`, `"css"`, `"json"`, `"python"`) |

## Validation

| Rule         | Type     | Description                                               |
|--------------|----------|-----------------------------------------------------------|
| `required`   | `boolean`| When true, the field must have at least 1 character        |
| `min_length` | `number` | Minimum number of characters                               |
| `max_length` | `number` | Maximum number of characters (validated on submit, not input) |

## Zod Output

```ts
// Required
z.string().min(1, "Code Snippet is required")

// Optional
z.string().optional()

// With validation
z.string().min(1).max(10000)
```

## Table Cell

Renders a truncated code preview via `CodeCell` in a monospace `<code>` element. Truncated at 80 characters.

## Known Limitations

- Cell uses hardcoded `#f5f5f5` background instead of semantic tokens (dark mode incompatible)
- No `lineNumbers` setting
- No `height` / `maxHeight` setting

## Examples

### Default

A code field with no language specified.

<Canvas of={Stories.Default} />

### With Language

A code field configured with `language: "javascript"` for syntax highlighting.

<Canvas of={Stories.WithLanguage} />

### With Content

Pre-populated CSS code demonstrating multi-line content.

<Canvas of={Stories.WithContent} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 22: Rich Text field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/rich-text-field.stories.tsx`**

**File: `src/renderer/fields/rich-text-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const defaultRichTextField: Field = {
	field_type: "rich_text",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "Enter rich text content",
	},
	settings: {
		view_mode: "full",
	},
	children: null,
	system: false,
};

const withJSONContentField: Field = {
	field_type: "rich_text",
	config: {
		name: "Article",
		api_accessor: "article",
		required: false,
		instructions: "ProseMirror document structure as JSON",
	},
	settings: {
		editor_spec: "default",
		view_mode: "full",
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "rich_text",
	config: {
		name: "Content",
		api_accessor: "content",
		required: false,
		instructions: "",
	},
	settings: {
		view_mode: "compact",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Rich Text",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const Default: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultRichTextField]}
			defaultValues={{ content: "" }}
		/>
	),
};

export const WithJSONContent: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withJSONContentField]}
			defaultValues={{
				article: {
					type: "doc",
					content: [
						{
							type: "heading",
							attrs: { level: 1 },
							content: [{ type: "text", text: "Welcome" }],
						},
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "This is a " },
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "rich text",
								},
								{ type: "text", text: " document stored as ProseMirror JSON." },
							],
						},
						{
							type: "bullet_list",
							content: [
								{
									type: "list_item",
									content: [
										{
											type: "paragraph",
											content: [{ type: "text", text: "First point" }],
										},
									],
								},
								{
									type: "list_item",
									content: [
										{
											type: "paragraph",
											content: [{ type: "text", text: "Second point" }],
										},
									],
								},
							],
						},
					],
				},
			}}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{
				content: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "This content is read-only and cannot be edited.",
								},
							],
						},
					],
				},
			}}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/rich-text-field.mdx`**

**File: `src/renderer/fields/rich-text-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./rich-text-field.stories";

<Meta of={Stories} />

# Rich Text

Rich text content with formatting. Intended for full WYSIWYG editing via TipTap/ProseMirror, but currently renders as a **JSON textarea placeholder**.

## When to Use

Use **Rich Text** when you need structured, formatted content with a WYSIWYG editing experience. For lightweight formatting, use [Markdown](?path=/docs/fields-markdown--docs). For plain text, use [Textarea](?path=/docs/fields-textarea--docs).

**Important:** The current implementation is a placeholder. It renders a `<textarea>` that accepts raw JSON (ProseMirror document structure). A real TipTap editor integration depends on `@knkcms/knkeditor` (optional peer dependency), but no conditional rendering exists yet.

## Settings

| Setting       | Type                   | Default  | Description                                    |
|---------------|------------------------|----------|------------------------------------------------|
| `editor_spec` | `string`               | —        | ID of the editor specification to use (currently unused) |
| `view_mode`   | `"full" \| "compact"`  | `"full"` | Display mode for the editor (currently unused)  |

## Validation

The Zod schema uses `z.any()`, providing zero validation. Any value (string, object, null) is accepted.

## Zod Output

```ts
// Always
z.any()
```

## Table Cell

Renders a plain-text extraction via `RichTextCell`. Attempts to extract text from ProseMirror-like JSON documents by walking the `content` tree. Falls back to `"[Rich text content]"` for unrecognized structures. Truncated at 100 characters.

## Known Limitations

- **No actual rich text editor.** Renders a JSON textarea placeholder. Real TipTap integration depends on `@knkcms/knkeditor` (optional peer dep) but no conditional rendering exists.
- `editor_spec` setting is defined but unused
- `view_mode` setting is defined but unused
- `z.any()` provides zero validation
- No adapter integration (`textType` adapter is unused)
- JSON editing UX is unusable for end users

## Examples

### Default

The field renders as a plain `<textarea>` with the placeholder "Rich text content...". Content is stored as raw JSON or a plain string.

<Canvas of={Stories.Default} />

### With JSON Content

Pre-populated with a ProseMirror document structure. The textarea shows the JSON representation.

<Canvas of={Stories.WithJSONContent} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Chunk 6 Commit

- [ ] **Step: Commit all Chunk 6 files**

```bash
git add \
  src/renderer/fields/markdown-field.stories.tsx \
  src/renderer/fields/markdown-field.mdx \
  src/renderer/fields/code-field.stories.tsx \
  src/renderer/fields/code-field.mdx \
  src/renderer/fields/rich-text-field.stories.tsx \
  src/renderer/fields/rich-text-field.mdx

git commit -m "docs(renderer): add stories and MDX for markdown, code, rich_text field types"
```

---

## Chunk 7: Reference/Adapter Fields (reference, toc_reference, media, virtual_table)

### Task 23: Reference field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/reference-field.stories.tsx`**

**File: `src/renderer/fields/reference-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockReferenceAdapter: FieldKitAdapters["reference"] = {
	search: async (_blueprintIds: string[], query: string) => {
		const allItems = [
			{ id: "post-1", display_name: "Getting Started with FieldKit", blueprint_id: "blog_post" },
			{ id: "post-2", display_name: "Advanced Schema Design", blueprint_id: "blog_post" },
			{ id: "post-3", display_name: "Building Custom Field Types", blueprint_id: "blog_post" },
			{ id: "page-1", display_name: "About Us", blueprint_id: "page" },
			{ id: "page-2", display_name: "Contact", blueprint_id: "page" },
			{ id: "page-3", display_name: "Terms of Service", blueprint_id: "page" },
			{ id: "product-1", display_name: "Pro Plan", blueprint_id: "product" },
			{ id: "product-2", display_name: "Enterprise Plan", blueprint_id: "product" },
		];
		const lower = query.toLowerCase();
		return allItems.filter((item) =>
			item.display_name.toLowerCase().includes(lower),
		);
	},
	fetch: async (ids: string[]) => {
		const allItems = [
			{ id: "post-1", display_name: "Getting Started with FieldKit", blueprint_id: "blog_post" },
			{ id: "post-2", display_name: "Advanced Schema Design", blueprint_id: "blog_post" },
			{ id: "post-3", display_name: "Building Custom Field Types", blueprint_id: "blog_post" },
			{ id: "page-1", display_name: "About Us", blueprint_id: "page" },
			{ id: "page-2", display_name: "Contact", blueprint_id: "page" },
			{ id: "page-3", display_name: "Terms of Service", blueprint_id: "page" },
			{ id: "product-1", display_name: "Pro Plan", blueprint_id: "product" },
			{ id: "product-2", display_name: "Enterprise Plan", blueprint_id: "product" },
		];
		return allItems.filter((item) => ids.includes(item.id));
	},
};

const defaultReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "Search and select related blog posts",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const singleReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Author",
		api_accessor: "author",
		required: true,
		instructions: "Select the author of this post",
	},
	settings: {
		blueprints: ["page"],
		max_items: 1,
	},
	children: null,
	system: false,
};

const multiReferenceField: Field = {
	field_type: "reference",
	config: {
		name: "Featured Items",
		api_accessor: "featured_items",
		required: false,
		instructions: "Select multiple items from any blueprint",
	},
	settings: {
		blueprints: ["blog_post", "page", "product"],
		max_items: 5,
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "reference",
	config: {
		name: "Related Posts",
		api_accessor: "related_posts",
		required: false,
		instructions: "",
	},
	settings: {
		blueprints: ["blog_post"],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultReferenceField]}
			defaultValues={{ related_posts: [] }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const SingleMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[singleReferenceField]}
			defaultValues={{ author: "" }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const MultiMode: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[multiReferenceField]}
			defaultValues={{ featured_items: ["post-1", "page-2"] }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ related_posts: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ related_posts: ["post-1", "post-3"] }}
			adapters={{ reference: mockReferenceAdapter }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/reference-field.mdx`**

**File: `src/renderer/fields/reference-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./reference-field.stories";

<Meta of={Stories} />

# Reference

Link to other content items. Provides a search interface to find and select references from other blueprints. Requires a `reference` adapter to be configured via `FieldKitProvider`.

## When to Use

Use **Reference** when a field should link to one or more content items from other blueprints (e.g., "Related Posts", "Author", "Category"). For a single table-of-contents reference limited to one per spec, use [TOC Reference](?path=/docs/fields-toc-reference--docs).

## Settings

| Setting         | Type       | Default     | Description                                    |
|-----------------|------------|-------------|------------------------------------------------|
| `blueprints`    | `string[]` | —           | Blueprint IDs to search within                  |
| `always_latest` | `boolean`  | —           | Always resolve to the latest version (currently unused) |
| `max_items`     | `number`   | `undefined` | Maximum number of references. When `1`, stores a single string instead of an array |
| `max_depth`     | `number`   | —           | Maximum reference depth (currently unused)       |
| `attributes`    | `string[]` | —           | Attributes to include in the reference (currently unused) |

## Adapter Interface

The reference field requires a `reference` adapter injected via `FieldKitProvider`:

```ts
reference: {
  search: (blueprintIds: string[], query: string) => Promise<ReferenceItem[]>;
  fetch: (ids: string[]) => Promise<ReferenceItem[]>;
}
```

Where `ReferenceItem` is:
```ts
interface ReferenceItem {
  id: string;
  display_name: string;
  blueprint_id?: string;
  [key: string]: unknown;
}
```

## Validation

| Rule       | Type     | Description                                     |
|------------|----------|-------------------------------------------------|
| `required` | `boolean`| When true, at least one reference must be selected (min 1 for arrays, non-empty string for single) |

## Zod Output

```ts
// Single mode (max_items: 1) — required
z.string().min(1, "Author is required")

// Single mode — optional
z.string()

// Multi mode — required
z.array(z.string()).min(1, "Related Posts is required")

// Multi mode — optional
z.array(z.string())
```

## Table Cell

Renders reference IDs as a comma-separated string via `ReferenceCell`. If the value contains objects with `display_name`, those are shown; otherwise raw IDs are displayed. Shows an em-dash for null/empty values. Truncated at 100 characters.

## Known Limitations

- `useEffect` inside Controller render function (React hooks rules violation)
- `always_latest`, `max_depth`, `attributes` settings are defined but unused
- No search debounce — every keystroke triggers a search
- `max_items` is not enforced in the UI (except single mode which replaces instead of appending)
- No keyboard accessibility on the search dropdown
- Cell does not resolve IDs to display names (no adapter context in table cells)

## Examples

### Default With Mock Adapter

Search for references by typing in the search box. Try searching "Getting" or "About".

<Canvas of={Stories.DefaultWithMockAdapter} />

### Single Mode

With `max_items: 1`, the field stores a single string and replaces the previous selection.

<Canvas of={Stories.SingleMode} />

### Multi Mode

Pre-populated with two references. Additional items can be added up to the `max_items` limit (though the limit is not enforced in the UI).

<Canvas of={Stories.MultiMode} />

### No Adapter

When no reference adapter is configured, the field shows a "Reference adapter not configured" message.

<Canvas of={Stories.NoAdapter} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 24: TOC Reference field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/toc-reference-field.stories.tsx`**

**File: `src/renderer/fields/toc-reference-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockReferenceAdapter: FieldKitAdapters["reference"] = {
	search: async (_blueprintIds: string[], query: string) => {
		const allItems = [
			{ id: "chapter-1", display_name: "1. Introduction", blueprint_id: "chapter" },
			{ id: "chapter-2", display_name: "2. Getting Started", blueprint_id: "chapter" },
			{ id: "chapter-3", display_name: "3. Core Concepts", blueprint_id: "chapter" },
			{ id: "chapter-4", display_name: "4. Advanced Usage", blueprint_id: "chapter" },
			{ id: "chapter-5", display_name: "5. API Reference", blueprint_id: "chapter" },
			{ id: "chapter-6", display_name: "6. Troubleshooting", blueprint_id: "chapter" },
		];
		const lower = query.toLowerCase();
		return allItems.filter((item) =>
			item.display_name.toLowerCase().includes(lower),
		);
	},
	fetch: async (ids: string[]) => {
		const allItems = [
			{ id: "chapter-1", display_name: "1. Introduction", blueprint_id: "chapter" },
			{ id: "chapter-2", display_name: "2. Getting Started", blueprint_id: "chapter" },
			{ id: "chapter-3", display_name: "3. Core Concepts", blueprint_id: "chapter" },
			{ id: "chapter-4", display_name: "4. Advanced Usage", blueprint_id: "chapter" },
			{ id: "chapter-5", display_name: "5. API Reference", blueprint_id: "chapter" },
			{ id: "chapter-6", display_name: "6. Troubleshooting", blueprint_id: "chapter" },
		];
		return allItems.filter((item) => ids.includes(item.id));
	},
};

const defaultTocReferenceField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "Select the parent chapter for this section",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "toc_reference",
	config: {
		name: "Parent Chapter",
		api_accessor: "parent_chapter",
		required: false,
		instructions: "",
	},
	settings: {
		blueprints: ["chapter"],
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/TOC Reference",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultTocReferenceField]}
			defaultValues={{ parent_chapter: "" }}
			adapters={{ reference: mockReferenceAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ parent_chapter: "" }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ parent_chapter: "chapter-3" }}
			adapters={{ reference: mockReferenceAdapter }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/toc-reference-field.mdx`**

**File: `src/renderer/fields/toc-reference-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./toc-reference-field.stories";

<Meta of={Stories} />

# TOC Reference

Table of contents reference to a single content item. A specialized variant of [Reference](?path=/docs/fields-reference--docs) that is limited to one instance per specification and is only available in blueprints.

## When to Use

Use **TOC Reference** when a blueprint needs a single hierarchical parent reference (e.g., "Parent Chapter", "Parent Category"). This creates a tree structure across entries of the same blueprint. For linking to multiple items, use [Reference](?path=/docs/fields-reference--docs).

## Difference from Reference

| Aspect         | Reference                       | TOC Reference                  |
|----------------|--------------------------------|--------------------------------|
| `maxPerSpec`   | No limit                       | `1` — only one per blueprint    |
| `availableIn`  | `["blueprint", "task", "form"]` | `["blueprint"]` only            |
| Zod output     | `z.string()` or `z.array(z.string())` | Always `z.string()`      |
| Selection mode | Single or multi                 | Always single                   |

## Settings

| Setting         | Type       | Default     | Description                                    |
|-----------------|------------|-------------|------------------------------------------------|
| `blueprints`    | `string[]` | —           | Blueprint IDs to search within                  |
| `always_latest` | `boolean`  | —           | Always resolve to the latest version (currently unused) |
| `max_items`     | `number`   | —           | Maximum references (currently unused — always single) |
| `max_depth`     | `number`   | —           | Maximum reference depth (currently unused)       |
| `attributes`    | `string[]` | —           | Attributes to include (currently unused)         |

## Adapter Interface

Uses the same `reference` adapter as the Reference field:

```ts
reference: {
  search: (blueprintIds: string[], query: string) => Promise<ReferenceItem[]>;
  fetch: (ids: string[]) => Promise<ReferenceItem[]>;
}
```

## Validation

| Rule       | Type     | Description                                     |
|------------|----------|-------------------------------------------------|
| `required` | `boolean`| When true, a reference must be selected          |

## Zod Output

```ts
// Required
z.string().min(1, "Parent Chapter is required")

// Optional
z.string()
```

## Table Cell

Renders the display name of the referenced item via `TocReferenceCell`. If the value is an object with `display_name`, that is shown; otherwise the raw string value is displayed. Shows an em-dash for null/empty values.

## Known Limitations

- Same as Reference: `useEffect` inside Controller render (React hooks violation)
- `always_latest`, `max_depth`, `attributes` settings are defined but unused
- No search debounce
- No keyboard accessibility on the search dropdown
- Near-duplicate of Reference — should share a base component
- Cell does not resolve IDs to display names (no adapter context in table cells)

## Examples

### Default With Mock Adapter

Search for a parent chapter by typing in the search box. Try searching "Getting" or "Core".

<Canvas of={Stories.DefaultWithMockAdapter} />

### No Adapter

When no reference adapter is configured, the field shows a "Reference adapter not configured" message.

<Canvas of={Stories.NoAdapter} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 25: Media field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/media-field.stories.tsx`**

**File: `src/renderer/fields/media-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters, MediaItem } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

let mockIdCounter = 100;

const mockMediaAdapter: FieldKitAdapters["media"] = {
	upload: async (file: File): Promise<MediaItem> => {
		// Simulate upload delay
		await new Promise((resolve) => setTimeout(resolve, 800));
		mockIdCounter += 1;
		return {
			id: `media-${mockIdCounter}`,
			filename: file.name,
			url: `https://cdn.example.com/uploads/${file.name}`,
			mime_type: file.type || "application/octet-stream",
			size: file.size,
		};
	},
	browse: async () => {
		return [
			{
				id: "media-1",
				filename: "hero-banner.jpg",
				url: "https://cdn.example.com/uploads/hero-banner.jpg",
				mime_type: "image/jpeg",
				size: 245000,
			},
			{
				id: "media-2",
				filename: "logo.png",
				url: "https://cdn.example.com/uploads/logo.png",
				mime_type: "image/png",
				size: 18400,
			},
			{
				id: "media-3",
				filename: "product-overview.pdf",
				url: "https://cdn.example.com/uploads/product-overview.pdf",
				mime_type: "application/pdf",
				size: 1250000,
			},
		];
	},
};

const defaultMediaField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "Upload files to attach to this entry",
	},
	settings: null,
	children: null,
	system: false,
};

const withAcceptFilterField: Field = {
	field_type: "media",
	config: {
		name: "Cover Image",
		api_accessor: "cover_image",
		required: false,
		instructions: "Upload an image (JPEG, PNG, or WebP)",
	},
	settings: {
		accept: ["image/jpeg", "image/png", "image/webp"],
		max_items: 1,
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: null,
	children: null,
	system: false,
};

const readOnlyField: Field = {
	field_type: "media",
	config: {
		name: "Attachments",
		api_accessor: "attachments",
		required: false,
		instructions: "",
	},
	settings: null,
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Media",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultMediaField]}
			defaultValues={{ attachments: [] }}
			adapters={{ media: mockMediaAdapter }}
		/>
	),
};

export const WithAcceptFilter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[withAcceptFilterField]}
			defaultValues={{ cover_image: [] }}
			adapters={{ media: mockMediaAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ attachments: [] }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[readOnlyField]}
			defaultValues={{ attachments: ["media-1", "media-2"] }}
			adapters={{ media: mockMediaAdapter }}
			readOnly
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/media-field.mdx`**

**File: `src/renderer/fields/media-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./media-field.stories";

<Meta of={Stories} />

# Media

Upload or select media files. Provides a file upload button and displays selected media items as a list. Requires a `media` adapter to be configured via `FieldKitProvider`.

## When to Use

Use **Media** for file uploads such as images, documents, or other attachments. The field stores an array of media IDs that are resolved through the adapter.

## Settings

| Setting     | Type       | Default     | Description                                    |
|-------------|------------|-------------|------------------------------------------------|
| `accept`    | `string[]` | `undefined` | Allowed MIME types (e.g. `["image/jpeg", "image/png"]`). Filters the file picker and is passed to the `browse` adapter method. |
| `max_items` | `number`   | `undefined` | Maximum number of files allowed. When the limit is reached, the upload button is hidden. |

## Adapter Interface

The media field requires a `media` adapter injected via `FieldKitProvider`:

```ts
media: {
  upload: (file: File) => Promise<MediaItem>;
  browse: (filter: MediaFilter) => Promise<MediaItem[]>;
}
```

Where `MediaItem` and `MediaFilter` are:
```ts
interface MediaItem {
  id: string;
  filename: string;
  url: string;
  mime_type: string;
  size: number;
  [key: string]: unknown;
}

interface MediaFilter {
  mime_types?: string[];
  query?: string;
}
```

## Validation

| Rule       | Type     | Description                                     |
|------------|----------|-------------------------------------------------|
| `required` | `boolean`| When true, at least one file must be uploaded    |

## Zod Output

```ts
// Required
z.array(z.string()).min(1, "Attachments is required")

// Optional
z.array(z.string())
```

## Table Cell

Renders a file count via `MediaCell` (e.g. "3 files", "1 file"). Shows an em-dash for null/empty values.

## Known Limitations

- No browse/select-existing UI — only upload is supported
- No image preview (`MediaItem.url` is unused)
- No drag-and-drop upload
- Upload errors are silently swallowed
- `max_items` is not reflected in the Zod schema
- No file size limit setting
- No single-item mode (always stores an array)
- Cell shows only the count (no filenames or thumbnails)

## Examples

### Default With Mock Adapter

Click "Upload file" to simulate uploading. The mock adapter returns a new `MediaItem` after a brief delay.

<Canvas of={Stories.DefaultWithMockAdapter} />

### With Accept Filter

Restricted to image files (JPEG, PNG, WebP) with `max_items: 1`. The file picker dialog will filter by accepted types.

<Canvas of={Stories.WithAcceptFilter} />

### No Adapter

When no media adapter is configured, the field shows a "Media adapter not configured" message.

<Canvas of={Stories.NoAdapter} />

### Read Only

<Canvas of={Stories.ReadOnly} />
```

---

### Task 26: Virtual Table field stories and MDX

- [ ] **Step 1: Create `src/renderer/fields/virtual-table-field.stories.tsx`**

**File: `src/renderer/fields/virtual-table-field.stories.tsx`**
```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { FieldKitAdapters } from "../adapters";
import type { Field } from "../../schema/types";
import {
	FieldStoryWrapper,
	type FieldStoryWrapperProps,
} from "./__stories__/field-story-wrapper";

const mockBlueprintAdapter: FieldKitAdapters["blueprint"] = {
	getSchema: async (_blueprintId: string) => {
		return [
			{
				field_type: "text",
				config: {
					name: "Product Name",
					api_accessor: "product_name",
					required: true,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "number",
				config: {
					name: "Price",
					api_accessor: "price",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "SKU",
					api_accessor: "sku",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "boolean",
				config: {
					name: "In Stock",
					api_accessor: "in_stock",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
			{
				field_type: "text",
				config: {
					name: "Category",
					api_accessor: "category",
					required: false,
					instructions: "",
				},
				settings: null,
				children: null,
				system: false,
			},
		] satisfies Field[];
	},
	getData: async (_blueprintId: string, _query) => {
		return {
			items: [],
			total: 0,
			page: 1,
			page_size: 25,
		};
	},
};

const defaultVirtualTableField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Product Catalog",
		api_accessor: "product_catalog",
		required: false,
		instructions: "Embedded view of the product catalog",
	},
	settings: {
		blueprint: "products",
		max_records_per_page: 25,
	},
	children: null,
	system: false,
};

const emptyTableField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Order Items",
		api_accessor: "order_items",
		required: false,
		instructions: "Items in this order",
	},
	settings: {
		blueprint: "products",
	},
	children: null,
	system: false,
};

const noAdapterField: Field = {
	field_type: "virtual_table",
	config: {
		name: "Product Catalog",
		api_accessor: "product_catalog",
		required: false,
		instructions: "This field has no adapter configured",
	},
	settings: {
		blueprint: "products",
	},
	children: null,
	system: false,
};

const meta = {
	title: "Fields/Virtual Table",
	component: FieldStoryWrapper,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldStoryWrapper>;

export default meta;
type Story = StoryObj<FieldStoryWrapperProps>;

export const DefaultWithMockAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[defaultVirtualTableField]}
			defaultValues={{
				product_catalog: [
					{ product_name: "Wireless Keyboard", price: 79.99, sku: "KB-001", in_stock: true, category: "Peripherals" },
					{ product_name: "USB-C Hub", price: 49.99, sku: "HB-012", in_stock: true, category: "Accessories" },
					{ product_name: "Ergonomic Mouse", price: 59.99, sku: "MS-003", in_stock: false, category: "Peripherals" },
					{ product_name: "Monitor Stand", price: 129.00, sku: "ST-007", in_stock: true, category: "Furniture" },
					{ product_name: "Webcam HD", price: 89.95, sku: "WC-021", in_stock: true, category: "Peripherals" },
				],
			}}
			adapters={{ blueprint: mockBlueprintAdapter }}
		/>
	),
};

export const EmptyTable: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[emptyTableField]}
			defaultValues={{ order_items: [] }}
			adapters={{ blueprint: mockBlueprintAdapter }}
		/>
	),
};

export const NoAdapter: Story = {
	render: () => (
		<FieldStoryWrapper
			fields={[noAdapterField]}
			defaultValues={{ product_catalog: [] }}
		/>
	),
};
```

- [ ] **Step 2: Create `src/renderer/fields/virtual-table-field.mdx`**

**File: `src/renderer/fields/virtual-table-field.mdx`**
```mdx
import { Meta, Canvas } from "@storybook/blocks";
import * as Stories from "./virtual-table-field.stories";

<Meta of={Stories} />

# Virtual Table

Embedded table of records from another blueprint. Displays data in a read-oriented table layout using column definitions fetched from the referenced blueprint's schema. Requires a `blueprint` adapter to be configured via `FieldKitProvider`.

## When to Use

Use **Virtual Table** when you want to embed a read-only view of records from another blueprint directly within a form (e.g., showing order line items, product variants, or related records). This field is only available in blueprints (`availableIn: ["blueprint"]`).

## Settings

| Setting                | Type     | Default | Description                                    |
|------------------------|----------|---------|------------------------------------------------|
| `blueprint`            | `string` | —       | ID of the blueprint whose schema defines the table columns |
| `always_latest`        | `boolean`| —       | Always fetch the latest schema version (currently unused) |
| `max_records_per_page` | `number` | `25`    | Maximum records per page (currently unused — no pagination) |

## Adapter Interface

The virtual table field requires a `blueprint` adapter injected via `FieldKitProvider`:

```ts
blueprint: {
  getSchema: (blueprintId: string) => Promise<Field[]>;
  getData: (blueprintId: string, query: DataQuery) => Promise<DataPage>;
}
```

Where `DataQuery` and `DataPage` are:
```ts
interface DataQuery {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

interface DataPage<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
```

**Note:** Only `getSchema` is called. `getData` is defined in the adapter interface but never invoked by the component — data comes from the form value, not the adapter.

## Validation

The Zod schema is `z.array(z.record(z.unknown()))`. No further validation is applied.

## Zod Output

```ts
// Always
z.array(z.record(z.unknown()))
```

## Table Cell

Renders a row count via `VirtualTableCell` (e.g. "5 rows", "1 row", "0 rows"). Shows an em-dash for null values.

## Known Limitations

- Never fetches data from the adapter (`getData` is unused) — data must be provided as the form value
- `max_records_per_page` is unused (no pagination implemented)
- `always_latest` is unused
- Hardcoded 5-column limit — only the first 5 non-hidden fields from the schema are shown
- Uses raw Chakra `Table` instead of anker's `DataTable` (no sorting, selection, or pagination)
- No column type-aware rendering — all cell values are stringified with `String()`
- `availableIn: ["blueprint"]` only — not available in tasks or forms

## Examples

### Default With Mock Adapter

A product catalog table with 5 rows of sample data. Column headers are fetched from the mock adapter's schema.

<Canvas of={Stories.DefaultWithMockAdapter} />

### Empty Table

A table with no records, showing the "No records" placeholder row.

<Canvas of={Stories.EmptyTable} />

### No Adapter

When no blueprint adapter is configured, the field shows a "Blueprint adapter not configured" message.

<Canvas of={Stories.NoAdapter} />
```

---

### Chunk 7 Commit

- [ ] **Step: Commit all Chunk 7 files**

```bash
git add \
  src/renderer/fields/reference-field.stories.tsx \
  src/renderer/fields/reference-field.mdx \
  src/renderer/fields/toc-reference-field.stories.tsx \
  src/renderer/fields/toc-reference-field.mdx \
  src/renderer/fields/media-field.stories.tsx \
  src/renderer/fields/media-field.mdx \
  src/renderer/fields/virtual-table-field.stories.tsx \
  src/renderer/fields/virtual-table-field.mdx

git commit -m "docs(renderer): add stories and MDX for reference, toc_reference, media, virtual_table field types"
```

---

## Chunk 8: Final Verification

### Task 27: Verify build and type-check

- [ ] **Step 1: Build Storybook**

Run the Storybook static build to verify all stories compile and render without errors.

```bash
npx storybook build --quiet
```

If the build fails, fix any import errors, missing exports, or JSX issues in the story/MDX files created in Chunks 1-7. Common issues:
- Missing `satisfies` keyword (requires TypeScript 4.9+)
- MDX `<Canvas>` referencing a non-exported story name
- Incorrect relative import paths

- [ ] **Step 2: Verify TypeScript**

Run the TypeScript compiler in check-only mode to ensure no type errors were introduced.

```bash
npx tsc --noEmit
```

If there are type errors, fix them in the affected files. Common issues:
- `Field` type generic mismatch (use `Field` without a generic parameter for story field definitions)
- `FieldKitAdapters` partial type — ensure `adapters` prop uses `Partial<FieldKitAdapters>`
- Mock adapter return types not matching `ReferenceItem`, `MediaItem`, or `DataPage`

- [ ] **Step 3: Commit any fixes**

If any files were modified in Steps 1-2, commit the fixes.

```bash
git add -u
git commit -m "fix(renderer): resolve build and type errors in field stories"
```

If no changes were needed, skip this step.
