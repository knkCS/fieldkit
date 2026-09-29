package publishing

import (
	fieldkit "github.com/knkcs/fieldkit/go"
)

// outlineTree is outline_tree: a publication's outline, a tree of nodes each
// described by one Blueprint Release. Its settings are two Pins the Catalogue
// records — blueprint, which Resolve inlines as the Field's children, and
// text_type, a Text Type Release stored in the Resolved Spec's parts — so
// Pins and Resolve honour them with no code here. The node Fields sit in the
// reference_spec Position (ChildrenPosition): a node is filled in a drawer,
// as a Reference's values are. It has no text and no edges of its own — its
// nodes' values yield theirs, through Records — and compares and merges per
// node, by _id, as a Reference Tree does. TS's
// src/publishing/field-types/outline-tree.ts is the other half.
var outlineTree = fieldkit.TypeCode{ //nolint:gochecknoglobals
	ChildrenPosition: fieldkit.PositionReferenceSpec,
	Value:            outlineTreeValue,
	Records:          outlineTreeRecords,
	Compare:          outlineTreeCompare,
	Merge:            outlineTreeMerge,
	MintIDs:          outlineTreeMint,
}

// The keys an outline node may hold (TS's OutlineNode): its _id, values and
// children, and the TOC-generation keys contenthub reads and fieldkit only
// holds (#286) — origin, one of outlineOrigins; overridden, a boolean; and
// source, the id of the Content the node stands for.
var (
	outlineNodeKeys = map[string]bool{"_id": true, "values": true, "children": true, "origin": true, "overridden": true, "source": true} //nolint:gochecknoglobals
	outlineOrigins  = map[string]bool{"generated": true, "manual": true}                                                                 //nolint:gochecknoglobals
)

// outlineTreeValue is the Go reading of its toZodType: an array of nodes
// {_id, values?, origin?, overridden?, source?, children?} (ADR-0023), at every level, by the rules a
// Reference Tree follows (TypeEnv.ValidateTree) — every _id unique across the
// tree, each node an object with an _id as a row's, children a list — with no
// caps: an outline has no max_items or max_depth, so its settings are not
// handed on.
//
// Each node's values, when present, are a record. Resolved (children
// present), they are checked against the Field's children through the
// composer — a node without values as {}, so a required node Field is
// required. Unresolved, values are an opaque record.
//
// The node is strict, as TS's object schema is: a key but those in
// outlineNodeKeys is one CodeInvalidValue at the node. origin is a string
// (CodeInvalidType) naming one of outlineOrigins (CodeInvalidValue),
// overridden a boolean and source a string (CodeInvalidType).
func outlineTreeValue(f fieldkit.Field, _ map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.Error {
	return env.ValidateTree(nil, value, func(node map[string]any, path string) []fieldkit.Error {
		errs := outlineNodeKeysValue(node, path)
		valuesAt := fieldkit.JoinPath(path, "values")
		values, present := node["values"]
		record, isRecord := values.(map[string]any)
		switch {
		case present && !isRecord:
			return append(errs, fieldkit.Error{Path: valuesAt, Code: fieldkit.CodeInvalidType})
		case f.Children == nil:
			return errs
		case !present:
			record = map[string]any{}
		}
		fieldErrs := env.ValidateFields(f.Children, record)
		for i := range fieldErrs {
			fieldErrs[i].Path = valuesAt + fieldErrs[i].Path
		}
		return append(errs, fieldErrs...)
	})
}

// outlineNodeKeysValue checks a node's own keys but values and children: no
// key outside outlineNodeKeys, and origin, overridden and source each of its
// type.
func outlineNodeKeysValue(node map[string]any, path string) []fieldkit.Error {
	var errs []fieldkit.Error
	add := func(key, code string) {
		errs = append(errs, fieldkit.Error{Path: fieldkit.JoinPath(path, key), Code: code})
	}
	if hasUnknownKey(node, outlineNodeKeys) {
		errs = append(errs, fieldkit.Error{Path: path, Code: fieldkit.CodeInvalidValue})
	}
	if origin, present := node["origin"]; present {
		name, ok := origin.(string)
		switch {
		case !ok:
			add("origin", fieldkit.CodeInvalidType)
		case !outlineOrigins[name]:
			add("origin", fieldkit.CodeInvalidValue)
		}
	}
	if overridden, present := node["overridden"]; present {
		if _, ok := overridden.(bool); !ok {
			add("overridden", fieldkit.CodeInvalidType)
		}
	}
	if source, present := node["source"]; present && !isString(source) {
		add("source", fieldkit.CodeInvalidType)
	}
	return errs
}

// outlineNodeFields describe a node's record for Compare and Merge: its
// values as a record of the node Fields — key by key as whole values while
// the Field is unresolved. origin, overridden and source are whole values;
// the parent and position are the tree's.
func outlineNodeFields(f fieldkit.Field) func(...map[string]any) []fieldkit.Field {
	fields := []fieldkit.Field{{FieldType: "fieldset", Config: fieldkit.Config{APIAccessor: "values"}, Children: f.Children}}
	return func(...map[string]any) []fieldkit.Field { return fields }
}

// outlineTreeCompare compares per node by _id, as a Reference Tree does.
func outlineTreeCompare(f fieldkit.Field, a, b any, env fieldkit.TypeEnv) (bool, *fieldkit.CompareDetail, error) {
	return env.CompareTree(f, a, b, outlineNodeFields(f))
}

// outlineTreeMerge merges per node by _id, as a Reference Tree does: a node's
// origin, overridden, source and parent each a field of it, its values per
// node Field. Unlike a manipulation_tree's intent, no key constrains the
// others, so a merged node needs no coherence check.
func outlineTreeMerge(f fieldkit.Field, base, ours, theirs any, env fieldkit.TypeEnv) (any, []string, error) {
	return env.MergeTree(f, base, ours, theirs, outlineNodeFields(f))
}

// outlineTreeRecords are each node's values against the Field's children —
// the node Fields its Blueprint Release declares — at every level, for the
// walkers. Unresolved (no children), a node's values are opaque and hold
// none. TS's outlineTreeRecords.
func outlineTreeRecords(f fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.HeldRecord {
	if len(f.Children) == 0 {
		return nil
	}
	var records []fieldkit.HeldRecord
	fieldkit.EachTreeNode(value, func(node map[string]any, path string) {
		if values, ok := node["values"].(map[string]any); ok {
			records = append(records, fieldkit.HeldRecord{Fields: f.Children, Record: values, Path: fieldkit.JoinPath(path, "values")})
		}
	})
	return records
}

// outlineTreeMint gives every node an _id where it has none, deterministically
// (ADR-0023), as a Reference Tree's are minted. A node's values hold no rows —
// the reference_spec Position admits none — so nothing inside them needs one.
func outlineTreeMint(_ fieldkit.Field, value any, env fieldkit.TypeEnv) any {
	env.MintTree(value)
	return value
}
