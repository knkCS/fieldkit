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
    <area>/           one folder per operation or rule family
      <name>.json     a fixture (format below)
```

- `unreleased/` holds the fixtures of fieldkit as it is now, and is where new
  fixtures go. It is never frozen.
- A released version's folder is never edited or deleted (ADR-0018). Only an
  earlier release's **valid** cases bind later ones: a value once rejected may
  become valid, so a validation bug can be fixed by loosening (ADR-0019).
  Copying `unreleased/` to a version folder at release time arrives with the
  release train (#206); until then `unreleased/` is the only folder.
- A fixture is a `.json` file directly inside an area folder. Both runners
  glob `*/*/*.json`, so a new area or version needs no runner change.

## Areas

| Area | Contents |
|---|---|
| [`validate-spec/`](unreleased/validate-spec) | `validateSpec` over the types the Catalogue lists: unknown Field Types, unknown and invalid settings at every depth, Unset settings, numbers beyond float64 (read as JS reads them, ±Infinity), path escaping |

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
  the card-layout rule, the Virtual Table's Row Spec); a fixture must not
  break those until both sides do.

## Paths

Every error path is `/`-separated. In a Spec, a Field is its Accessor, with
`children` between a Field and the Fields it holds; a settings error adds
`settings` and the key:

| Error | Path |
|---|---|
| unknown type at the root | `/legacy` |
| unknown setting of a Group's child | `/authors/children/name/settings/placeholder` |
| settings that are not an object | `/subtitle/settings` |

A segment holding `/` or `~` is escaped as in RFC 6901: `~` as `~0`, `/` as
`~1`.

## Codes

Codes are part of the data contract: added, never renamed or removed
(ADR-0019).

| Code | Meaning |
|---|---|
| `unknown_field_type` | The `field_type` is not in the Catalogue. Its settings are not checked; its children are. |
| `unknown_setting` | A settings key the type's settings schema does not declare. |
| `invalid_setting` | A declared setting of the wrong type, or out of range; or settings that are not an object. Reported once per path, however many rules the value breaks. |

A setting whose value is Unset — absent, `null`, `""`, `[]` or `{}` — is
treated as absent at every depth before it is checked (ADR-0021), so an
unknown key holding `null` is no error. `0` and `false` are values.
