package fieldkit

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// The statuses a CompareDetail and a CompareItem carry: versionkit's own four
// field statuses, applied one level down.
const (
	StatusUnchanged = "unchanged"
	StatusAdded     = "added"
	StatusRemoved   = "removed"
	StatusChanged   = "changed"
)

// OrderSegment is the conflict path segment of a row array's order: reorders
// on both sides that disagree conflict at "<array>/_order" (ADR-0023).
const OrderSegment = "_order"

// CompareDetail is the detail Compare returns for a type that compares finer
// than a whole value (docs/compare-and-merge.md), and what each changed child
// Field is described by inside it.
//
//   - A row array — group, virtual_table, blocks — is
//     {status, items: [...]}, one CompareItem per row of either value; a
//     reference tree the same, one per node at every level.
//   - A record — fieldset, and a single_reference holding one node on both
//     sides — is {status, fields: {...}}.
//   - A child Field of any other type is {status} alone.
//
// At the top of a Field Status is always "changed": versionkit calls Compare
// only for a Field present on both sides, and reads no detail when they are
// equal. Inside Fields, a child only one side holds is "added" or "removed",
// with nothing more.
type CompareDetail struct {
	Status string                   `json:"status"`
	Items  []CompareItem            `json:"items,omitempty"`
	Fields map[string]CompareDetail `json:"fields,omitempty"`
}

// CompareItem is one row of a row array in a CompareDetail, by its _id.
//
// Status is the row's content: "added" or "removed" when only one side holds
// the row, "changed" when a child Field differs — each such child is in
// Fields by its Accessor, a key the Spec does not name (a Block's _type) by
// itself — and "unchanged" otherwise. Moved is separate: the row is on both
// sides but its place among the rows both hold changed. Items list every row
// of b in b's order, each row only a holds after the row it followed in a.
type CompareItem struct {
	ID     string                   `json:"_id"`
	Status string                   `json:"status"`
	Moved  bool                     `json:"moved,omitempty"`
	Fields map[string]CompareDetail `json:"fields,omitempty"`
}

// finerRule is a type's Compare and Merge finer than a whole value. It hands
// what it holds to the composer, so it never learns its children's types
// (ADR-0007): the reference types' (reference_compare.go) are here, and
// rich_text (#216) plugs in beside them.
type finerRule struct {
	compare func(c *composer, f *Field, a, b any) (bool, *CompareDetail, error)
	merge   func(c *composer, f *Field, base, ours, theirs any, path string) (any, error)
}

// finerRuleFor is the finer rule of a type, if it has one. A switch, as
// containerRuleFor is: the rules recurse through the composer.
func finerRuleFor(fieldType string) (finerRule, bool) {
	switch fieldType {
	case "group", "virtual_table":
		return finerRule{compare: compareRowsOf(childrenOf), merge: mergeRowsOf(childrenOf)}, true
	case "blocks":
		return finerRule{compare: compareRowsOf(blockFieldsOf), merge: mergeRowsOf(blockFieldsOf)}, true
	case "fieldset":
		return finerRule{compare: compareFieldset, merge: mergeFieldset}, true
	case "reference":
		return finerRule{compare: compareReferenceTree, merge: mergeReferenceTree}, true
	case "single_reference":
		return finerRule{compare: compareSingleReference, merge: mergeSingleReference}, true
	}
	return finerRule{}, false
}

// composer compares and merges a value by its Field's type, dispatching
// children to their own types (ADR-0007). It holds the parts the Field pins,
// for the types that will need them (rich_text's Text Type), and the Merge's
// conflicts.
type composer struct {
	parts     map[string]map[string]json.RawMessage
	conflicts []string
}

// compare compares two present values of a Field — nil for a key no Field
// describes, which is compared as a whole value.
func (c *composer) compare(f *Field, a, b any) (bool, *CompareDetail, error) {
	if f != nil {
		if rule, ok := finerRuleFor(f.FieldType); ok {
			return rule.compare(c, f, a, b)
		}
	}
	return sameValue(a, b), nil, nil
}

