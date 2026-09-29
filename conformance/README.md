# Conformance fixtures

Shared fixtures that hold fieldkit's TS and Go halves to one answer
(ADR-0018). Each case is written once, as data, and both runners replay it:

- **TS:** `src/schema/__tests__/conformance.test.ts` (Vitest, `npm run test`)
- **Go:** `go/conformance_test.go` (`go test ./...`, run by `npm run verify:go`)

Both run in `npm run verify`.

## Layout

```
conformance/
  <version>/          one folder per released version, and unreleased/
    catalogue.json    a released version's frozen Catalogue (not a fixture)
    catalogue.publishing.json   its frozen publishing section (not a fixture)
    <area>/           one folder per operation or rule family
      <name>.json     a fixture (format below)
```

- `unreleased/` holds the fixtures of fieldkit as it is now, and is where new
  fixtures go. It is never frozen.
- A released version's folder is never edited or deleted (ADR-0018). Only an
  earlier release's **valid** cases bind later ones: a value once rejected may
  become valid, so a validation bug can be fixed by loosening (ADR-0019).
  Both runners replay a released folder's valid cases only (`binds` in each
  runner) and skip its invalid ones.
- A final release copies `unreleased/` to its version folder, together with
  the Catalogue as `<version>/catalogue.json` and each opt-in package's
  section beside it (`catalogue.publishing.json`) — the baseline
  `npm run catalogue:compat` compares against (`npm run release`, see
  [docs/releasing.md](../docs/releasing.md)).
- A fixture is a `.json` file directly inside an area folder. Both runners
  glob `*/*/*.json`, so a new area or version needs no runner change.

## Areas

