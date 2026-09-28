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
// nodes' values yield theirs, through Records — and compares and merges as a
// whole value. TS's src/publishing/field-types/outline-tree.ts is the other
// half.
var outlineTree = fieldkit.TypeCode{ //nolint:gochecknoglobals
	ChildrenPosition: fieldkit.PositionReferenceSpec,
	Value:            outlineTreeValue,
	Records:          outlineTreeRecords,
	MintIDs:          outlineTreeMint,
}

// outlineTreeValue is the Go reading of its toZodType: an array of nodes
// {_id, values?, children?} (ADR-0023), at every level, by the rules a
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
// Keys a node holds besides these are ignored, as TS's object schema strips
// them.
func outlineTreeValue(f fieldkit.Field, _ map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.Error {
	return env.ValidateTree(nil, value, func(node map[string]any, path string) []fieldkit.Error {
		valuesAt := fieldkit.JoinPath(path, "values")
		values, present := node["values"]
		record, isRecord := values.(map[string]any)
		switch {
		case present && !isRecord:
			return []fieldkit.Error{{Path: valuesAt, Code: fieldkit.CodeInvalidType}}
		case f.Children == nil:
			return nil
		case !present:
			record = map[string]any{}
		}
		errs := env.ValidateFields(f.Children, record)
		for i := range errs {
			errs[i].Path = valuesAt + errs[i].Path
		}
		return errs
	})
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
