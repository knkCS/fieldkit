# @knkcs/anker Reference for Fieldkit

This document describes the anker components and APIs that fieldkit imports and depends on. Read this before creating or modifying any field component, table component, or drawer in fieldkit.

## Import Map by Layer

| Fieldkit Layer | Import Path | Components Used |
|---|---|---|
| `schema` | — | None (zero React dependency) |
| `editor` | — | None (uses plain HTML + inline styles) |
| `renderer` | `@knkcs/anker/forms` | All form field components |
| `table` | `@knkcs/anker/components` | `DataTable`, `DrawerRoot` |
| `rich-text-spec` | — | None (uses plain HTML + inline styles) |

## Form Components (`@knkcs/anker/forms`)

All form components call `useFormContext()` internally — they require a `FormProvider` ancestor.

### `FormField<T extends FieldValues>`

The foundational wrapper. All other `*Field` components build on this. Fieldkit also uses it directly for complex fields (reference, media, blocks, group, rich-text, virtual-table, checkboxes, select-multiple).

```ts
interface FormFieldProps<T extends FieldValues> {
  name: Path<T>;
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  description?: React.ReactNode;   // persistent, shows even when there's an error
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  actions?: React.ReactNode;       // rendered alongside label (top-right area)
  children: (
    field: ControllerRenderProps<T, Path<T>> & {
      "aria-describedby"?: string;
    }
  ) => React.ReactNode;
}
```

**Key behaviors:**
- Wraps Chakra's `Field.Root` with `invalid`, `required`, `disabled`, `readOnly` states
- Auto-generates `aria-describedby` linking the input to description/helper/error elements
- Renders `Field.ErrorText` with `aria-live="polite"` when `fieldState.error` exists
- Uses a **children render-prop** pattern — the child function receives `ControllerRenderProps` + `aria-describedby`

### `InputField<T extends FieldValues>`

Used by: `TextField`, `SlugField`, `UrlField`, `EmailField`

```ts
interface InputFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  placeholder?: string;
  type?: InputProps["type"];
  append?: string | React.ReactElement;   // right add-on
  prepend?: string | React.ReactElement;  // left add-on
  inputProps?: InputProps;
}
```

Wraps anker's `TextInput` atom (Chakra `Input` inside a `Group` with optional `InputAddon` components). Value is coerced to `field.value ?? ""` to prevent uncontrolled-to-controlled warnings.

### `TextareaField<T extends FieldValues>`

Used by: `TextareaField`

```ts
interface TextareaFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  placeholder?: string;
  textareaProps?: TextareaProps;  // escape hatch; fieldkit passes { rows }
}
```

### `DatePickerField<T extends FieldValues>`

Used by: `DateField` (type="date"), `TimeField` (type="time")

```ts
interface DatePickerFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  min?: string;           // YYYY-MM-DD
  max?: string;           // YYYY-MM-DD
  type?: "date" | "datetime-local" | "time";
}
```

Uses the browser's native date/time input — not a custom calendar picker.

### `NumberInputField<T extends FieldValues>`

Used by: `NumberField`

```ts
interface NumberInputFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  min?: number;
  max?: number;
  step?: number;
  showStepper?: boolean;        // default: true
  numberInputProps?: NumberInputProps;
}
```

Value is stored as a number. Empty string converts to `0` via `Number.parseFloat`.

### `SwitchField<T extends FieldValues>`

Used by: `BooleanField`

```ts
interface SwitchFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  switchProps?: SwitchProps;
}
```

`onCheckedChange` receives `{ checked: boolean | "indeterminate" }` — coerced to boolean via `!!details.checked`.

### `RadioGroupField<T extends FieldValues>`

Used by: `RadioField`

```ts
interface RadioGroupFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  options: Array<{ label: React.ReactNode; value: string }>;
  radioGroupProps?: RadioGroupRootProps;
  stackProps?: StackProps;
}
```

Fieldkit transforms `settings.options` record (`{ [value]: label }`) into the `options` array.

### `CheckboxField<T extends FieldValues>`

Used by: `CheckboxesField`

```ts
interface CheckboxFieldProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  value?: string | number;  // when provided: array mode
  disabled?: boolean;
  helperText?: React.ReactNode;
  children?: React.ReactNode;
}
```

**Two modes:**
- **Boolean mode** (no `value` prop): `field.value` is a boolean
- **Array mode** (`value` prop present): toggles the value in/out of an array

**Important:** `CheckboxField` creates its own `Controller` internally. It does NOT extend `FormFieldProps`. Fieldkit wraps it in an outer `FormField` for the label/helper grouping.

### `SelectField<T extends FieldValues>`

Used by: `SelectField` (single mode only)

```ts
interface SelectFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  placeholder?: string;
  selectProps?: NativeSelectFieldProps;
  children: React.ReactNode;  // <option> elements
}
```

Uses a native `<select>` element. For multi-select, fieldkit bypasses this and uses a bare `FormField` + `<select multiple>`.

### `ColorPickerField<T extends FieldValues>`

Used by: `ColorField`

```ts
interface ColorPickerFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  size?: ButtonProps["size"];
  ColorPicker?: React.ComponentType<{ color?: string; onChange?: (color: string) => void }>;
}
```

