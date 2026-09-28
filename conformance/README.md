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
  the Catalogue as `<version>/catalogue.json` — the baseline
  `npm run catalogue:compat` compares against (`npm run release`, see
  [docs/releasing.md](../docs/releasing.md)).
- A fixture is a `.json` file directly inside an area folder. Both runners
  glob `*/*/*.json`, so a new area or version needs no runner change.

## Areas

| Area | Contents |
|---|---|
| [`validate-spec/`](unreleased/validate-spec) | `validateSpec` over the types the Catalogue lists: unknown Field Types, unknown and invalid settings at every depth, Unset settings, numbers beyond float64 (read as JS reads them, ±Infinity), path escaping; the containers' rules across settings — a Virtual Table's Row Spec (ADR-0017), duplicate Block Types — and a Block Type's Fields validated like children; Positions, reserved `_` Accessors, the card-marker rule and `config.search` (ADR-0022) |
| [`validate-value/`](unreleased/validate-value) | `validateValue` over every type with a value but the containers: Unset and `required` (ADR-0021), `not_canonical` at every depth, each type's valid and invalid values, formats (email, URL, slug, pattern), lengths in UTF-16 code units, Unset settings and validation, hidden Fields and Markers, path escaping |

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
- `data` — stored data (a Content's values) checked against `spec`; only
  `validateValue` reads it. Absent is `{}`.
- `expect` — the expected result of each operation, keyed by name. A runner
  fails a fixture that expects an operation it does not implement, so no
  fixture is ever skipped by one side alone.

### Operations

- **`validateSpec`** — the complete set of `{path, code}` errors, in any
  order; `[]` for a valid Spec. `params` is not compared. Both runners validate
  against the Catalogue's types only — the TS runner hands `validateSpec` just
  the plugins that declare a `settingsSchema` — so a type outside the
  Catalogue is `unknown_field_type` on both sides. TS's `validateSpec` also
  checks rules Go does not implement yet (empty names, duplicate Accessors);
  a fixture must not break those until both sides do. A Reference Spec is
  walked by TS but not by Go until `reference` is in the Catalogue (#215), so
  no fixture holds one.
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
  Markers. **Go does not validate the containers' values yet** (`group`,
  `virtual_table`, `blocks`, `fieldset`), nor the types outside the Catalogue,
  and skips them; TS validates them. The fixtures stay clear of them until Go
  does. Two approximations the fixtures stay clear of too: Go reads a
  `validation.pattern` as RE2 where TS reads it as a JS `RegExp` — a pattern
  RE2 cannot compile (a lookaround, a backreference) checks nothing in Go —
  and Go's reading of a URL (`new URL()` in TS) does no IDNA. The caps
  (`too_many_items`, `too_large`) are tested in each language's unit tests
  instead: a value beyond one is too big to freeze into a fixture.

  A valid case freezes an acceptance for ever (ADR-0019), so a valid fixture
  holds values the type is meant to accept, not whatever it happens to let
  through today.

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

In data, a Field is its Accessor from the data's root, an array item its
index and an object entry its key; the data itself is the empty path. (A
row's `_id` will replace its index, ADR-0023.)

| Error | Path |
|---|---|
| a required Field left Unset | `/title` |
| a List's third entry | `/entries/2` |
| a `null` held by a keyed Array's entry | `/keyed/b` |
| data that is not an object | the empty path |

A segment holding `/` or `~` is escaped as in RFC 6901: `~` as `~0`, `/` as
`~1`.

## Codes

Codes are part of the data contract: added, never renamed or removed
(ADR-0019). The one exception predates the first release: `virtual_table_row_field_type` was replaced by `position` (ADR-0022) before any Catalogue or fixture folder was frozen.

| Code | Meaning |
|---|---|
| `unknown_field_type` | The `field_type` is not in the Catalogue. Its settings are not checked; its children are. |
| `unknown_setting` | A settings key the type's settings schema does not declare. |
| `invalid_setting` | A declared setting of the wrong type, or out of range; or settings that are not an object; or a Block Type's `fields` that are not Fields. Reported once per path, however many rules the value breaks. |
| `virtual_table_row_spec_ambiguous` | A Virtual Table that links a Blueprint and has children: two Row Specs (ADR-0017). At the Field. |
| `virtual_table_row_spec_missing` | A Virtual Table with neither a linked nor an embedded Row Spec. A blank Blueprint is no link. At the Field. |
| `position` | A Field in a Position its type's Catalogue entry does not list (ADR-0022) — `root`, `row` (a Virtual Table's children), `block_type` (a Block Type's Fields); a Group's or Fieldset's children sit where it does. At that Field. A type the Catalogue does not list is `unknown_field_type` only. |
| `reserved_accessor` | An Accessor beginning with `_`, in any Position (ADR-0022). At the Field. |
| `loose_field_in_carded_tab` | A top-level Field before the first card marker of a tab (split at each `section`) that has one. At the Field. |
| `invalid_config` | A `config` key holding a value it does not accept: a `search` other than `off`, `A`, `B`, `C`, `D`. At the key. |
| `search_without_text` | `config.search` on a type whose Catalogue entry has `has_text: false`. At the key. |
| `duplicate_block_type` | A Block Type repeating the `type` an earlier Block Type of the same Field declared. At each repeat's `type`. |
| `required` | *(value)* A required Field whose value is Unset. `0` and `false` are values. |
| `not_canonical` | *(value)* A stored key holding an Unset value — `null`, `""`, `[]` or `{}` — at any depth: Unset is stored as absent (ADR-0021). At the outermost key whose whole value is Unset. Array items are kept, so `[null]` holds one item and is no error. |
| `invalid_type` | *(value)* A value of the wrong JSON type, at the value or the item; or data that is not an object, at the empty path. |
| `invalid_format` | *(value)* A string not in its type's format: `email`, `url`, `slug`, or the Field's `validation.pattern`. |
| `too_small` | *(value)* Below a minimum the Spec states: a string shorter than `validation.min_length` (in UTF-16 code units), a number below `settings.min`, fewer rows than `min_items`; and a blank entry in a required List. |
| `too_big` | *(value)* Above a maximum the Spec states: a string longer than `validation.max_length`, a number above `settings.max`. |
| `too_many_items` | *(value)* An array, or an object's keys, beyond 10 000 (TS `VALUE_CAPS.maxItems`, Go `MaxItems`), or rows beyond a Field's `max_items`. The 10 000 cap covers the whole document, keys the Spec does not name and the root included; data beyond it or `too_large` reports only its caps. |
| `too_large` | *(value)* A string beyond 1 MiB of UTF-8 (TS `VALUE_CAPS.maxStringBytes`, Go `MaxStringBytes`). |
| `invalid_value` | *(value)* Any other rule a type's `toZodType` states. No type Go validates reports it. |

A setting whose value is Unset — absent, `null`, `""`, `[]` or `{}` — is
treated as absent at every depth before it is checked (ADR-0021), so an
unknown key holding `null` is no error. `0` and `false` are values.
