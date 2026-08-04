# core ↔ fieldkit alignment

Working document for the effort to make fieldkit replace knkCMS core's field renderer and specification editor. It records what has been decided, what the source disagrees with the original comparison about, and what is still open.

**Sources read** 2026-08-03: fieldkit at `70d4034`, core at `d6d7ec0` (main). Both repos move — re-verify before acting on any fact below.

## Decided

| Decision | Record |
|---|---|
| The catalogue stays generic; core registers its five publishing types as plugins | [ADR-0002](./adr/0002-generic-catalogue-domain-types-belong-to-consumers.md) |
| `fieldset` embeds a blueprint through the adapter, not as inline children | [ADR-0003](./adr/0003-fieldset-is-an-adapter-backed-blueprint-embed.md) |
| `resolveSpec()` expands adapter-backed containers before the Zod schema is built | [ADR-0004](./adr/0004-resolve-specs-before-building-zod.md) |
| `list` is its own field type, not a third `array` mode | [ADR-0005](./adr/0005-list-is-its-own-type-not-an-array-mode.md) |
| Card-ness is a `card` marker, not `section.render_card` | [ADR-0006](./adr/0006-card-markers-over-a-section-render-card-flag.md) |

fieldkit therefore implements exactly two new field types — `list` and `fieldset`.

## Corrections to the 2026-08-03 comparison

Each was read from source, and each contradicts the handoff that framed this work.

1. **`group` is not a divergence.** Core's group repeats too — *"Group is used to repeat a group of fields"* (`internal/model/miscellaneous/group.go:20`). Only the settings differ: fieldkit adds `min_items`/`max_items`, core has none.
2. **`list` cannot become an `array` mode.** Core's list value is `string[]` (`list-field.tsx:49`), while fieldkit's `dynamic` mode yields `{key, value}[]` and `keyed` yields `Record<string, string>`. No existing mode holds it.
3. **Core's `array` settings exist** — the comparison recorded this as unresolved. They are `{ key_header?, value_header? }`, column labels for a key/value table (`array-field.tsx:20-21`). Fieldkit's `mode`/`keys` configure *shape* instead, and fieldkit's `keyed` mode has no core counterpart at all.
4. **`section` is not "the opposite purpose".** Core's `build-section-tabs.ts` is the same algorithm as `partitionSchemaBySections()`: flat scan, marker opens a tab, pre-marker fields fall into a synthetic tab. Both projects already use flat sibling markers, so [ADR-0001](./adr/0001-flat-sibling-layout-markers.md) describes a shared model rather than a contested one.
5. **`fieldset` embeds by blueprint reference, not local nesting** (`FieldsetSettings{ Blueprint string }`, rendered with `fieldNamePrefix`), and carries a frontend-only `collapsible` setting that has no Go struct field.
6. **`field-type-blueprint-array/`** exists in core's frontend with no matching `RegisterFieldType` — it is not among the 27 registered types. Dead code or an unregistered variant; unverified.
7. **Tab orientation defaults disagree.** Fieldkit defaults to `"horizontal"` (`partition.ts:44`); core renders vertical tabs. Any migration must write `orientation: "vertical"` explicitly or existing forms silently change layout.

## Open

### The settings-ownership root

ADR-0002 settles who owns a *field type*. It does not settle who owns a **shared type's settings vocabulary**, and that single unanswered question is what makes the items below heavy. They are all the same shape: core has settings fieldkit doesn't, with live data behind them.

Two facts constrain any answer:

- Fieldkit **replaces the settings object wholesale** — `settings-section.tsx:31` does `onFieldChange({ ...field, settings: next })`, so unknown keys survive only if a plugin's settings component happens to spread them. Pass-through is not guaranteed, and a core-only key is one panel edit away from being dropped.
- A consumer **can substitute a built-in by id** — `provider.tsx:21` builds `new Map(plugins.map(p => [p.id, p]))`, last wins. Note `registry.register()` throws on a duplicate id; the provider path does not.

### Parked

- **B1 `rich_text`** — core `settings.text_type` + `"default" | "minimal"`; fieldkit `settings.editor_spec` + `"full" | "compact"`. 88 fields, 32 seeded `view_mode` values, hand-authored SQL. Note fieldkit is already internally inconsistent here: the id in `settings.editor_spec` is consumed by `adapters.textType.getEditorSpec()`. mediahub sets neither key, so changing fieldkit's names breaks no current consumer.
- **B2 `date`** — core's `validity_role` (`valid_from` / `valid_until` / `published_date`) drives version switching in `pkg/model/validity_*.go` and the knk-content branch UI. Nothing in the date *input* reads it (`date-field.tsx` reads only `locale`), but the config panel must still set it. `locale` is generic; `validity_role` is not.
- **`FieldContext`** — `"blueprint" | "task" | "form"` (`plugin.ts:16`) is the last hard-coded knkCMS concept in fieldkit's public *types*, as opposed to its adapter surface. Widen, parameterise, or keep.
- **Unknown-settings preservation** — whether fieldkit guarantees it, or contractually requires settings components to spread.

### Not yet walked

B5 `virtual_table` (core's code-emitted inline `fields` variant — does fieldkit need it?), B6 `array` settings reconciliation now that the facts are known, B7 minor divergences in `textarea` and `number`. (`toc_reference` was on this list; it left fieldkit's catalogue on 2026-08-04 per ADR-0010, so there is nothing left to reconcile.)

## Related

- `blueprint-review` (`/Users/jeskoiwanovski/repo/skills/blueprint-review/PREVIEW.md`) encodes the live / adapter-stubbed / inlined / placeholder classification built on the original comparison. ADR-0002 makes its "placeholder" class permanent for core's five publishing types.
