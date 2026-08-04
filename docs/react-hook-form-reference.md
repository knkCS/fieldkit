# React Hook Form Reference for Fieldkit

This document describes fieldkit's react-hook-form integration patterns. Read this before creating or modifying any field component, editing `EditDrawer`, or changing the Zod integration.

**Versions:** react-hook-form 7.71.x, @hookform/resolvers 3.10.x

## The Fundamental Contract: External FormProvider

Fieldkit **never calls `useForm()`** in any renderer or field component. The consumer owns the form instance and wraps fieldkit with `FormProvider`.

```tsx
// Consumer creates and owns the form
const methods = useForm({
  resolver: zodResolver(specToZodSchema(spec.fields, plugins)),
  defaultValues: getDefaultValues(spec.fields),
  mode: "onBlur",
});

// Consumer wraps fieldkit
<FormProvider {...methods}>
  <form noValidate onSubmit={methods.handleSubmit(handleSave)}>
    <FieldKitProvider plugins={plugins} adapters={adapters}>
      <FieldRenderer schema={spec.fields} />
    </FieldKitProvider>
  </form>
</FormProvider>
```

### `noValidate` is not optional

Field components render the native `required` attribute, so a consumer's
`<form>` **must** carry `noValidate`. Without it the browser validates first:
it blocks the submit before react-hook-form sees it, and replaces the Schema's
per-field messages with its own bubble.

Inside `SpecForm` it is worse than cosmetic. Inactive tabs stay mounted but
hidden (react-hook-form needs every panel in the DOM), and a browser refuses to
submit a form holding an invalid control it cannot focus — so a required-empty
field on an inactive tab makes Save do *nothing*, with only a console message
to show for it. `SpecForm`'s jump-to-the-offending-tab behaviour exists for
exactly that case and can only run once the submit reaches react-hook-form.

The forms fieldkit owns — `EditDrawer` and the editor's Try-it view — set it
themselves.

### Why this matters

If fieldkit called `useForm()` internally, consumers couldn't:
- Pre-populate forms with server data
- Run `handleSubmit` with their own save logic
- Access `formState.isDirty` for unsaved-changes warnings
- Call `reset()` after saves
- Apply custom `zodResolver` overrides
- Wire the form to their own `<form>` element

### The exceptions: forms that are not the consumer's

A component may own a `useForm()` when the values it collects are **not part of
the consumer's payload**. Each still wraps its internals with
`<FormProvider {...methods}>` so `FieldRenderer` works inside it, and the
nested provider is exactly what keeps the two form states apart.

| Where | Whose values |
|---|---|
| `src/table/edit-drawer.tsx` | A row being edited — a self-contained compound component |
| `src/renderer/fields/reference-picker-drawer.tsx` | The Reference picker's **filter** form. The adapter describes its filters as a Spec (ADR-0009) and fieldkit renders them with its own renderer; the values go straight back to `search()` as an opaque record and must never reach the form the consumer owns |
| `src/editor/try-it-view.tsx`, `src/editor/editor-canvas.tsx` | The editor's scratch forms — nothing an Author fills in here is ever submitted |

Note what the second one is *not*: a field component calling `useForm()` for
its own value. The Reference field itself takes its value from
`useFormContext()` like every other field; only the drawer's throwaway filter
form is separate.

## Import Inventory

### Production code

| Hook/Component | Used In | Purpose |
|---|---|---|
| `useFormContext` | All field components, `slug-field` | Access form state from `FormProvider` |
| `Controller` | `select`, `list`, `media`, `rich-text`, `virtual-table` | Controlled field render-prop |
| `useWatch` | `reference`, `single-reference`, `reference-picker-drawer` | Read a value without owning the control that writes it |
| `useFieldArray` | `blocks-field`, `group-field` | Dynamic array management |
| `useFormState` | `reference-field` | Subscribe to the errors under one name without re-rendering on every keystroke |
| `get` | `reference-field` | Read an error at a dotted path (`related.0.children.1`) out of the nested `errors` object |
| `FormProvider` | `edit-drawer`, `reference-picker-drawer`, `try-it-view`, `editor-canvas` | Wrap an internal form |
| `useForm` | `edit-drawer`, `reference-picker-drawer`, `try-it-view`, `editor-canvas` | Create a form instance (the exceptions above) |
| `zodResolver` | `edit-drawer` | Zod validation adapter |

The Reference field components read with `useWatch` and write through anker's
`FormField` render prop rather than a `Controller` of their own — anker's
`FormField` is a `Controller` underneath, so a second one would be redundant.

`ReferenceField` additionally reads `useFormState({ name })` and `get`. That is
the one place a fieldkit field looks at errors itself, and the reason is the
`max_depth` cap: it reports at the *offending Reference's* path, so the message
lands at `related.0.children.1` and never on the field's own node — which is the
only node `FormField` renders a message for. `get(errors, accessor)` is how the
field reaches its own error subtree; walking it is `nestedErrorMessages`. A
field whose Schema reports only at its own path needs none of this.

### Never used in production

- `useController` — `Controller` component used instead
- `register` — only in tests; anker handles registration internally for simple fields

## Four Patterns for Form Integration

### Pattern A: Delegation to anker (simple fields)

Fields like `TextField`, `EmailField`, `UrlField`, `BooleanField`, `NumberField`, `DateField`, `TimeField`, `RadioField`, `TextareaField` do **not** call `useFormContext()` directly. They delegate to anker's form components (`InputField`, `SwitchField`, etc.), which handle `useFormContext` internally.

