package fieldkit

import (
	"fmt"
	"slices"
)

// Compare and Merge of the Reference types (ADR-0023,
// docs/compare-and-merge.md). A Reference Tree compares and merges per node,
// by _id, whatever level a node sits at: a node's parent and its position
// among its siblings count as its fields, so a move on one side and a values
// edit on the other merge cleanly. A node's fields are its id, its pin, its
// values — per Field of the Reference Spec — and its parent, _parent (absent
// at the root).

// ParentSegment is the field a tree node's parent is compared and merged as:
// the parent's _id, absent for a root.
const ParentSegment = "_parent"

// referenceNodeFields are the Fields describing a node's record for the
// composer: its values as a record of the Reference Spec's Fields — the
// embedded one; where the Field links a Reference Spec, which one a node
// follows is not known here, and its values compare and merge key by key as
// whole values. Every other key is a whole value.
func referenceNodeFields(f *Field) []Field {
	settings, _ := canonicalSettings(f.Settings)
	settingsObj, _ := settings.(map[string]any)
	values := Field{FieldType: "fieldset", Config: Config{APIAccessor: "values"}}
	if fields, known := referenceSpecFor(settingsObj, ""); known {
		values.Children = fields
	}
	return []Field{values}
}

// referenceTree is a Reference Tree read by _id: its nodes in document
// order, each node's record — every key but _id and children, with its
// parent as ParentSegment — and each parent's children in order ("" for the
// roots).
type referenceTree struct {
	order    []string
	records  map[string]map[string]any
	children map[string][]string
}

func (t referenceTree) has(id string) bool {
	_, ok := t.records[id]
	return ok
}

