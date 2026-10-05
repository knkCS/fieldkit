# Migrating to 0.18

The migration section of the 0.18 release notes. 0.18 ships first as
`0.18.0-rc.N` release candidates; 0.18.0 itself, which freezes the data
contract, comes with blueprinthub's first real Blueprint Release (ADR-0024,
#223 D1). taskhub and mediahub stay on 0.17.x until then.

Each item names the ticket that made the change; the notes were collected on
the release ticket, #223. The per-type mappings for core's publishing types
are in [`knkcms-core-parity.md`](knkcms-core-parity.md), "Migrating core's
publishing types (0.18.0)", and are summarised here, not repeated.

Items still being built for 0.18 are marked **(open: #N)** — the decision is
taken, the code has not landed.

## Spec changes

Settings are strict (ADR-0018): a key a type does not declare is
`unknown_setting`, so each rename or removal below is a Spec migration.

- **`rich_text`:** `editor_spec` is `unknown_setting`; it becomes `text_type`,
  a Text Type Release Pin (#216). Rename the key and point it at a Text Type
  Release. See also [Deprecations](#deprecations).
- **`reference`:** `blueprints: ["x"]` becomes `[{blueprint: "x"}]`, the
  `attributes` setting becomes `spec`, and `pin_mode: "version"` is removed —
  migrate it to `none` or `release`. Reference settings are strict (#215).
- **`virtual_table`:** `always_latest` is removed; a Pin always names a fixed
  Release (ADR-0020, #212).
- **`date`:** core's `min`, `max`, `enable`, `locale` and `validity_role` are
  `unknown_setting` (#207). `validity_role` is in production data (Boorberg
  legal_norm, [parity B3](knkcms-core-parity.md#b3-date--different-names-and-two-core-only-concepts));
  fieldkit keeps rejecting it and contenthub's cutover converts it (#223 D13,
  knkCS/contenthub#49).
- **`section`:** core's `render_card` is `unknown_setting` (#207); a card is
  the `card` marker (ADR-0006).
- **First frozen settings shapes** (#205): the `group` caps are non-negative
  integers, and `number.step` is positive. A stored Spec outside them is
  `invalid_setting`.
- **Positions:** `positions` gains `block_type` on every Catalogue type
  (#209).
- **Validations per type** (#313): a Catalogue entry lists the validations
  its type honours (`validations`), and any other is
  `inapplicable_validation`, at the key. `validation.min_length` and
  `max_length` stay on `text`, `textarea`, `code` and `markdown`;
  `validation.pattern` (with `pattern_message`) on `text`; `config.unique:
  true` on `text`, `email`, `url`, `slug` and `number`. Everywhere else they
  were silently ignored — a `min_length` on a date — so drop them: a date's
  limits are `settings.min_date`/`max_date`, a number's `settings.min`/`max`.
  `unique: false` and Unset validation declare nothing and stay valid. Hosts
  re-validate on save, not on read, so a stored Spec still loads; its next
  save is refused until the key is dropped, and the editor shows it in the
  Validation tab so the author can.
- **Blueprint ids are Release ids:** the blueprint adapter's ids are Blueprint
  **Release** ids, and a Pin is a single opaque Release id string (#212).
- **Publishing package** (#219, #220, #221):
  - `outline_tree`: core's `text_type_id` becomes `text_type` (a Text Type
    Release Pin), `blueprint` becomes a Blueprint Release Pin inlined as
    `children`, and `levels` is dropped (`unknown_setting`).
  - `manipulation_tree`: a Reference Field's settings, plus
    `replacement_blueprints` and `annotation_spec`; core's `always_latest` and
    frontend-only keys are `unknown_setting`.
  - `template_text`: `context_blueprints` is its only setting.

## Value changes

- **Forms submit canonical values:** Unset keys are stripped, and EditDrawer
  keeps a cleared field cleared (#210, ADR-0021).
- **`array`'s dynamic pairs** accept a missing `key` or `value`; a blank half
  is stored as absent. This slightly widens what the form accepts (#210).
- **Rows and nodes carry an `_id`** (ADR-0023, #211). Legacy rows get ids
  minted into the form's defaults (TS `mintMissingIds`); Go importers call
  `MintIDs`.
- **Value depth cap:** 128 levels over fieldkit's structure only (#223 D5,
  #280); #211 shipped 32 (TS `VALUE_CAPS.maxDepth`, Go `MaxDepth`, code
  `too_deep`). A rich-text document's inner depth is knkeditor's to limit
  (knkcms/knkeditor#689). The item and byte caps still count everything,
  documents included.
- **Unset stops at the rich-text document;** inside it, knkeditor's rules apply
  (ADR-0025, #223 D2b, #280): `attrs: null` or `attributes: {}` inside a
  document is valid and isn't stripped, in forms, EditDrawer and Go alike. A
  rich_text Field whose value is `{}`, `null` or absent is still Unset. The
  public TS `canonicalValue()` knows no Spec and still strips inside documents
  (#295).
- **`reference`:** `attributes` becomes `values`, `_id` is required on every
  node, and `pin` is a string only (no `null`). Go importers map `attributes`
  → `values` and call `MintIDs` (#215).
- **`outline_tree`:** a node is `{_id, values?, children?}` — every key but
  `children` moves into `values` (#220). Nodes are strict, and carry three
  optional keys for TOC generation (#286): core's `generated: true/false`
  becomes `origin: generated/manual` (absent stays absent); `overridden: true`
  stays `true` (write it only when true: `false` is a value and would compare
  as a change); `source`, the Content id a node was generated from, is copied
  as it is (`null` → absent). Mapping in `docs/knkcms-core-parity.md`.
- **`manipulation_tree`:** a node is `{_id, id, intent, pin?, values?, with?,
  children?}`, with intent `include | exclude | replace | annotate`.
  Converting core's stored `{includes, manipulations, nodes, events}` is
  contenthub's cutover job (#219).
- **`ti_overlay`:** drop `published`/`drafts`/`status`/`label`/
  `base_revision_id`/`oasys_response`, rename `id` → `_id`, convert anchors to
  `{node, offset, before, after}` at the Cutover, and store empty values as
  absent (#221). Entries get a required `content` (the Content
  the anchor is in) and an optional `pin` (#223 D3, #281): the cutover fills
  `content` from the Content core anchored into. blueprinthub owns the TI Set Release format;
  fieldkit reads `{instructions: [{code}]}` only (#223 D9,
  knkCS/blueprinthub#2).

### Content Graph edges and search text

What a value yields to contenthub's Content Graph and to search changes too:

- **Hidden Fields hold data** (#223 D4, #282). `hidden` is a UI flag: the
  form still skips a hidden Field (`specToZodSchema`, `getDefaultValues`), but
  stored data is read whole, at every depth:
  - `Edges` / `edges()` ignore `hidden`: a hidden Field's References and
    Assets yield their edges, so the Content Graph stays complete.
  - `ValidateValue` / `validateValue()` check a hidden Field's value when it
    is present, but never report it `required` — no form can fill it — and
    the same holds for every Field inside a hidden one (a hidden group's
    rows). A hidden Field holding an invalid value is an error.
  - `Texts` / `texts()` skip a hidden Field — and every Field inside one —
    unless its own `config.search` is set; then it weighs that (`off` still
    yields none).

  #214 first shipped all three skipping hidden Fields: no edges, no text,
  and no check of their values.
- **Choice types' option labels are searchable** (#223 D6, #283): `select`,
  `radio` and `checkboxes` have `has_text`; their text is the labels of the
  selected keys, one per line in selection order, and a key without a label
  yields none. `config.search` is now valid on them.
- **`reference_filter` yields `exclude` edges** (#223 D8, #285), one per
  distinct id (an id listed twice is one edge, as a media Field's Asset is),
  at the Field inside the Reference's `values`, target `{content}` with no
  Pin (Go `EdgeExclude`, TS `EXCLUDE_EDGE_KIND`); #218 shipped none.
- **`ti_overlay` entries yield `anchor` edges** (#223 D3, #281), one per entry,
  target `{content, pin?, anchor: node}`;
  #221 shipped none.
- **Confirmed as shipped** (#214): media edges sit at the Field's path, and a
  duplicate Asset gives one edge; a keyed Array's text orders its keys by
  UTF-16 code units.

## TS API breaks

- **Removed** (#209): `FieldContext`, `availableIn`, `getByContext`,
  `VIRTUAL_TABLE_ROW_FIELD_TYPES` and `isVirtualTableRowFieldType`.
  `createReferencePlugin` no longer takes `availableIn`.
- **Renamed** (#209): the editor's `context` prop is now `consumer`. Plugins
  declare `consumers` and `positions`, and containers
  `childrenPosition`/`heldSpecs`.
- **`resolveSpec`** returns the envelope `{catalogue, vocabulary, fields,
  parts}` and rejects with `ResolveSpecError`. It now reaches Block Types and
  the Reference Spec (#212).
- **SpecEditor's `onCommit`** receives canonical settings (#210).
- **Reference** (#215):
  - `PinMode`/`PinningMode` lose `"version"`
  - `ReferenceSettings`/`SingleReferenceSettings` change shape
  - `ReferenceTree` props: `attributeSpec` → `referenceSpec`,
    `onOpenAttributes` → `onOpenValues`
  - test ids `reference-values-*`, `reference-read-value`, `reference-spec-*`
  - `useResolvedContentNames` also returns `blueprints`
  - the reference `max_items` cap reports `too_many_items`
- **The `textType` adapter speaks Text Type Releases** (#278): its
  `getEditorSpec(id)`, `getGlobalSettings()` and `listEditorSpecs()` become
  `get(releaseId)` — a resolved Text Type, the same `PartFetcher` that
  `resolveSpec()` takes as `parts.text_type` — and an optional `list()` of
  `TextTypeSummary` (`{id, name}`) for the config panel's picker. The Editor
  Settings move to their own optional adapter, `editorSettings: { get() }`.
  `EditorSpecData` and `EditorSpecGlobalSettings` are removed from
  `/renderer`; import `TextTypeSummary` instead. To migrate: pass your Text
  Type Release fetcher as both `adapters.textType.get` and
  `resolveSpec`'s `parts.text_type`, and rename `listEditorSpecs` to `list`.
- **The `select` field renders through anker's `BaseSelectField`** (#314),
  single and multiple alike, where it was a native `<select>` (anker's
  deprecated `SelectField`, and a raw `<select multiple>`). That raises the
  `@knkcs/anker` peer floor to **`^5.5.0`**, the first anker shipping
  `BaseSelectField` — install it alongside this release. The stored value is
  unchanged (a key, or an array of keys); a cleared single select now holds
  `null` in the form rather than `""`, which `selectPlugin.toZodType` reads as
  the same Unset (ADR-0021), so a submitted form still omits it. Tests that
  drove the native control (`getByRole("listbox")`, `<option>` elements) now
  find a `combobox` and open its menu.
- **The core renderer's `rich_text` field is read-only** (#278, ADR-0026): it
  shows the document's text and says it can't be edited there, where it was a
  JSON textarea. It never writes the value. Editing needs
  `@knkcs/fieldkit/rich-text` (below).

**Additive:** `validateValue` from `/schema` (#210); `specPins`,
`RESOLVE_CAPS`, `CATALOGUE_VERSION` and `validateSpec`'s `resolved` option
(#212); `mintMissingIds`, `copyRows`, `toIdPath` (#211); `ValueContext`,
`settingsRules`, `referenceSpecFor`, `referenceBlueprintIds` (#215);
`FieldKitProvider`'s `parts` prop — the Resolved Spec's `parts`, where a
Field finds what it pins (#278).
`accessorFromName` and `ACCESSOR_MAX_LENGTH` from `/schema` (#312): the
Accessor a name suggests, which the editor now derives through. It spells out
German letters (`Straßenname` → `strassenname`, where it was `straenname`),
strips other accents, cuts at 64 characters and derives nothing for a name
starting with a digit. Only Accessors derived from now on change: a stored
one is never re-derived.
`formDefaults` from `/schema` (#332): a form's seed — the stored value over
the spec defaults, missing row `_id`s minted — so a form that outlives
`SpecForm` is clean and valid without it mounted; `EditDrawer` seeds through
it. `SpecForm`'s `recordKey` prop (#339). `SpecForm` now remembers, per form
and record, the open section and the failed save it has jumped for, so a
Consumer that unmounts it and keeps its form (a Save in the page header,
anker ADR 0004) gets both back on a remount (#333, #334); see "A
Consumer-owned Save across unmounting tabs" in `spec-form.mdx`.

### `@knkcs/fieldkit/rich-text` (#278)

A new, opt-in subpath (ADR-0026): the knkeditor-backed `rich_text` field.
`knkRichTextPlugin` is `{ ...richTextPlugin, fieldComponent:
KnkRichTextField, readComponent: KnkRichTextRead }`; pass it in place of the
built-in plugin and hand `resolveSpec(...).parts` to `FieldKitProvider`. Its
optional peers are `@knkcms/knkeditor-editor` `^1.8.0` and
`@knkcms/knkeditor-vocabulary` `^0.1.0`, plus the peers knkeditor-editor
declares (TipTap 3, i18next, react-i18next, react-icons, emotion, its
extension packages). No other subpath imports them. Details in
[`knkeditor-reference.md`](knkeditor-reference.md).

## Go API

- **New:** `MintIDs` (#211), `ValidateResolvedValue` (#216),
  `WithTargetBlueprints` (#215).
- **`rich_text`** delegates validation, edges, text, Compare and Merge to
  knkeditor's Go module (#216, [`knkeditor-reference.md`](knkeditor-reference.md)).
  The TS/Go rich_text parity gap is accepted for 0.18 (#223 D12, #259).
- **The release runs `npm run verify:full`**, fuzzing each Go target for 60s
  (#222, [`releasing.md`](releasing.md)). The allocation budgets in
  `go/budget_test.go` depend on the Go toolchain and knkeditor versions, so a
  knkeditor bump may need a documented budget raise.

## New codes

Codes only ever grow (ADR-0019); these are new in 0.18.

| Area | Codes | Ticket |
|---|---|---|
| Spec | `invalid_setting` | #205 |
| Spec | `invalid_position` (was `virtual_table_row_field_type`), `reserved_accessor`, `invalid_config`, `search_without_text` | #209, #284 |
| Spec | `duplicate_blueprint` | #215 |
| Spec | `inapplicable_validation` | #313 |
| Resolve | `resolve_*` — cycle, fetch cap, depth cap, fetch failure, invalid Release | #212 |
| Value | `required`, `not_canonical`, `invalid_type`, `invalid_format`, `too_small`, `too_big`, `too_many_items`, `too_many_bytes`, `invalid_value` | #210, #284 |
| Value | `too_deep`, `missing_id`, `duplicate_id` | #211 |
| Value | `invalid_rich_text` — at the Field path plus knkeditor's pointer, knkeditor's code in `params.code` | #216 |
| Value | `unknown_command`, `invalid_ti_set` | #221 |

`invalid_position` and `too_many_bytes` are the names #223 D7 settled on:
#209 and #210 shipped them as `position` and `too_large`, and #284 renamed
them before the freeze.

## Deprecations

### `@knkcs/fieldkit/rich-text-spec` — removed in 0.19

Every export of the subpath — `EditorSpec`, `EditorNodePlugin`,
`EditorNodeCategory`, `NodeOptions`, `EditorSpecEditor` and its props, and
`builtInEditorPlugins`/`builtInNodePlugins`/`builtInMarkPlugins` — is
`@deprecated` in 0.18 and is removed in 0.19 (ADR-0026, #223 D2a, #279).

It configured an editor in a way Text Types have replaced. **What replaces
it:**

- **The `text_type` setting.** A `rich_text` Field pins a **Text Type
  Release** in `settings.text_type` (#216); the Text Type itself is fetched
  once per resolution and carried in the Resolved Spec's `parts.text_type`.
  An `EditorSpec`'s `nodes` and `marks` have no counterpart on the Field —
  what a document may hold is the Text Type's.
- **knkeditor's vocabulary.** knkeditor owns the node and mark vocabulary that
  `EditorNodePlugin` and the built-in plugin arrays mirrored.
- **Generated option forms.** knkeditor generates the option forms that
  `EditorSpecEditor` and `EditorNodePlugin.settingsSpec` drew, and blueprinthub
  owns the Text Type Releases they edit.
- **`@knkcs/fieldkit/rich-text`** (#278), an opt-in subpath with a
  knkeditor-backed `rich_text` field that reads its Text Type from the
  Resolved Spec's `parts`. A Consumer opts in with `knkRichTextPlugin`
  (see [above](#knkcsfieldkitrich-text-278)); without it, the core
  renderer's `rich_text` field is read-only.

To migrate: stop authoring `EditorSpec`s, point each `rich_text` Field's
`text_type` at a Text Type Release that allows what the old `EditorSpec`
enabled, and drop the `/rich-text-spec` import.
