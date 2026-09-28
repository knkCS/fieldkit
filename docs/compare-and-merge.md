# Compare and Merge

How fieldkit's Go compares and merges a Field's values for versionkit
(ADR-0023, fieldkit#201), and the shape of the detail a diff viewer reads.
The Go side is `go/schemas.go` (the adapter) and `go/compare.go` (the rules);
the fixtures are `conformance/unreleased/compare/` and `merge/`.

## The adapter

`SchemaFields(resolved)` turns a Resolved Spec into versionkit's
`Schemas.Fields` entries, one per top-level Field that holds a value (the
`section` and `card` Markers hold none):

| Property | Holds |
|---|---|
| `Accessor` | the Field's `api_accessor` |
| `TypeID` | its `field_type` |
| `Settings` | `{"field": <the whole resolved Field>, "parts": {<kind>: {<release>: <part>}}}` — `parts` only the opaque parts the Field pins, at any depth, and absent when it pins none (`SchemaSettings`, `DecodeSchemaSettings`) |
| `Type` | a `Comparer`; a `Merger` for `group`, `virtual_table`, `blocks`, `fieldset` and `rich_text` |

fieldkit never imports versionkit (versionkit ADR 0002). `Comparer` and
`Merger` have exactly versionkit's `FieldType` and `FieldMerger` method sets,
typed with standard types only, so a service builds each `versionkit.Field`
by assignment:

```go
fields, err := fieldkit.SchemaFields(resolved)
out := make([]versionkit.Field, len(fields))
for i, f := range fields {
	out[i] = versionkit.Field{Accessor: f.Accessor, TypeID: f.TypeID, Settings: f.Settings, Type: f.Type}
}
```

`Type` holds no state: it reads the Field back from the `Settings` versionkit
hands it, so the Settings must reach it unchanged, as versionkit promises.

## Equal

Compare's `equal` is representation-insensitive: numbers compare by value
(`1`, `1.0` and `1e0` are one number, read as JS reads them), objects
whatever their key order, and a key holding an Unset value (`null`, `""`,
`[]`, `{}`) as no key (ADR-0021). Array order counts, a row array's
included: a reorder alone is a change.

## Detail

Every type but the four below and `rich_text` compares as a whole value:
`equal` only, and **no detail**. The four answer with detail when not equal,
and `rich_text` with knkeditor's (see [Rich text](#rich-text)):

```ts
// group, virtual_table, blocks
type RowsDetail = { status: "changed"; items: Item[] };
// fieldset
type RecordDetail = { status: "changed"; fields: Record<string, ChildDetail> };

type Item = {
	_id: string;
	status: "unchanged" | "added" | "removed" | "changed";
	moved?: true;
	fields?: Record<string, ChildDetail>;
};

// A child Field, by its Accessor: its own detail, nested.
type ChildDetail =
	| { status: "added" | "removed" } // only one side holds the child
	| { status: "changed" } // a child compared as a whole value
	| RowsDetail // a row array in a row
	| RecordDetail; // a Fieldset in a row
```

- **`items`** lists every row of `b`, in `b`'s order; each row only `a` holds
  (`removed`) comes right after the row it followed in `a`, or first.
- An item's **`status`** is its content: `added`/`removed` when one side
  holds it, `changed` when any child differs, `unchanged` otherwise.
- **`moved`** is independent of `status`: the row is on both sides, but its
  place among the rows both hold changed. It marks all but a longest run of
  rows kept in order, so one row dragged elsewhere is the one row marked; of
  two swapped rows, the one moved ahead of the other is marked.
- **`fields`** holds only the children that differ, by Accessor. A key no
  Field of the row names is listed too, as a whole value — a Block's `_type`
  among them. `_id` is the row's identity, never a field. A Block whose
  `_type` differs between the sides compares every key as a whole value.
- At the top of a Field, `status` is always `changed`: versionkit calls
  Compare only for a Field both sides hold, reads no detail when equal, and
  reports `added` and `removed` Fields itself.

```json
{
	"status": "changed",
	"items": [
		{ "_id": "a2", "status": "unchanged", "moved": true },
		{ "_id": "a3", "status": "removed" },
		{
			"_id": "a1",
			"status": "changed",
			"fields": {
				"name": { "status": "changed" },
				"books": {
					"status": "changed",
					"items": [{ "_id": "k3", "status": "added" }]
				}
			}
		}
	]
}
```

## Merge

Whole-value types have no `Merge`: versionkit merges them itself. `rich_text`
merges by knkeditor (see [Rich text](#rich-text)). The four
types above merge finer, and Merge is called only when both sides changed a
Field:

- **Per row, by `_id`.** A row only one side changed, added or removed takes
  that side. One side removing a row the other changed is a Conflict at the
  row; both adding one `_id` differently is too.
- **Per child Field.** A row both sides changed merges key by key, each child
  by its own type — so a nested row array merges per row again, and two people
  editing different columns of one row never conflict. A key both sides
  changed differently is a Conflict at that key, unless its type merges finer.
  A `fieldset` is one record and merges the same way.
- **Order.** A reorder on one side is taken. Reorders on both sides that
  disagree on the order of the rows all three hold are a Conflict at
  `_order`. A row the side whose order was not taken added lands after the
  row it followed on that side (the nearest one the merge keeps), or first.
- **Canonical.** A key whose merged value is Unset is dropped (ADR-0021). A
  top-level row array the merge empties is `[]`, since Merge cannot answer
  "absent": versionkit's `Validate` then reports it `not_canonical`, and the
  merge waits for a person.

### Conflict paths

`/`-separated, without a leading `/` (versionkit prefixes the Field's
Accessor), each segment an Accessor, a row's `_id` or `_order`, escaped as in
RFC 6901 (`~` as `~0`, `/` as `~1`). Never an index: indices shift between
base, ours and theirs.

| Conflict | Path |
|---|---|
| column `name` of row `a1`, changed differently | `a1/name` |
| row `a2`, removed on one side and changed on the other | `a2` |
| `title` of row `k1` inside row `a3`'s `books` | `a3/books/k1/title` |
| a Fieldset's child `city` | `city` |
| the rows' order, reordered differently on both sides | `_order` |
| the order of row `a1`'s `items` | `a1/items/_order` |

## Failures

A value its type cannot hold — a row array that is not an array of objects
each with a well-formed `_id` no other row holds, a Fieldset value that is
not an object, text that is not one JSON value — and Settings that do not
decode as a `SchemaSettings` are an `err`, never a difference or a Conflict:
stored data is validated (`ValidateValue`), so they mean the wrong thing was
handed in. versionkit aborts the call on one.

## Rich text

`rich_text` delegates both to knkeditor's Go module
(`github.com/knkcms/knkeditor/go`, fieldkit#216; `go/rich_text.go`):

- **Compare** is knkeditor's `Compare`. `equal` is its `unchanged` — nodes
  matched by node id, attributes read with their defaults, marks in any
  order — and the detail is its `Comparison` nested unchanged, at the top of
  the Field and as a changed rich-text child inside a row's `fields`:

  ```json
  {
  	"status": "changed",
  	"nodes": [
  		{ "status": "changed", "id": "a", "type": "textWrapper", "a": 0, "b": 0, "content": true },
  		{ "status": "unchanged", "id": "b", "type": "textWrapper", "a": 1, "b": 1 }
  	]
  }
  ```

- **Merge** is knkeditor's `NewMerger(vocabulary, textType).MergeJSON`, per
  top-level node by node id, with the result validated under the Field's
  Text Type — the part its `text_type` pins, which the Settings' `parts`
  must hold (a Merge without it is an `err`). A Conflict is the node's id
  below the Field's path (`body/a`, `r1/body/a` in a row), a JSON Pointer
  into the merged document for an invalid merge outside such a node, or the
  Field itself.

## Still to come

`reference` and `single_reference` trees (#215) plug into the same composer
(`finerRuleFor` in `go/compare.go`): a tree's nodes compare and merge by
`_id` with their parent and position as fields. Until then they compare and
merge as whole values.