| Area | Contents |
|---|---|
| [`validate-spec/`](unreleased/validate-spec) | `validateSpec` over the types the Catalogue lists: unknown Field Types, unknown and invalid settings at every depth, Unset settings, numbers beyond float64 (read as JS reads them, ±Infinity), path escaping; the containers' rules across settings — a Virtual Table's Row Spec (ADR-0017), duplicate Block Types, a Reference Field's duplicate Blueprints — and a Block Type's Fields and a Reference Spec validated like children; Positions, reserved `_` Accessors, the card-marker rule and `config.search` (ADR-0022); `rich_text`'s `text_type` Pin and its legacy `editor_spec` as an `unknown_setting`; the publishing types unknown without their package, and with it `reference_filter`'s one Position, `outline_tree`'s two Pins, root Position and node Fields in `reference_spec`, `template_text`'s `context_blueprints`, `ti_overlay`'s `root` and `ti_set` setting, and `manipulation_tree`'s strict settings and its node-level Reference Spec in `reference_spec` Position (`publishing-…`) |
| [`resolve/`](unreleased/resolve) | `resolve`, `pins` and `validateResolvedSpec` (ADR-0020): Blueprint Releases inlined as children, at any depth and in a Block Type's Fields; a linked Reference Spec inlined into its `blueprints` entry's `spec`; each Release fetched once; already-resolved Fields left alone; the refusals (`resolve_cycle`, `resolve_too_deep`, `resolve_too_many_fetches`); a linked Blueprint's Positions checked on the Resolved Spec; Text Types stored once in `parts` and the `vocabulary` they need; a `reference_filter` in a linked Reference Spec, and out of place once a Fieldset inlines it; an `outline_tree`'s Blueprint Release inlined as its children and its Text Type in `parts`, read from the publishing section's Pins; a `ti_overlay`'s TI Set stored once in `parts.ti_set`; a `manipulation_tree`'s linked Reference Spec |
| [`edges/`](unreleased/edges) | `edges` over the Resolved Spec: `media` edges at the root, in rows by `_id`, in Blocks and a resolved Fieldset; `reference` edges per node, with their Pin; none for a `lookup` or any other type; `rich_text`'s `link`, `footnote` and `media` edges (Go only); a `manipulation_tree`'s `include`, `exclude`, `replace` and `annotate` edges per node, and a replace's `with` as `include`; an `outline_tree` node's values' edges at every level; a `ti_overlay`'s `anchor` edge per entry, `{content, pin?, anchor}` (`publishing-…`) |
| [`texts/`](unreleased/texts) | `texts` over the Resolved Spec: every type with text, each Field's own `search` weight inside rows as at the root (Unset is `D`, `off` excluded), and in a Reference's values against its Reference Spec; `rich_text`'s reading text (Go only); none from a `template_text`; a `manipulation_tree` node's values against the Spec its intent names; an `outline_tree` node's values against its resolved Blueprint, at every level (`publishing-…`) |
| [`validate-value/`](unreleased/validate-value) | `validateValue` over every type with a value — rich text against its Text Type (Go only past its shape): Unset and `required` (ADR-0021), `not_canonical` at every depth, each type's valid and invalid values, formats (email, URL, slug, pattern), lengths in UTF-16 code units, Unset settings and validation, hidden Fields and Markers, path escaping; the containers' rows, Blocks and records, each child checked by its own type (ADR-0007), the rows' `_id`s and `_id` paths (ADR-0023), and `too_deep`; Unset and the depth cap stopping at a `rich_text` document (ADR-0025); Reference nodes, their tree-wide `_id`s, caps and values against the right Reference Spec per target; a `reference_filter` in a Reference's values, an `outline_tree`'s nodes — tree-wide `_id`s, each node's `values` against its resolved Blueprint, strict nodes and their optional `origin`, `overridden` and `source` — a `template_text`'s string, and `ti_overlay`'s flattened `{entries}`, each naming the Content it anchors in (`content` required, `pin` optional), its inline anchors in knkeditor's shape and core's removed keys, and — against the Resolved Spec, Go only — each command in the pinned TI Set; and `manipulation_tree` nodes — a Reference Tree's rules, each node's `intent` and a replace's `with`, values per intent (`publishing-…`) |
| [`compare/`](unreleased/compare) | `compare` through the versionkit adapter (ADR-0023, [docs/compare-and-merge.md](../docs/compare-and-merge.md)): whole values equal whatever their spelling, with no detail; rows by `_id` with each row's status, `moved` and each changed child's detail nested; a Fieldset per child Field; a Reference Tree per node, parent and position as fields — a `manipulation_tree` too, its intent a field, and an `outline_tree`, its `origin`, `overridden` and `source` fields; `rich_text` by knkeditor, its detail nested unchanged; `ti_overlay` per entry under `entries` (`publishing-…`). Go only |
| [`merge/`](unreleased/merge) | `merge` through the versionkit adapter: per row and per child Field, different columns of one row on each side, Conflicts by `_id` path, a reorder on one side taken, reorders on both sides at `_order`, an insert while the other side reorders; Blocks and a Fieldset; a Reference Tree per node — a move on one side and a values edit on the other clean, moves on both sides at `_parent` — a `manipulation_tree` too, intents changed on both sides at `intent`, and an `outline_tree`, its TOC-generation keys changed on both sides at the key; `rich_text` by knkeditor's Merger, Conflicts by node id; `ti_overlay` per entry and key (`publishing-…`). Go only |

## Fixture format

```json
{
	"description": "What the fixture proves, in one sentence",
	"spec": [ /* a Spec: Field[] exactly as stored */ ],
	"data": { /* stored data, for validateValue */ },
	"expect": {
		"validateSpec": [ { "path": "/title/settings/placehodler", "code": "unknown_setting" } ]
	}
}
```

- `description` — required.
- `spec` — a Spec. The Go runner decodes it strictly (`DecodeSpec`), so a
  fixture may only use properties the Field model declares.
