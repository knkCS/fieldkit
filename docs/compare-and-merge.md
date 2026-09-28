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
| `Type` | a `Comparer`; a `Merger` for `group`, `virtual_table`, `blocks`, `fieldset`, `reference` and `single_reference` |

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

Every type but the six below compares as a whole value: `equal` only, and
**no detail**. The six answer with detail when not equal:

```ts
// group, virtual_table, blocks — and reference, over every node of the tree
type RowsDetail = { status: "changed"; items: Item[] };
// fieldset — and single_reference, when both sides hold the same node
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

### Reference trees

A `reference` value is compared **per node, by `_id`, at every level** — a
flat list of items over the whole tree:

- **`items`** lists every node of `b` in `b`'s document order (a node before
  its branch), each node only `a` holds after the node it followed in `a`'s.
- A node's **fields** are `id`, `pin`, `values` — a record detail, per Field
  of the Reference Spec — and **`_parent`**, its parent's `_id` (absent for a
  root): a node moved to another parent is `changed` with `_parent` changed.
- **`moved`** is a node whose place among the siblings both sides hold under
  the same parent changed.
- A Field that links a Reference Spec per Blueprint compares `values` key by
  key as whole values: which Reference Spec a node follows needs its target's
  Blueprint, which Compare is not told.

A `single_reference` holding the same node on both sides — one `_id` —
compares per field as a tree's node does, as a record detail; a different
node is a whole value.

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

Whole-value types have no `Merge`: versionkit merges them itself. The six
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
- **Trees.** A `reference` merges **per node, by `_id`**, whatever level a
  node sits at, a node's parent and position counting as its fields: a move
  on one side and a values edit on the other merge cleanly, and so do a
  reorder on one side and a new child on the other. Moves of one node to
  different parents on both sides are a Conflict at `<_id>/_parent`, as is a
  node whose merged parent the merge removed, or whose merged parents make a
  cycle. Each parent's children merge in order as a row array does, their
  order Conflict at `_order` for the roots and `<_id>/children/_order` for a
  node's. A `single_reference` holding one node on all three sides merges per
  field; a different node on a side is a Conflict at the Field.
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
| node `n3` of a tree, moved to different parents on both sides | `n3/_parent` |
| the order of node `n1`'s children | `n1/children/_order` |
| the page in node `n2`'s values, changed differently | `n2/values/page` |

## Failures

A value its type cannot hold — a row array that is not an array of objects
each with a well-formed `_id` no other row holds, a Fieldset value that is
not an object, text that is not one JSON value — and Settings that do not
decode as a `SchemaSettings` are an `err`, never a difference or a Conflict:
stored data is validated (`ValidateValue`), so they mean the wrong thing was
handed in. versionkit aborts the call on one.

A tree whose nodes are not objects each with a well-formed `_id` no other node
at any level holds, or whose `children` are not a list, is an `err` too.

## Still to come

`rich_text` (#216) plugs into the same composer (`finerRuleFor` in
`go/compare.go`), delegating to knkeditor with the Text Type from `parts`.
Until then it compares and merges as a whole value.