// readReferenceTree reads a tree value. Every node is an object with a
// well-formed _id no other node at any level holds, and its children, if
// any, a list: stored data is validated, so anything else is a failure.
func readReferenceTree(f *Field, value any) (referenceTree, error) {
	nodes, ok := value.([]any)
	if !ok {
		return referenceTree{}, fmt.Errorf("fieldkit: %s: a %s value is not an array", f.Config.APIAccessor, f.FieldType)
	}
	t := referenceTree{records: map[string]map[string]any{}, children: map[string][]string{}}
	var walk func(nodes []any, parent string) error
	walk = func(nodes []any, parent string) error {
		for i, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				return fmt.Errorf("fieldkit: %s: node %d is not an object", f.Config.APIAccessor, i)
			}
			id, _ := node["_id"].(string)
			if !isRowID(id) {
				return fmt.Errorf("fieldkit: %s: node %d has no well-formed _id", f.Config.APIAccessor, i)
			}
			if t.has(id) {
				return fmt.Errorf("fieldkit: %s: two nodes hold the _id %q", f.Config.APIAccessor, id)
			}
			record := make(map[string]any, len(node))
			for key, v := range node {
				if key != "_id" && key != "children" {
					record[key] = v
				}
			}
			if parent != "" {
				record[ParentSegment] = parent
			}
			t.order = append(t.order, id)
			t.records[id] = record
			t.children[parent] = append(t.children[parent], id)
			if branch, present := node["children"]; present {
				list, ok := branch.([]any)
				if !ok {
					return fmt.Errorf("fieldkit: %s: the children of %q are not an array", f.Config.APIAccessor, id)
				}
				if err := walk(list, id); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := walk(nodes, ""); err != nil {
		return referenceTree{}, err
	}
	return t, nil
}

// treeFields are the Fields describing a tree node's record for the
// composer, given the node as each side holds it: what compares and merges
// its keys finer than whole values. A Reference's are its Field's alone
// (referenceNodeFields); a tree type of a Catalogue section may choose by the
// node — a manipulation_tree node's values follow the Spec its intent names.
type treeFields func(nodes ...map[string]any) []Field

// compareReferenceTree compares two Reference Trees node by node (compareTree).
func compareReferenceTree(c *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
	fields := referenceNodeFields(f)
	return compareTree(c, f, a, b, func(...map[string]any) []Field { return fields })
}

// compareTree compares two trees node by node, by _id: the detail row arrays
// give, over every node at every level. Items list every node of b in b's
// document order, each node only a holds after the node it followed in a's; a
// node is moved when its place among the siblings both trees hold under the
// same parent changed, and a changed parent is its _parent field. fieldsOf
// describes each node's record.
func compareTree(c *composer, f *Field, a, b any, fieldsOf treeFields) (bool, *CompareDetail, error) {
	ta, err := readReferenceTree(f, a)
	if err != nil {
		return false, nil, err
	}
	tb, err := readReferenceTree(f, b)
	if err != nil {
		return false, nil, err
	}
	moved := map[string]bool{}
	for parent, siblings := range tb.children {
		for id := range movedIDs(ta.children[parent], siblings) {
			moved[id] = true
		}
	}
	equal := true
	var items []CompareItem
	removedAfter := map[string][]string{}
	anchor := ""
	for _, id := range ta.order {
		if tb.has(id) {
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
	for _, id := range tb.order {
		item := CompareItem{ID: id, Status: StatusAdded}
		if ra, inA := ta.records[id]; inA {
			rb := tb.records[id]
			changed, err := c.compareRecord(fieldsOf(ra, rb), ra, rb)
			if err != nil {
				return false, nil, err
			}
			item.Status, item.Fields, item.Moved = StatusUnchanged, changed, moved[id]
			if changed != nil {
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

// mergeReferenceTree three-way merges trees per node, by _id, whatever level
// a node sits at (ADR-0023):
//
//   - a node only one side changed, added or removed takes that side; a node
//     both sides changed merges per field — id, pin, values per Field of the
//     Reference Spec, and its parent, so a move on one side and a values edit
//     on the other is clean, and moves to different parents on both sides are
//     a Conflict at <_id>/_parent; one side removing a node the other changed
//     is a Conflict at the node;
//   - a node whose merged parent the merge removed, or whose merged parents
//     make a cycle, is a Conflict at <_id>/_parent;
//   - the siblings under each parent merge as a row array's order does: a
//     reorder on one side is taken, reorders on both sides that disagree are
//     a Conflict at _order (the roots) or <_id>/children/_order, and a node
//     the other side added or moved in lands after the node it followed there.
func mergeReferenceTree(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
	fields := referenceNodeFields(f)
	return mergeTree(c, f, base, ours, theirs, path, func(...map[string]any) []Field { return fields })
}

// mergeTree is mergeReferenceTree's merge for any tree, fieldsOf describing
// each node's record.
func mergeTree(c *composer, f *Field, base, ours, theirs any, path string, fieldsOf treeFields) (any, error) {
	var trees [3]referenceTree
	for i, value := range []any{base, ours, theirs} {
		t, err := readReferenceTree(f, value)
		if err != nil {
			return nil, err
		}
		trees[i] = t
	}
	tb, to, tt := trees[0], trees[1], trees[2]

	kept := map[string]map[string]any{}
	var keptOrder []string
	seen := map[string]bool{}
	for _, ids := range [][]string{to.order, tt.order, tb.order} {
		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true
			b, inB := tb.records[id]
			o, inO := to.records[id]
			t, inT := tt.records[id]
			at := joinPath(path, id)
			var record map[string]any
			switch {
			case samePresent(asAny(o), inO, asAny(t), inT), samePresent(asAny(b), inB, asAny(t), inT):
				record = o
			case samePresent(asAny(b), inB, asAny(o), inO):
				record = t
			case inB && inO && inT:
				merged, err := c.mergeRecord(fieldsOf(b, o, t), b, o, t, at)
				if err != nil {
					return nil, err
				}
				record = merged
			default:
				c.conflict(at)
			}
			if record != nil {
				kept[id] = record
				keptOrder = append(keptOrder, id)
			}
		}
	}

	parentOf := func(id string) string {
		parent, _ := kept[id][ParentSegment].(string)
		return parent
	}
	conflicts := len(c.conflicts)
	for _, id := range keptOrder {
		parent := parentOf(id)
		if parent != "" && kept[parent] == nil {
			c.conflict(joinPath(path, id, ParentSegment))
			continue
		}
		// A cycle: following the parents from id comes back to it.
		for step, at := 0, parent; at != "" && step <= len(kept); step++ {
			if at == id {
				c.conflict(joinPath(path, id, ParentSegment))
				break
			}
			at = parentOf(at)
		}
	}
	if len(c.conflicts) > conflicts {
		return nil, nil
	}

	childrenOf := map[string][]string{}
	parents := append([]string{""}, keptOrder...)
	for _, parent := range parents {
		here := func(id string) bool { return kept[id] != nil && parentOf(id) == parent }
		sb, so, st := tb.children[parent], to.children[parent], tt.children[parent]
		source, other := so, st
		oursMoved, theirsMoved := reorderedIDs(sb, so), reorderedIDs(sb, st)
		switch {
		case oursMoved && theirsMoved:
			held := func(id string) bool {
				return slices.Contains(sb, id) && slices.Contains(so, id) && slices.Contains(st, id)
			}
			if !slices.Equal(filterIDs(so, held), filterIDs(st, held)) {
				at := joinPath(path, OrderSegment)
				if parent != "" {
					at = joinPath(path, parent, "children", OrderSegment)
				}
				c.conflict(at)
			}
		case theirsMoved:
			source, other = st, so
		}
		order := filterIDs(source, here)
		for i, id := range other {
			if !here(id) || slices.Contains(order, id) {
				continue
			}
			pos := 0
			for j := i - 1; j >= 0; j-- {
				if k := slices.Index(order, other[j]); k >= 0 {
					pos = k + 1
					break
				}
			}
			order = slices.Insert(order, pos, id)
		}
		// A node neither side's list places here — base's alone — goes last.
		for _, id := range keptOrder {
			if here(id) && !slices.Contains(order, id) {
				order = append(order, id)
			}
		}
		if len(order) > 0 {
			childrenOf[parent] = order
		}
	}

	var build func(parent string) []any
	build = func(parent string) []any {
		nodes := make([]any, 0, len(childrenOf[parent]))
		for _, id := range childrenOf[parent] {
			node := make(map[string]any, len(kept[id])+2)
			for key, v := range kept[id] {
				if key != ParentSegment {
					node[key] = v
				}
			}
			node["_id"] = id
			if branch := build(id); len(branch) > 0 {
				node["children"] = branch
			}
			nodes = append(nodes, node)
		}
		return nodes
	}
	return build(""), nil
}

// asAny lets samePresent compare records, which it takes as any.
func asAny(record map[string]any) any {
	if record == nil {
		return nil
	}
	return record
}

// reorderedIDs reports whether side changed the order of the ids it shares
// with base.
func reorderedIDs(base, side []string) bool {
	inSide := func(id string) bool { return slices.Contains(side, id) }
	inBase := func(id string) bool { return slices.Contains(base, id) }
	return !slices.Equal(filterIDs(base, inSide), filterIDs(side, inBase))
}

// compareSingleReference compares two Single References: the same node — one
// _id on both sides — per field, as a tree's node; two different nodes as a
// whole value.
func compareSingleReference(c *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
	ra, okA := a.(map[string]any)
	rb, okB := b.(map[string]any)
	if !okA || !okB || !sameValue(ra["_id"], rb["_id"]) {
		return sameValue(a, b), nil, nil
	}
	fields, err := c.compareRecord(referenceNodeFields(f), ra, rb)
	if err != nil {
		return false, nil, err
	}
	if fields == nil {
		return true, nil, nil
	}
	return false, &CompareDetail{Status: StatusChanged, Fields: fields}, nil
}

// mergeSingleReference merges three Single References per field when all
// three are the same node, and is a Conflict at the Field otherwise: a
// different target is a different Reference.
func mergeSingleReference(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
	records := [3]map[string]any{}
	for i, value := range []any{base, ours, theirs} {
		record, ok := value.(map[string]any)
		if !ok {
			c.conflict(path)
			return nil, nil
		}
		records[i] = record
	}
	if !sameValue(records[0]["_id"], records[1]["_id"]) || !sameValue(records[0]["_id"], records[2]["_id"]) {
		c.conflict(path)
		return nil, nil
	}
	return c.mergeRecord(referenceNodeFields(f), records[0], records[1], records[2], path)
}