```tsx
// text-field.tsx — no useFormContext call
export const TextField = ({ field, readOnly }: FieldProps<TextSettings>) => (
  <InputField
    name={field.config.api_accessor}
    label={field.config.label}
    placeholder={field.settings?.placeholder}
    readOnly={readOnly}
    required={field.config.required}
  />
);
```

### Pattern B: Controller for complex values

Fields managing non-primitive values (arrays, objects, JSON) use `Controller`:

```tsx
const { control } = useFormContext();

<Controller
  name={accessor}
  control={control}
  render={({ field: formField }) => (
    // formField.value, formField.onChange, formField.onBlur, formField.ref
    <CustomComponent value={formField.value} onChange={formField.onChange} />
  )}
/>
```

**Naming convention:** Always destructure as `{ field: formField }` to avoid shadowing fieldkit's `field` prop (`FieldProps`). This is consistent across every file using `Controller`.

Used by: `select-field` (multi), `list-field`, `media-field`, `rich-text-field`, `virtual-table-field`

### Pattern C: watch + setValue for derived fields

`slug-field.tsx` subscribes to another field's changes and auto-derives a slug:

```tsx
const { watch, setValue } = useFormContext();

useEffect(() => {
  const subscription = watch((formValues, { name }) => {
    if (name === sourceField) {
      const sourceValue = formValues[sourceField];
      if (typeof sourceValue === "string") {
        setValue(config.api_accessor, toSlug(sourceValue));
      }
    }
  });
  return () => subscription.unsubscribe();
}, [sourceField, watch, setValue, config.api_accessor]);
```

### Pattern D: useFieldArray for repeaters

`blocks-field.tsx` and `group-field.tsx` manage dynamic arrays:

```tsx
const { control } = useFormContext();
const { fields: items, append, remove, move } = useFieldArray({
  control,
  name: accessor,
});
```

Always use `item.id` (RHF's stable ID) as the React `key`, never the array index.

## Nested Field Paths

Fieldkit uses **path rewriting** for nested fields. When `GroupField` or `BlocksField` renders children, it prepends the parent path:

```tsx
<FieldRenderer
  schema={childFields.map((child) => ({
    ...child,
    config: {
      ...child.config,
      api_accessor: `${accessor}.${index}.${child.config.api_accessor}`,
    },
  }))}
/>
```

This produces paths like `sections.0.heading`, `content_blocks.2.body`. RHF interprets dots as nested object paths, so `formState.values.sections[0].heading` works automatically.

Each leaf field component sees a flat, fully-qualified `api_accessor` and registers it normally. Only `GroupField` and `BlocksField` perform path construction.

## Zod Integration

### `specToZodSchema(fields, plugins, options?)`

Located in `src/schema/zod-builder.ts`. Converts a `Field[]` spec into a `ZodObject`:

1. For each field, calls `plugin.toZodType(field, composeChildren)` to get the base Zod type
2. Wraps with `.optional()` if `field.config.required` is false
3. Applies `options.overrides[accessor]` if provided
4. Returns `z.object(shape)`

`composeChildren` is the second argument a container plugin can use to build an
object schema from `field.children`, by the same rules (ADR-0007) — that is how
a resolved `fieldset` validates its children. Plugins that ignore it are
unaffected. Overrides apply at the top level only; they are not passed down
into children.

### Consumer override pattern

```ts
specToZodSchema(fields, plugins, {
  overrides: {
    email: (base) => base.pipe(z.string().email("Must be valid")),
  },
});
```

### `getDefaultValues(fields, plugins?)`

Builds the `Record<string, unknown>` that seeds `useForm({ defaultValues })`. Per
field: an explicit `config.default_value` wins; otherwise, when `plugins` is
passed, the field's plugin `defaultValue(field)` seeds it (#38). Markers and
hidden fields are skipped, and a field whose plugin has no `defaultValue` is
left out entirely.

The record is flat except where a container plugin nests one: a resolved
`fieldset` composes its children's defaults under its own accessor, so
`address` seeds `{ street: "", city: "" }` (ADR-0007).

## Form Value Typing

Fieldkit does **not** use TypeScript generics to type form values through RHF. All `useForm()` and `useFormContext()` calls are unparameterized — form values are `Record<string, unknown>` or inferred from `defaultValues`.

This is pragmatic: field specs are runtime data (JSON from a server). Zod provides runtime validation; TypeScript safety stops at the spec definition level.

## Context Architecture

Two independent React contexts coexist:

```
<FieldKitProvider>      // provides: plugin registry + adapters
  <FormProvider>        // provides: form state (react-hook-form)
    <FieldRenderer />   // accesses both via useFieldKit() and useFormContext()
  </FormProvider>
</FieldKitProvider>
```

The nesting order doesn't matter — neither context depends on the other.

## Rules for New Field Components

1. **Never call `useForm()` for the field's own value** — use `useFormContext()`. A `useForm()` is only ever for values that are not the consumer's payload at all; see "The exceptions" above before adding one
2. **Prefer anker form components** for simple inputs — they handle RHF registration
3. **Use `Controller`** for complex/custom inputs — destructure as `{ field: formField }`
4. **Use `useFieldArray`** for repeaters — always key by `item.id`
5. **Path rewriting** for nested fields — prepend `${parentAccessor}.${index}.`
6. **Implement `toZodType()`** in the field's schema plugin for validation
