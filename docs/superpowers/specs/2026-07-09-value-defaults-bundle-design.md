# Value-defaults bundle (fieldkit 0.7.0): #38 + #37 + #36

**Date:** 2026-07-09
**Issues:** [#38](https://github.com/knkCS/fieldkit/issues/38) per-type value
defaults, [#37](https://github.com/knkCS/fieldkit/issues/37) key-order-
insensitive echo compare, [#36](https://github.com/knkCS/fieldkit/issues/36)
saveFailed toast description.
**Release:** one branch, one release — **0.7.0** (new plugin-contract member,
`getDefaultValues` behavior change, new SpecEditor prop). Tag push requires
explicit per-release OK.

## Context

All three issues were filed from the mediahub fieldkit-0.5.0/0.6.0 migration
and the spec-composed asset-detail runtime gates. mediahub currently carries a
stopgap (`FIELD_TYPE_DEFAULTS` map + `UNSEEDED_FIELD_TYPES` list +
registry-pinning tests in `packages/mediahub-ui/src/lib/asset-metadata-form.ts`)
that duplicates knowledge belonging to fieldkit's plugins. When 0.7.0 lands,
mediahub deletes the map and the pins (hygiene-bundle follow-up), and the
still-unseeded set shrinks to the plugins that deliberately omit a default.

## 1. #38 — per-type value defaults (schema layer)

### Plugin contract

`FieldTypePlugin` gains an optional value-level member (distinct from
`defaultSettings`, which seeds *settings*, not form values):

```ts
/** Sane form-value default for a field of this type when the spec has no
 * explicit config.default_value. Function form for settings-dependent
 * shapes. Omit when no safe default exists (field stays undefined). */
defaultValue?: unknown | ((field: Field<TSettings>) => unknown);
```

### getDefaultValues

```ts
getDefaultValues(fields: Field[], plugins?: FieldTypePlugin[])
```

- Without `plugins` (today's callers): unchanged sparse behavior — only
  explicit `config.default_value` entries.
- With `plugins`: every visible (`!hidden`), non-structural field gets a
  value: explicit `config.default_value` wins; else the plugin's
  `defaultValue` (function form called with the field); plugins that omit
  `defaultValue` leave the field undefined (key omitted).
- Fieldkit-internal callers all pass plugins: `try-it-view.tsx` and
  `editor-canvas.tsx` (SpecEditor's plugin set), `edit-drawer.tsx` (provider
  registry), `defineSpec()` (new optional `plugins` option; without it,
  sparse as today).

### Built-in defaults

Mirrors mediahub's battle-tested map, extended where the function form or the
zod change (below) makes seeding newly safe:

| Plugin | defaultValue |
|---|---|
| text, textarea, email, url, code, markdown | `""` |
| slug | `""` (safe once optional constrained strings accept `""`) |
| number | `0` |
| boolean | `false` |
| checkboxes, media, group, array, blocks, virtual_table | `[]` |
| select, reference | fn: multi/array-shaped settings → `[]`, else `""` |
| rich_text, date, time, color, radio, toc_reference | omitted — no safe scalar (matches mediahub's deliberate unseeded set) |
| section (structural) | n/a — skipped |

A registry test pins every built-in plugin's declared/omitted `defaultValue`
in both directions (mediahub's pin test moves here). Exact zod-compatibility
of each default is asserted by parsing the seeded value against the plugin's
own `toZodType` for optional fields.

Note: the still-unseeded types keep mediahub #72's Discard dirty-state quirk
(RHF cannot re-baseline an omitted key) — narrowed, not dissolved.

### Zod half: optional constrained strings accept ""

`specToZodSchema` currently gives `.or(z.literal(""))` only to
*unconstrained* optional strings, deliberately excluding min/max/regex-checked
ones. That makes an optional slug impossible to clear ("" fails the regex).
Flip to **"empty or valid"**: all optional string types get
`.or(z.literal(""))` regardless of checks. `""` stays in the parsed output
(consistent with the existing unconstrained path; no transform to undefined).
Required fields are unaffected — `""` still fails their min/regex checks.

## 2. #37 — key-order-insensitive echo compare

`use-spec-draft.ts` compares the incoming `schema` prop against baseline and
draft via `JSON.stringify` byte-equality. Postgres jsonb re-orders object keys
on read-back, so a post-save refetch echo never byte-matches, and an edit made
inside the refetch window fires a spurious `baselineConflict` toast.

Replace both stringify comparisons (schema-vs-baseline, schema-vs-draft) with
a small internal `deepEqual` (module-private to the editor layer): objects
compare key-order-insensitively, arrays order-sensitively (field order is
meaning), primitives by `Object.is`, and `undefined`-valued keys are treated
as absent (parity with JSON.stringify/jsonb round-trips, which drop them).
The `baselineJson` memo is removed.
Behavior change: reordered-but-content-equal echoes now take the
"content-equal → ignored" path. Conflict detection for *genuinely* different
content is unchanged.

## 3. #36 — saveFailed toast description

New SpecEditor prop:

```ts
/** Formats a rejected onCommit reason into the saveFailed toast description.
 * Return null to suppress the description. Default: Error → message,
 * otherwise String(reason). */
formatSaveError?: (reason: unknown) => string | null;
```

Applied in the existing saveError effect (`spec-editor.tsx` ~line 308):
`toaster.create({ title: mergedLabels.saveFailed, description, type: "error" })`
with the description omitted when the formatter returns `null` (or the
default formatter yields an empty string). The label table is untouched;
hosts translate/sanitize/opt out through the one hook. The saveError plumbing
in `use-spec-draft` already retains the rejection reason.

## Testing

TDD per item:
- **#38:** registry pin (all built-ins, both directions); seeded-values-parse-
  against-own-zod property test; getDefaultValues with/without plugins;
  explicit `default_value` precedence; hidden/structural skip; select/
  reference function-form both settings shapes; optional slug/email accept ""
  while required still reject; existing zod-builder suite stays green.
- **#37:** reordered-clone echo adopts silently on clean draft; reordered echo
  with dirty draft does NOT fire baselineConflict; genuinely-different schema
  still fires it; referential and byte-equal fast paths preserved.
- **#36:** rejection with Error → description = message; non-Error →
  String(reason); custom formatter wins; null suppresses description;
  title-only rendering unchanged when suppressed.

## Out of scope

- mediahub-side deletion (stopgap map, unseeded list, pins, fieldkit bump) —
  hygiene bundle.
- `defineSpec()` plugin auto-wiring beyond the optional param.
- Any change to `defaultSettings` semantics or the editor's field-creation
  defaults (`draft-ops.ts createField`).
