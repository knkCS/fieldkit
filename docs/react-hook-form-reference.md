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
  <form onSubmit={methods.handleSubmit(handleSave)}>
    <FieldKitProvider plugins={plugins} adapters={adapters}>
      <FieldRenderer schema={spec.fields} />
    </FieldKitProvider>
  </form>
</FormProvider>
```

### Why this matters

If fieldkit called `useForm()` internally, consumers couldn't:
- Pre-populate forms with server data
- Run `handleSubmit` with their own save logic
- Access `formState.isDirty` for unsaved-changes warnings
- Call `reset()` after saves
- Apply custom `zodResolver` overrides
- Wire the form to their own `<form>` element

### The one exception: EditDrawer

`src/table/edit-drawer.tsx` owns its own `useForm()` because it's a self-contained compound component. It still wraps internals with `<FormProvider {...methods}>` so `FieldRenderer` works inside it.

## Import Inventory

### Production code

| Hook/Component | Used In | Purpose |
|---|---|---|
| `useFormContext` | All field components, `slug-field` | Access form state from `FormProvider` |
| `Controller` | `select`, `reference`, `toc-reference`, `media`, `rich-text`, `virtual-table` | Controlled field render-prop |
| `useFieldArray` | `blocks-field`, `group-field` | Dynamic array management |
| `FormProvider` | `edit-drawer` | Wrap internal form |
| `useForm` | `edit-drawer` | Create form instance (exception) |
| `zodResolver` | `edit-drawer` | Zod validation adapter |

### Never used in production

- `useController` — `Controller` component used instead
- `register` — only in tests; anker handles registration internally for simple fields
- `useWatch` — `watch` from `useFormContext` used in `slug-field` instead

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

**Naming convention:** Always destructure as `{ field: formField }` to avoid shadowing fieldkit's `field` prop (`FieldProps`). This is consistent across all six files using `Controller`.

Used by: `select-field` (multi), `reference-field`, `toc-reference-field`, `media-field`, `rich-text-field`, `virtual-table-field`

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

1. For each field, calls `plugin.toZodType(field)` to get the base Zod type
2. Wraps with `.optional()` if `field.config.required` is false
3. Applies `options.overrides[accessor]` if provided
4. Returns `z.object(shape)`

### Consumer override pattern

```ts
specToZodSchema(fields, plugins, {
  overrides: {
    email: (base) => base.pipe(z.string().email("Must be valid")),
  },
});
```

### `getDefaultValues(fields)`

Extracts `field.config.default_value` for each field into a flat `Record<string, unknown>`. Used to seed `useForm({ defaultValues })`.

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

1. **Never call `useForm()`** — use `useFormContext()` if you need form state
2. **Prefer anker form components** for simple inputs — they handle RHF registration
3. **Use `Controller`** for complex/custom inputs — destructure as `{ field: formField }`
4. **Use `useFieldArray`** for repeaters — always key by `item.id`
5. **Path rewriting** for nested fields — prepend `${parentAccessor}.${index}.`
6. **Implement `toZodType()`** in the field's schema plugin for validation