- `data` — stored data (a Content's values) checked against `spec`; read by
  `validateValue`, `edges` and `texts`. Absent is `{}`.
- `revisions` — named versions of the data, for the versionkit operations:
  `a` and `b` for `compare`, `base`, `ours` and `theirs` for `merge`. Each is
  stored data, as `data` is.
- `releases` — what resolving `spec` fetches, as kind → Release id → the
  Release: a `blueprint` Release is its Fields (a Spec); any other kind is an
  opaque part. The resolve operations read it, and `edges` and `texts`, which walk the Resolved Spec. A Release it does not
  hold fails the fetch.
- `targets` — the Blueprint of each referenced Content, by its id: what
  `validateValue`, `edges` and `texts` are told (TS
  `ValueContext.targetBlueprint`, Go `WithTargetBlueprints`), so a Reference
  Field that links a Reference Spec checks each Reference's values against
  the one its target's Blueprint has. Absent, such values are an opaque
  record.
- `goOnly` — operations of this fixture only the Go runner runs, each also
  in `expect`: what it holds is rich text, which Go reads through knkeditor
  and TS cannot (#216), or a `ti_overlay` checked against its TI Set, which
  TS never reads (#221). The TS runner skips them as it skips `compare` and
  `merge`; everything else in the fixture binds both.
- `packages` — the opt-in packages whose Catalogue section every operation of
  the fixture runs against, beside the core one: `["publishing"]` for the
  publishing package's types (ADR-0002, amended). Absent, a fixture sees the
  core Catalogue only, and a publishing type is `unknown_field_type`, as it
  is to a Consumer that never opted in. The TS runner adds the package's
  plugins (its `PACKAGES`); the Go runner runs against
  `DefaultCatalogue().With(section)`, the sections reaching it through
  `ConformancePackages`, which `go/conformance_packages_test.go` fills — the
  runner cannot import a package that imports `fieldkit`. A fixture of a
  publishing type is named `publishing-…` in the area of its operation.
- `resolveOptions` — `{ maxFetches, maxDepth }`, overriding the caps
  (TS `RESOLVE_CAPS`, Go `DefaultMaxFetches` / `DefaultMaxDepth`) so a cap is
  testable without hundreds of Releases.
- `expect` — the expected result of each operation, keyed by name. A runner
  fails a fixture that expects an operation it does not implement, so no
  fixture is ever skipped by one side alone — save `compare` and `merge`,
  which only Go implements and the TS runner recognises and skips, and a
  fixture's `goOnly` operations.

### Operations

- **`validateSpec`** — the complete set of `{path, code}` errors, in any
  order; `[]` for a valid Spec. `params` is not compared. Both runners validate
  against the Catalogue's types only — the TS runner hands `validateSpec` just
  the plugins that declare a `settingsSchema`, plus the sections the fixture's
  `packages` name — so a type outside the Catalogue is `unknown_field_type` on
  both sides. TS's `validateSpec` also
  checks rules Go does not implement yet (empty names, duplicate Accessors);
  a fixture must not break those until both sides do. A Reference Spec —
  a Reference Field's embedded `settings.spec`, and each resolved
  `settings.blueprints[i].spec` — is walked as `reference_spec` Fields in
  both, at `/<field>/settings/spec/<accessor>`.
  The Fields in a Block Type's `fields` are decoded by Go as strictly as the
  Spec, so they too may only use properties the Field model declares: TS
  refuses a list whose items are not objects with a `config` object, as Go
  does, but has no strict Field decoder, so a stray property is one
  `invalid_setting` at the list in Go and nothing in TS — the same gap the
  top-level Spec has, where Go refuses to decode it at all.

- **`validateValue`** — the complete set of `{path, code}` errors for `data`
  against `spec`, in any order; `[]` for valid data. `params` is not compared.
  Both runners hand it the Catalogue's types only, as for `validateSpec`. A
  value is checked by exactly what its type's `toZodType` checks, on top of
  ADR-0021: Unset — absent, `null`, `""`, `[]`, `{}` — is `required` where
  the Field is required and otherwise unchecked, and a stored key holding it
  is `not_canonical`, at any depth, whether or not the Spec names the key.
  Keys the Spec does not name are otherwise ignored, as are hidden Fields and
  Markers. A container hands what it holds to each child's own type: a
  `group`'s or `virtual_table`'s rows and a resolved `fieldset`'s record are
  checked against `children`, a Block against its Block Type's `fields`; a
  missing key a row needs is `required`, as at the root. Every row of a
  `group`, `virtual_table` and `blocks` carries an `_id` (ADR-0023):
  `missing_id` at a row without one, `duplicate_id` at each repeat within its
  array, and an `_id` that is not a string or longer than 64 UTF-16 code units
  is `invalid_type` or `too_big` at the `_id`. A Block whose `_type` names none
  of several Block Types is `invalid_value` at `_type` and checked no further;
  with exactly one Block Type the Block is checked against it whatever its
  `_type`. A Reference node is `{_id, id, pin?, values?, children?}`: its
  `_id` as a row's, unique across every level of the tree (`duplicate_id` at
  each repeat in document order), `id` a required string, `pin` a string,
  `values` a record checked against the node's Reference Spec — the embedded
  one, or where the Field links one for the target's Blueprint (per
  `targets`) that one instead, never merged, with a required Field required
  even when `values` is absent; a linked Field whose target is unknown
  checks `values` as a record only, and with `targets` a node without a
  string `id` has no target and its `values` are not checked. `max_items`
  counts every node at every level (`too_many_items` at the Field) and
  `max_depth` reports each shallowest node past it (`invalid_value`), both on
  the raw tree whatever else a node gets wrong. A `rich_text` value is an
  object in both; past that, knkeditor
  checks it in Go — against the Text Type its Field pins when the fixture has
  `releases` (the Go runner then validates against the Resolved Spec,
  `ValidateResolvedValue`), the vocabulary alone otherwise — and each error it
  reports is `invalid_rich_text`, which TS never reports: a fixture expecting
  one marks `validateValue` `goOnly`. Unset stops at the document (ADR-0025):
  a `rich_text` Field's value that is an object holding anything is
  knkeditor's inside, so an attribute holding `null` or `"attributes": {}`
  there is neither stripped nor `not_canonical`, in TS and Go alike, and
  `too_deep` counts no level inside it. At the Field the rule holds: a
  `rich_text` value of `{}` or `null` is `not_canonical`, and Unset. A
  document is one wherever a `rich_text` Field's value sits — at the root, in
  a row, a Block, a resolved Fieldset's record, a Reference's `values` against
  its Reference Spec, a hidden Field — and nowhere else: the same object
  under a key no Field names, or in `values` checked as an opaque record, is
  fieldkit's structure. **Go does not validate the types outside the Catalogue yet**, and
  skips them; TS validates them. The fixtures stay clear of them until Go
  does. Two approximations the fixtures stay clear of too: Go reads a
  `validation.pattern` as RE2 where TS reads it as a JS `RegExp` — a pattern
  RE2 cannot compile (a lookaround, a backreference) checks nothing in Go —
  and Go's reading of a URL (`new URL()` in TS) does no IDNA. The caps
  (`too_many_items`, `too_many_bytes`) are tested in each language's unit tests
  instead: a value beyond one is too big to freeze into a fixture. Unlike
  `too_deep`, they count the whole data, a rich-text document's inside
  included: they are what keeps stored data from being pathological,
  whoever owns the part.

  A valid case freezes an acceptance for ever (ADR-0019), so a valid fixture
  holds values the type is meant to accept, not whatever it happens to let
  through today.

- **`resolve`** — the Resolved Spec `spec` resolves to against `releases`:
  `{ vocabulary, fields, parts }`, compared as JSON, or `{ "error": code }`.
  `vocabulary` is the highest `minimumVocabularyVersion` among the
  `text_type` parts, `""` when none states one; a Text Type whose minimum is
  not a semantic version is `resolve_invalid_release` (Go also refuses one
  knkeditor's `ParseTextType` cannot read, which TS resolves)
  for a refusal, whose code alone is compared (which Pin a concurrent TS
  resolution trips a cap at first is not fixed). `catalogue` is left out: the
  runners check it is the running Catalogue's version, which a released
  fixture could not know. Go encodes every Field with the properties it
  always writes (`system`, and `name`, `api_accessor`, `required`,
  `instructions` in `config`), so a fixture's Fields — its Releases' too —
  spell them out. Both runners resolve against the Catalogue's types only. A
  released refusal binds nothing, as a released invalid case does not.
- **`pins`** — every Pin `spec` holds, `{path, kind, release}`, in any order:
  TS `specPins`, Go `Pins`. Nothing is fetched.
- **`edges`** — every Content Graph edge `data` holds (contenthub ADR 0009),
  `{path, kind, target}`, in any order: TS `edges`, Go `Edges`, over the
  Resolved Spec `spec` resolves to against `releases`. A `target` holds
  exactly one of `content`, `asset` and `blueprint_release`, with `pin` and
  `anchor` narrowing a `content`. Each Field is read by its own type, through
  every container at every depth; markers and hidden Fields yield none, as
  validation skips them. `media` yields one `media` edge per Asset, at the
  Field itself (the value is one whole, never addressed by index), an Asset
  listed twice once; `reference` one `reference` edge per node, at the node's
  path (`/related/n1/children/n2`), its target `content` and its `pin`, and
  `single_reference` one at the Field; a `lookup`'s bare id is no edge.
  `rich_text` yields knkeditor's `link`, `footnote` and `media` edges, at the
  Field, in Go only (`goOnly`).
- **`texts`** — the plain text each Field of `data` yields for Delivery Search
  (contenthub ADR 0019), `{path, weight, text}`, in any order: TS `texts`, Go
  `Texts`, over the Resolved Spec as for `edges`. Exactly the types the
  Catalogue marks `has_text` yield text (TS `text` on the plugin, Go
  `ValueText`): a string type the string itself; a List its Entries, one per
  line; an Array its keys and values, one per line, pair by pair — keyed, key
  by key in UTF-16 order; a choice type (`select`, `radio`, `checkboxes`)
  the labels `settings.options` gives its selected keys, one per line in
  selection order, a key without a label (absent, or `""`) adding none;
  `rich_text` knkeditor's reading text, in Go only
  (TS yields none for it, so such a fixture marks `texts` `goOnly`). Each
  Field weighs by its own `config.search`, inside
  a row as at the root: `off` yields nothing, Unset weighs `D`. A text is
  never `""`.

  Neither answer is a list of errors, so a released `edges` or `texts` case
  always binds.
- **`validateResolvedSpec`** — the errors of the Resolved Spec `spec`
  resolves to against `releases`, as for `validateSpec`: TS `validateSpec`
  with `resolved: true`, Go `ValidateResolvedSpec`. On a Resolved Spec a
  Virtual Table that links a Blueprint and has children is resolved, not
  `virtual_table_row_spec_ambiguous`, and the inlined Fields' Positions are
  checked.

- **`compare`** and **`merge`** — versionkit's Compare and Merge, run as
  versionkit runs them (ADR-0023, [docs/compare-and-merge.md](../docs/compare-and-merge.md)):
  `spec` is resolved against `releases`, `SchemaFields` turns it into
  versionkit's Fields, and each Field's `Type` gets its own `Settings` back.
  `compare` expects `{ <accessor>: { equal, detail? } }` for exactly the
  Fields both `a` and `b` hold; `detail` is compared as JSON, and absent means
  none. `merge` expects `{ <accessor>: { merged } | { conflicts } }` for
  exactly the Fields `base`, `ours` and `theirs` all hold whose type is a
  Merger — versionkit merges the others as whole values itself; `merged` is
  compared as JSON, `conflicts` in any order. **Only Go implements them**, as
  no TS code compares or merges: the TS runner recognises both and runs
  neither (its `GO_ONLY_OPERATIONS`). In a released version's folder a
  `compare` binds, and a `merge` binds unless it expects a Conflict — a type
  may yet merge finer.

## Paths

Every error path is `/`-separated. In a Spec, a Field is its Accessor, with
`children` between a Field and the Fields it holds; a settings error adds
`settings` and the key, with an array item as its index. A Block Type's Fields
are a Spec held in settings, so a Field in one is the settings path to its
`fields` plus its Accessor:

| Error | Path |
|---|---|
| unknown type at the root | `/legacy` |
| unknown setting of a Group's child | `/authors/children/name/settings/placeholder` |
| settings that are not an object | `/subtitle/settings` |
| a Block Type's missing `name` | `/content/settings/allowed_blocks/1/name` |
| unknown setting of a Field in a Block Type | `/content/settings/allowed_blocks/0/fields/title/settings/placeholder` |

In data, a Field is its Accessor from the data's root, an object entry its
key, and an array item its `_id` — when it is an object holding a
well-formed `_id` no earlier item of the array holds — or its index otherwise
(ADR-0023): a row without a usable `_id`, or repeating one, still needs a
place. The data itself is the empty path.

| Error | Path |
|---|---|
| a required Field left Unset | `/title` |
| a List's third entry | `/entries/2` |
| a `null` held by a keyed Array's entry | `/keyed/b` |
| a required child of the row with `_id` `a1` | `/authors/a1/name` |
| a row without an `_id`, the first of its array | `/authors/0` (`missing_id`) |
| data that is not an object | the empty path |

A Merge's Conflict is a path within the Field, in the same grammar but
without the leading `/` or the Field's Accessor, which versionkit prefixes:
`a1/name`, `a3/books/k1/title`, and `_order` for the order of a row array
reordered differently on both sides (`a1/items/_order` inside a row).

A segment holding `/` or `~` is escaped as in RFC 6901: `~` as `~0`, `/` as
`~1`.

## Codes

Codes are part of the data contract: added, never renamed or removed
(ADR-0019). The exceptions predate the first release, before any Catalogue or fixture folder was frozen: `virtual_table_row_field_type` was replaced by `position` (ADR-0022), and then, in the naming review before the freeze (#223, D7), `position` was renamed `invalid_position` and `too_large` was renamed `too_many_bytes`.

| Code | Meaning |
|---|---|
| `unknown_field_type` | The `field_type` is not in the Catalogue. Its settings are not checked; its children are. |
| `unknown_setting` | A settings key the type's settings schema does not declare. |
| `invalid_setting` | A declared setting of the wrong type, or out of range; or settings that are not an object; or a Block Type's `fields` that are not Fields. Reported once per path, however many rules the value breaks. |
| `virtual_table_row_spec_ambiguous` | A Virtual Table that links a Blueprint and has children: two Row Specs (ADR-0017). At the Field. |
| `virtual_table_row_spec_missing` | A Virtual Table with neither a linked nor an embedded Row Spec. A blank Blueprint is no link. At the Field. |
| `invalid_position` | A Field in a Position its type's Catalogue entry does not list (ADR-0022) — `root`, `row` (a Virtual Table's children), `block_type` (a Block Type's Fields); a Group's or Fieldset's children sit where it does. At that Field. A type the Catalogue does not list is `unknown_field_type` only. |
| `reserved_accessor` | An Accessor beginning with `_`, in any Position (ADR-0022). At the Field. |
| `loose_field_in_carded_tab` | A top-level Field before the first card marker of a tab (split at each `section`) that has one. At the Field. |
| `invalid_config` | A `config` key holding a value it does not accept: a `search` other than `off`, `A`, `B`, `C`, `D`. At the key. |
| `search_without_text` | `config.search` on a type whose Catalogue entry has `has_text: false`. At the key. |
| `duplicate_block_type` | A Block Type repeating the `type` an earlier Block Type of the same Field declared. At each repeat's `type`. |
| `duplicate_blueprint` | A Reference Field's `blueprints` entry naming a Blueprint an earlier entry names — two Reference Specs for one target. At each repeat's `blueprint`. |
| `required` | *(value)* A required Field whose value is Unset. `0` and `false` are values. |
| `not_canonical` | *(value)* A stored key holding an Unset value — `null`, `""`, `[]` or `{}` — at any depth: Unset is stored as absent (ADR-0021). At the outermost key whose whole value is Unset. Array items are kept, so `[null]` holds one item and is no error. Never inside a `rich_text` document, which is knkeditor's (ADR-0025); a `rich_text` value of `{}` or `null` is one at the Field. |
| `invalid_type` | *(value)* A value of the wrong JSON type, at the value or the item; or data that is not an object, at the empty path. |
| `invalid_format` | *(value)* A string not in its type's format: `email`, `url`, `slug`, or the Field's `validation.pattern`. |
| `too_small` | *(value)* Below a minimum the Spec states: a string shorter than `validation.min_length` (in UTF-16 code units), a number below `settings.min`, fewer rows than `min_items`; and a blank entry in a required List. |
| `too_big` | *(value)* Above a maximum the Spec states: a string longer than `validation.max_length`, a number above `settings.max` — and an `_id` longer than 64 characters. |
| `too_many_items` | *(value)* An array, or an object's keys, beyond 10 000 (TS `VALUE_CAPS.maxItems`, Go `MaxItems`), or rows — a Reference Tree's nodes at every level — beyond a Field's `max_items`. The 10 000 cap covers the whole document, keys the Spec does not name, the root and a `rich_text` document's inside included; data beyond it or `too_many_bytes` reports only its caps. |
| `too_many_bytes` | *(value)* A string beyond 1 MiB of UTF-8 (TS `VALUE_CAPS.maxStringBytes`, Go `MaxStringBytes`), anywhere in the data, a `rich_text` document's inside included. |
| `invalid_value` | *(value)* Any other rule a type's `toZodType` states: a Block whose `_type` is not its Block Type's; a Reference nested deeper than its Field's `max_depth`; a key a strict object of a value does not declare — a `ti_overlay`'s, its entries' and its anchors' — once at the object holding it, as Zod's strict object reports it; a `ti_overlay` entry's `source` other than `editor` or `oasys`; a `manipulation_tree` node's `intent` that is none of `include`, `exclude`, `replace`, `annotate`, a `with` on a node that is no `replace`, and `values` on an `exclude` or `replace`. |
| `missing_id` | *(value)* A row of a `group`, `virtual_table` or `blocks` value, or a node of a `reference`, `single_reference` or `manipulation_tree`, without an `_id` (ADR-0023). At the row. |
| `duplicate_id` | *(value)* A row repeating an `_id` an earlier row of the same array holds — for a Reference Tree, any earlier node at any level. At each repeat. |
| `invalid_rich_text` | *(value)* A `rich_text` value knkeditor's Validate refuses under the Field's Text Type: at the Field's path followed by knkeditor's JSON Pointer into the document, knkeditor's own code (`node-not-enabled`, `invalid-json-value`, …) in `params.code`; or, at the Field, a Text Type the Resolved Spec does not hold or knkeditor cannot use. **Go only**: TS has no knkeditor validator (#216). |
| `unknown_command` | *(value)* A `ti_overlay` entry's `command` that is not a `code` of the TI Set its Field's `ti_set` pins. At the command. **Go only**, against a Resolved Spec (`ValidateResolvedValue`): TS never reads a TI Set, and without a Resolved Spec — or on a Field pinning none — no command is checked. |
| `invalid_ti_set` | *(value)* A TI Set a `ti_overlay` Field pins that the Resolved Spec does not hold, or that is not `{"instructions": [{"code": …}, …]}` with every `code` a non-blank string — the one thing fieldkit reads of it; every other key is blueprinthub's. At the Field, once; its commands are then not checked. **Go only**, as `unknown_command`. |
| `too_deep` | *(value)* An array or object nested more than 128 levels below the data's root (TS `VALUE_CAPS.maxDepth`, Go `MaxDepth`), the root being level 0. It counts fieldkit's structure only: a `rich_text` document is counted where it sits, and no level inside it — its inner depth is knkeditor's to limit (ADR-0025). At the first such container; nothing inside it is checked, and, like the other caps, nothing else in the data. Distinct from `resolve_too_deep`. |
| `resolve_cycle` | *(resolve)* A Pin in a Blueprint Release that pins, however indirectly, that same Release. At the Pin closing the cycle. |
| `resolve_too_many_fetches` | *(resolve)* More distinct Releases to fetch than the cap (256). A Release pinned again is not fetched again and does not count. |
| `resolve_too_deep` | *(resolve)* A Pin nested deeper in pinned Releases than the cap (8); a Pin in the Spec is at depth 1. Distinct from a value's depth cap. |
| `resolve_fetch_failed` | *(resolve)* A Release the fetcher (TS: the adapter) could not return; its error is wrapped. |
| `resolve_invalid_release` | *(resolve)* A fetched Blueprint Release that is not a list of Fields (Go: not a strictly decoded Spec; not JSON); a Text Type whose `minimumVocabularyVersion` is not a semantic version (Go: or one knkeditor's `ParseTextType` refuses). |

A resolve error's path is the Pin's setting, through the Releases inlined above
it: `/owner/children/home/settings/blueprint`.

A Catalogue Pin `key` is a `/`-separated settings path in which `*` stands for
every item of a list: `blueprint` is one setting, `blueprints/*/spec_blueprint`
one per `blueprints` entry, so a Reference Field's linked Reference Spec is the
Pin `/related/settings/blueprints/0/spec_blueprint`. A Pin in a top-level
setting is inlined as the Field's `children`; one inside a settings entry as
that entry's `spec` (a Reference Field's linked Reference Spec, which replaces
the embedded `settings.spec` for References to that entry's Blueprint and is
never merged into it).

A setting whose value is Unset — absent, `null`, `""`, `[]` or `{}` — is
treated as absent at every depth before it is checked (ADR-0021), so an
unknown key holding `null` is no error. `0` and `false` are values.