Without the `ColorPicker` prop (fieldkit's default), falls back to native `<input type="color">`.

### `CodeField<T extends FieldValues>`

Used by: `CodeField`

```ts
interface CodeFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  language?: string;        // default: "typescript"
  placeholder?: string;
  height?: string;          // default: "400px"
  indentWithTab?: boolean;  // default: true
  Editor?: React.ComponentType<MonacoEditorProps>;
}
```

Without the `Editor` prop, renders a plain `<textarea>` styled to approximate a code editor.

### `MarkdownField<T extends FieldValues>`

Used by: `MarkdownField`

```ts
interface MarkdownFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  MDEditor?: MDEditorComponent;
  minHeight?: number;       // default: 200
  maxHeight?: number;       // default: 600
}
```

Without the `MDEditor` prop, renders a plain `<textarea>` fallback.

### `ArrayField<T extends FieldValues>`

Used by: `ArrayField`

```ts
interface ArrayFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps<T>, "children"> {
  mode?: "dynamic" | "keyed";  // default: "dynamic"
  valueHeader?: string;        // default: "Value"
  keyHeader?: string;          // default: "Key"
  keys?: Array<{ key: string; value: string }>;  // for keyed mode
  addLabel?: string;           // default: "Add Field"
  removeLabel?: string;        // default: "Remove Item"
  emptyState?: React.ReactNode;
}
```

**Two modes:**
- **`dynamic`**: Users add/remove arbitrary key-value pairs. Uses `useFieldArray` internally.
- **`keyed`**: Fixed keys, users edit values only.

## Table Components (`@knkcs/anker/components`)

### `DataTable<T extends Record<string, unknown>>`

Fieldkit's `SpecDataTable` wraps this with spec-driven column generation.

```ts
interface DataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  total?: number;           // pagination: total items
  page?: number;            // pagination: current page (1-based)
  pageSize?: number;        // pagination: items per page
  onPageChange?: (page: number) => void;
  variant?: "line" | "striped" | "hoverable";
  getRowId?: (originalRow: T, index: number, parent?: Row<T>) => string;
}
```

**Key behaviors:**
- `manualSorting: true` is set when `onSortingChange` is provided (server-side sort)
- Pagination UI only renders when all four pagination props are provided
- `selectable={true}` prepends a `_select` checkbox column
- `loading={true}` renders 5 skeleton rows

**Available cell components** (exported from `@knkcs/anker/components`):

| Cell | Value Type | Key Props |
|---|---|---|
| `BooleanCell` | `boolean \| null` | `trueLabel`, `falseLabel` |
| `DateCell` | `string \| Date \| null` | `format` (dayjs), `showRelative` |
| `NumberCell` | `number \| null` | `locale`, `formatOptions` |
| `SlugCell` | `string \| null` | monospace badge |
| `CodeCell` | `string \| null` | `maxLength` (default 60) |
| `ColorSwatchCell` | `string \| null` | color swatch square |
| `CountCell` | `number \| null` | `singular`, `plural`, `suffix` |
| `TruncatedTextCell` | `string \| null` | `maxLength` (default 50) |
| `UrlCell` | `string \| null` | renders as anchor |
| `StatusBadgeCell` | `string \| null` | wraps anker `StatusBadge` |
| `ActionCell` | n/a | `actions: ActionCellAction[]` |

Utilities: `emptyCellValue` (`"—"`), `pluralize(count, singular, plural)`, `truncateText(text, maxLength)`

**Note:** Fieldkit's own `/table/cells/` does NOT use anker cells — they are standalone. Anker cells are available to consumers who build custom columns.

### `DrawerRoot`

Used by: `EditDrawer`

```ts
interface DrawerProps extends Omit<DrawerRootProps, "open" | "onOpenChange"> {
  open: boolean;
  onClose(): void;
  title: string | React.ReactNode;
  footerText?: string | React.ReactNode;
  children: React.ReactNode;
  saveLabel?: string;          // default: "Save"
  closeLabel?: string;         // default: "Close"
  saveButtonDisabled?: boolean;
  loading?: boolean;
  additionalButtons?: React.ReactNode;
  onSave?(): void;             // if absent, no save button shown
}
```

**Drawer size recipe variants:** `xl` (50vw), `xxl` (51-70vw), `full` (90vw)

**Important:** `onSave` is a click handler, not a form submit handler. Fieldkit's `EditDrawer` bridges this by having `onSave` call `formRef.current?.requestSubmit()`.

## Semantic Tokens

Use these tokens instead of hardcoded colors. Full token map:

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `bg.canvas` | Page background | `gray.50` | `gray.900` |
| `bg.surface` | Card/panel | `white` | `gray.800` |
| `bg.subtle` | Subtle background | `gray.50` | `gray.700` |
| `bg.muted` | Tags, chips | `gray.100` | `gray.600` |
| `fg.default` | Primary text | `gray.900` | `white` |
| `fg.emphasized` | Strong text | `gray.700` | `gray.100` |
| `fg.muted` | Secondary text | `gray.600` | `gray.300` |
| `fg.subtle` | Tertiary text | `gray.500` | `gray.400` |
| `border` | Default borders | `gray.200` | `gray.700` |
| `accent` | Links, emphasis | `primary.500` | `primary.200` |
| `error` | Error states | `red.600` | `red.200` |
| `success` | Success states | `green.600` | `green.200` |

**Color scales:**
- `primary.*` (UI blue, `500: #2087d7`) — for interactive elements
- `secondary.*` (brand orange, `500: #e9580c`) — for accents
- `brand.*` — for branding only (logos, headers), never for interactive UI

**Opacity tokens:** `disabled: 0.4`, `readOnly: 0.8`

## Key Patterns

### `readOnly` vs `disabled`
Anker applies `opacity: 0.8` for `readOnly` and `opacity: 0.4` for `disabled`. These are separate states. Fieldkit passes `readOnly` from `FieldProps`, not `disabled`.

### Optional editor injection
`CodeField`, `MarkdownField`, and `ColorPickerField` accept optional editor components as props. Without them, they render plain HTML fallbacks. This is consistent with fieldkit's adapter pattern.

### Table recipe variants
`DataTable` accepts `variant`: `"line"` (default, bottom borders), `"striped"` (odd rows gray), `"hoverable"` (hover highlight).