// merge three-way merges three present values of a Field at path, where path
// is /-led and each segment escaped. A side that did not change it takes the
// other; both changing it alike is no conflict; otherwise a type with a finer
// rule merges it, and any other is a Conflict at path.
func (c *composer) merge(f *Field, base, ours, theirs any, path string) (any, error) {
	switch {
	case sameValue(ours, theirs), sameValue(base, theirs):
		return ours, nil
	case sameValue(base, ours):
		return theirs, nil
	}
	if f != nil {
		if rule, ok := finerRuleFor(f.FieldType); ok {
			return rule.merge(c, f, base, ours, theirs, path)
		}
	}
	c.conflict(path)
	return nil, nil
}

func (c *composer) conflict(path string) {
	c.conflicts = append(c.conflicts, strings.TrimPrefix(path, "/"))
}

// compareRecord compares two records — rows, a Fieldset's — key by key, each
// by the Field of fields with that Accessor, and returns the keys that differ.
// A key no Field names is compared as a whole value. _id is the row's
// identity, not its content.
func (c *composer) compareRecord(fields []Field, a, b map[string]any) (map[string]CompareDetail, error) {
	out := map[string]CompareDetail{}
	for _, key := range unionKeys(a, b) {
		if key == "_id" {
			continue
		}
		va, inA := a[key]
		vb, inB := b[key]
		switch {
		case !inA:
			out[key] = CompareDetail{Status: StatusAdded}
		case !inB:
			out[key] = CompareDetail{Status: StatusRemoved}
		default:
			equal, detail, err := c.compare(fieldNamed(fields, key), va, vb)
			if err != nil {
				return nil, err
			}
			if equal {
				continue
			}
			if detail == nil {
				detail = &CompareDetail{Status: StatusChanged}
			}
			out[key] = *detail
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

// mergeRecord three-way merges three records key by key at path, each key by
// the Field of fields with that Accessor, and drops a key whose merged value
// is Unset: the merge is canonical (ADR-0021).
func (c *composer) mergeRecord(fields []Field, base, ours, theirs map[string]any, path string) (map[string]any, error) {
	out := map[string]any{}
	for _, key := range unionKeys(base, ours, theirs) {
		b, inB := base[key]
		o, inO := ours[key]
		t, inT := theirs[key]
		at := joinPath(path, key)
		var value any
		keep := false
		switch {
		case samePresent(o, inO, t, inT), samePresent(b, inB, t, inT):
			value, keep = o, inO
		case samePresent(b, inB, o, inO):
			value, keep = t, inT
		case inB && inO && inT:
			merged, err := c.merge(fieldNamed(fields, key), b, o, t, at)
			if err != nil {
				return nil, err
			}
			value, keep = merged, true
		default:
			// One side removed it and the other changed it, or both added it
			// differently.
			c.conflict(at)
		}
		if keep {
			if value = stripUnset(value); !isUnset(value) {
				out[key] = value
			}
		}
	}
	return out, nil
}

// fieldNamed is the Field of fields with an Accessor, nil when none holds a
// value under it.
func fieldNamed(fields []Field, accessor string) *Field {
	for i := range fields {
		if fields[i].Config.APIAccessor == accessor && !markerTypes[fields[i].FieldType] {
			return &fields[i]
		}
	}
	return nil
}

// rowFields are the Fields describing a row of a row array, given the row as
// each side holds it — nil when the sides do not agree on them, so the row's
// keys compare and merge as whole values.
type rowFields func(f *Field, rows ...map[string]any) []Field

// childrenOf is a group's or virtual_table's rows' Fields: its children, nil
// for a linked Row Spec never resolved.
func childrenOf(f *Field, _ ...map[string]any) []Field {
	return f.Children
}

// blockFieldsOf is a Block's Fields: its Block Type's, when every side's Block
// names the same _type.
func blockFieldsOf(f *Field, rows ...map[string]any) []Field {
	typ, ok := rows[0]["_type"].(string)
	if !ok {
		return nil
	}
	for _, row := range rows[1:] {
		if other, ok := row["_type"].(string); !ok || other != typ {
			return nil
		}
	}
	settings, _ := canonicalSettings(f.Settings)
	settingsObj, _ := settings.(map[string]any)
	for _, bt := range blockTypes(settingsObj) {
		if bt.typed && bt.typ == typ {
			return bt.fields
		}
	}
	return nil
}

// rowList is a row array read by _id: the ids in order, and each row.
type rowList struct {
	ids  []string
	rows map[string]map[string]any
}

func (l rowList) has(id string) bool {
	_, ok := l.rows[id]
	return ok
}

// readRows reads a row array. Every row is an object with a well-formed _id
// no other row holds: stored data is validated (ValidateValue), so anything
// else is a failure, not a difference.
func readRows(f *Field, value any) (rowList, error) {
	items, ok := value.([]any)
	if !ok {
		return rowList{}, fmt.Errorf("fieldkit: %s: a %s value is not an array", f.Config.APIAccessor, f.FieldType)
	}
	l := rowList{ids: make([]string, 0, len(items)), rows: make(map[string]map[string]any, len(items))}
	for i, item := range items {
		row, ok := item.(map[string]any)
		if !ok {
			return rowList{}, fmt.Errorf("fieldkit: %s: row %d is not an object", f.Config.APIAccessor, i)
		}
		id, _ := row["_id"].(string)
		if !isRowID(id) {
			return rowList{}, fmt.Errorf("fieldkit: %s: row %d has no well-formed _id", f.Config.APIAccessor, i)
		}
		if l.has(id) {
			return rowList{}, fmt.Errorf("fieldkit: %s: two rows hold the _id %q", f.Config.APIAccessor, id)
		}
		l.ids = append(l.ids, id)
		l.rows[id] = row
	}
	return l, nil
}

// compareRowsOf compares two row arrays row by row, by _id.
func compareRowsOf(fieldsOf rowFields) func(c *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
	return func(c *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
		la, err := readRows(f, a)
		if err != nil {
			return false, nil, err
		}
		lb, err := readRows(f, b)
		if err != nil {
			return false, nil, err
		}
		moved := movedIDs(la.ids, lb.ids)
		equal := true
		var items []CompareItem
		// Rows only a holds, by the row of a before them that b still holds
		// ("" for none): each is listed after it.
		removedAfter := map[string][]string{}
		anchor := ""
		for _, id := range la.ids {
			if lb.has(id) {
				anchor = id
				continue
			}
			removedAfter[anchor] = append(removedAfter[anchor], id)
		}
		removed := func(after string) {
			for _, id := range removedAfter[after] {
				equal = false
				items = append(items, CompareItem{ID: id, Status: StatusRemoved})
			}
		}
		removed("")
		for _, id := range lb.ids {
			rb := lb.rows[id]
			ra, inA := la.rows[id]
			item := CompareItem{ID: id, Status: StatusAdded}
			if inA {
				fields, err := c.compareRecord(fieldsOf(f, ra, rb), ra, rb)
				if err != nil {
					return false, nil, err
				}
				item.Status, item.Fields, item.Moved = StatusUnchanged, fields, moved[id]
				if fields != nil {
					item.Status = StatusChanged
				}
			}
			if item.Status != StatusUnchanged || item.Moved {
				equal = false
			}
			items = append(items, item)
			removed(id)
		}
		if equal {
			return true, nil, nil
		}
		return false, &CompareDetail{Status: StatusChanged, Items: items}, nil
	}
}

// movedIDs are the rows both lists hold whose place among those rows changed:
// all but a longest run both lists hold in the same order, so one row dragged
// elsewhere is the one row marked moved. Of two swapped rows, the one b moved
// ahead of the other is marked.
func movedIDs(a, b []string) map[string]bool {
	inB := map[string]bool{}
	for _, id := range b {
		inB[id] = true
	}
	inA := map[string]bool{}
	var ca, cb []string
	for _, id := range a {
		if inB[id] {
			inA[id] = true
			ca = append(ca, id)
		}
	}
	for _, id := range b {
		if inA[id] {
			cb = append(cb, id)
		}
	}
	kept := longestCommonSubsequence(ca, cb)
	moved := map[string]bool{}
	for _, id := range cb {
		if !kept[id] {
			moved[id] = true
		}
	}
	return moved
}

// longestCommonSubsequence is a longest run of ids a and b hold in the same
// order, as a set. a and b hold the same ids, each once.
func longestCommonSubsequence(a, b []string) map[string]bool {
	n, m := len(a), len(b)
	table := make([][]int, n+1)
	for i := range table {
		table[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				table[i][j] = table[i+1][j+1] + 1
			} else {
				table[i][j] = max(table[i+1][j], table[i][j+1])
			}
		}
	}
	kept := map[string]bool{}
	for i, j := 0, 0; i < n && j < m; {
		switch {
		case a[i] == b[j]:
			kept[a[i]] = true
			i++
			j++
		case table[i][j+1] >= table[i+1][j]:
			// On a tie a's earlier row keeps its place, so the row that moved
			// ahead of it is the one marked moved.
			j++
		default:
			i++
		}
	}
	return kept
}

// mergeRowsOf three-way merges row arrays per row, by _id (ADR-0023):
//
//   - A row only one side changed, added or removed takes that side. A row
//     both sides changed merges per child Field, each by its own type; one
//     side removing a row the other changed is a Conflict at the row.
//   - A reorder on one side is taken. Reorders on both sides that disagree
//     on the rows all three hold are a Conflict at _order.
//   - A row the side whose order is not taken added lands after the row it
//     followed on that side (the nearest one the merge keeps), or first.
func mergeRowsOf(fieldsOf rowFields) func(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
	return func(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
		lists := [3]rowList{}
		for i, value := range []any{base, ours, theirs} {
			l, err := readRows(f, value)
			if err != nil {
				return nil, err
			}
			lists[i] = l
		}
		lb, lo, lt := lists[0], lists[1], lists[2]

		kept := map[string]any{}
		seen := map[string]bool{}
		for _, ids := range [][]string{lo.ids, lt.ids, lb.ids} {
			for _, id := range ids {
				if seen[id] {
					continue
				}
				seen[id] = true
				b, inB := lb.rows[id]
				o, inO := lo.rows[id]
				t, inT := lt.rows[id]
				at := joinPath(path, id)
				switch {
				case samePresent(o, inO, t, inT), samePresent(b, inB, t, inT):
					if inO {
						kept[id] = o
					}
				case samePresent(b, inB, o, inO):
					if inT {
						kept[id] = t
					}
				case inB && inO && inT:
					row, err := c.mergeRecord(fieldsOf(f, b, o, t), b, o, t, at)
					if err != nil {
						return nil, err
					}
					kept[id] = row
				default:
					c.conflict(at)
				}
			}
		}

		source, other := lo.ids, lt.ids
		oursMoved, theirsMoved := reordered(lb, lo), reordered(lb, lt)
		switch {
		case oursMoved && theirsMoved:
			held := func(id string) bool { return lb.has(id) && lo.has(id) && lt.has(id) }
			if !slices.Equal(filterIDs(lo.ids, held), filterIDs(lt.ids, held)) {
				c.conflict(joinPath(path, OrderSegment))
			}
		case theirsMoved:
			source, other = lt.ids, lo.ids
		}
		order := filterIDs(source, func(id string) bool { _, ok := kept[id]; return ok })
		for i, id := range other {
			if _, ok := kept[id]; !ok || slices.Contains(order, id) {
				continue
			}
			at := 0
			for j := i - 1; j >= 0; j-- {
				if k := slices.Index(order, other[j]); k >= 0 {
					at = k + 1
					break
				}
			}
			order = slices.Insert(order, at, id)
		}

		merged := make([]any, len(order))
		for i, id := range order {
			merged[i] = kept[id]
		}
		return merged, nil
	}
}

// reordered reports whether side changed the order of the rows it shares with
// base.
func reordered(base, side rowList) bool {
	return !slices.Equal(filterIDs(base.ids, side.has), filterIDs(side.ids, base.has))
}

func filterIDs(ids []string, keep func(string) bool) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if keep(id) {
			out = append(out, id)
		}
	}
	return out
}

