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
| [`validate-spec/`](unreleased/validate-spec) | `validateSpec` over the types the Catalogue lists: unknown Field Types, unknown and invalid settings at every depth, Unset settings, numbers beyond float64 (read as JS reads them, ±Infinity), path escaping; the containers' rules across settings — a Virtual Table's Row Spec (ADR-0017), duplicate Block Types — and a Block Type's Fields validated like children |

## Fixture format

```json
{
	"description": "What the fixture proves, in one sentence",
	"spec": [ /* a Spec: Field[] exactly as stored */ ],
	"expect": {
		"validateSpec": [ { "path": "/title/settings/placehodler", "code": "unknown_setting" } ]
	}
}
```

- `description` — required.
- `spec` — a Spec. The Go runner decodes it strictly (`DecodeSpec`), so a
  fixture may only use properties the Field model declares.
- `expect` — the expected result of each operation, keyed by name. A runner
  fails a fixture that expects an operation it does not implement, so no
  fixture is ever skipped by one side alone.

### Operations

- **`validateSpec`** — the complete set of `{path, code}` errors, in any
  order; `[]` for a valid Spec. `params` is not compared. Both runners validate
  against the Catalogue's types only — the TS runner hands `validateSpec` just
  the plugins that declare a `settingsSchema` — so a type outside the
  Catalogue is `unknown_field_type` on both sides. TS's `validateSpec` also
  checks rules Go does not implement yet (empty names, duplicate Accessors,
  the card-layout rule); a fixture must not break those until both sides do.
  The Fields in a Block Type's `fields` are decoded by Go as strictly as the
  Spec, so they too may only use properties the Field model declares: TS
  refuses a list whose items are not objects with a `config` object, as Go
  does, but has no strict Field decoder, so a stray property is one
  `invalid_setting` at the list in Go and nothing in TS — the same gap the
  top-level Spec has, where Go refuses to decode it at all.

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

A segment holding `/` or `~` is escaped as in RFC 6901: `~` as `~0`, `/` as
`~1`.

## Codes

Codes are part of the data contract: added, never renamed or removed
(ADR-0019).

| Code | Meaning |
|---|---|
| `unknown_field_type` | The `field_type` is not in the Catalogue. Its settings are not checked; its children are. |
| `unknown_setting` | A settings key the type's settings schema does not declare. |
| `invalid_setting` | A declared setting of the wrong type, or out of range; or settings that are not an object; or a Block Type's `fields` that are not Fields. Reported once per path, however many rules the value breaks. |
| `virtual_table_row_spec_ambiguous` | A Virtual Table that links a Blueprint and has children: two Row Specs (ADR-0017). At the Field. |
| `virtual_table_row_spec_missing` | A Virtual Table with neither a linked nor an embedded Row Spec. A blank Blueprint is no link. At the Field. |
| `virtual_table_row_field_type` | A Field a Row Spec may not hold — one whose type's Positions lack `row`. At that Field. |
| `duplicate_block_type` | A Block Type repeating the `type` an earlier Block Type of the same Field declared. At each repeat's `type`. |

A setting whose value is Unset — absent, `null`, `""`, `[]` or `{}` — is
treated as absent at every depth before it is checked (ADR-0021), so an
unknown key holding `null` is no error. `0` and `false` are values.