// compareFieldset compares a Fieldset's record per child Field.
func compareFieldset(c *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
	ra, err := readRecord(f, a)
	if err != nil {
		return false, nil, err
	}
	rb, err := readRecord(f, b)
	if err != nil {
		return false, nil, err
	}
	fields, err := c.compareRecord(f.Children, ra, rb)
	if err != nil {
		return false, nil, err
	}
	if fields == nil {
		return true, nil, nil
	}
	return false, &CompareDetail{Status: StatusChanged, Fields: fields}, nil
}

// mergeFieldset merges a Fieldset's record per child Field: a Fieldset is one
// record, so two sides editing different children never conflict.
func mergeFieldset(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
	records := [3]map[string]any{}
	for i, value := range []any{base, ours, theirs} {
		r, err := readRecord(f, value)
		if err != nil {
			return nil, err
		}
		records[i] = r
	}
	return c.mergeRecord(f.Children, records[0], records[1], records[2], path)
}

func readRecord(f *Field, value any) (map[string]any, error) {
	record, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("fieldkit: %s: a %s value is not an object", f.Config.APIAccessor, f.FieldType)
	}
	return record, nil
}

// decodeStored decodes a stored value in canonical form: numbers kept as
// written, Unset keys dropped (ADR-0021), so two spellings of one value decode
// alike.
func decodeStored(raw json.RawMessage) (any, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, errors.New("fieldkit: no value")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, fmt.Errorf("fieldkit: a value is not JSON: %w", err)
	}
	if dec.More() {
		return nil, errors.New("fieldkit: a value is more than one JSON value")
	}
	return stripUnset(value), nil
}

// encodeValue encodes a merged value: numbers as they were written, keys
// sorted, nothing HTML-escaped.
func encodeValue(value any) (json.RawMessage, error) {
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimRight(out.Bytes(), "\n"), nil
}

// sameValue reports whether two decoded values are the same JSON value:
// numbers by value (1, 1.0 and 1e0 are one number, read as JS reads them),
// objects whatever their key order.
func sameValue(a, b any) bool {
	switch x := a.(type) {
	case json.Number:
		y, ok := b.(json.Number)
		return ok && jsNumber(x) == jsNumber(y)
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !sameValue(x[i], y[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		y, ok := b.(map[string]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for key, value := range x {
			other, ok := y[key]
			if !ok || !sameValue(value, other) {
				return false
			}
		}
		return true
	case string, bool, nil:
		return a == b
	}
	return false
}

// jsNumber is a number as JS reads it: float64, ±Inf beyond its range.
func jsNumber(n json.Number) float64 {
	f, _ := strconv.ParseFloat(n.String(), 64)
	return f
}

// samePresent reports whether a key holds the same value on two sides —
// absent on both counts as the same.
func samePresent(x any, inX bool, y any, inY bool) bool {
	return inX == inY && (!inX || sameValue(x, y))
}

// unionKeys are the keys any of the records holds, sorted, so detail and
// conflicts come in one order.
func unionKeys(records ...map[string]any) []string {
	seen := map[string]bool{}
	var keys []string
	for _, r := range records {
		for key := range r {
			if !seen[key] {
				seen[key] = true
				keys = append(keys, key)
			}
		}
	}
	slices.Sort(keys)
	return keys
}
