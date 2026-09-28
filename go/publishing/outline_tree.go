package publishing

import (
	"strconv"
	"unicode/utf16"

	fieldkit "github.com/knkcs/fieldkit/go"
)

// outlineTree is outline_tree: a publication's outline, a tree of nodes each
// described by one Blueprint Release. Its settings are two Pins the Catalogue
// records — blueprint, which Resolve inlines as the Field's children, and
// text_type, a Text Type Release stored in the Resolved Spec's parts — so
// Pins and Resolve honour them with no code here. The node Fields sit in the
// reference_spec Position (ChildrenPosition): a node is filled in a drawer,
// as a Reference's values are. It has no text and no edges of its own, and
// compares and merges as a whole value.
//
// Its nodes' values yield no text or edges yet: that needs the Go seam to
// walk a publishing type's records (#219), and TS waits for it too, so the two
// never disagree. TS's src/publishing/field-types/outline-tree.ts is the other
// half.
var outlineTree = fieldkit.TypeCode{ //nolint:gochecknoglobals
	ChildrenPosition: fieldkit.PositionReferenceSpec,
	Value:            outlineTreeValue,
}

// outlineTreeValue is the Go reading of its toZodType: an array of nodes
// {_id, values?, children?} (ADR-0023), at every level.
//
//   - Across the whole tree, whatever else a node gets wrong: every _id is
//     unique at every level, CodeDuplicateID at each repeat in document order.
//   - Each node: an object; its _id as a row's (CodeMissingID at the node,
//     CodeInvalidType or CodeTooBig at the _id); children, when present, an
//     array; values, when present, a record.
//   - Resolved (children present), values are checked against the Field's
//     children through the composer — a node without values as {}, so a
//     required node Field is required. Unresolved, values are an opaque
//     record.
//
// Keys a node holds besides these are ignored, as TS's object schema strips
// them.
func outlineTreeValue(f fieldkit.Field, _ map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.Error {
	nodes, ok := value.([]any)
	if !ok {
		return []fieldkit.Error{{Path: "", Code: fieldkit.CodeInvalidType}}
	}
	var errs []fieldkit.Error
	add := func(path, code string, params map[string]any) {
		errs = append(errs, fieldkit.Error{Path: path, Code: code, Params: params})
	}

	seen := map[string]bool{}
	var unique func(nodes []any, at string)
	unique = func(nodes []any, at string) {
		segments := itemSegments(nodes)
		for i, node := range nodes {
			obj, ok := node.(map[string]any)
			if !ok {
				continue
			}
			nodePath := fieldkit.JoinPath(at, segments[i])
			if id, ok := obj["_id"].(string); ok && isRowID(id) {
				if seen[id] {
					add(nodePath, fieldkit.CodeDuplicateID, nil)
				} else {
					seen[id] = true
				}
			}
			if children, ok := obj["children"].([]any); ok {
				unique(children, fieldkit.JoinPath(nodePath, "children"))
			}
		}
	}
	unique(nodes, "")

	var check func(nodes []any, at string)
	check = func(nodes []any, at string) {
		segments := itemSegments(nodes)
		for i, node := range nodes {
			nodePath := fieldkit.JoinPath(at, segments[i])
			obj, ok := node.(map[string]any)
			if !ok {
				add(nodePath, fieldkit.CodeInvalidType, nil)
				continue
			}
			nodeID(obj, nodePath, add)
			valuesAt := fieldkit.JoinPath(nodePath, "values")
			values, present := obj["values"]
			record, isRecord := values.(map[string]any)
			switch {
			case present && !isRecord:
				add(valuesAt, fieldkit.CodeInvalidType, nil)
			case f.Children != nil:
				if !present {
					record = map[string]any{}
				}
				for _, e := range env.ValidateFields(f.Children, record) {
					add(valuesAt+e.Path, e.Code, e.Params)
				}
			}
			if children, present := obj["children"]; present {
				list, ok := children.([]any)
				if !ok {
					add(fieldkit.JoinPath(nodePath, "children"), fieldkit.CodeInvalidType, nil)
					continue
				}
				check(list, fieldkit.JoinPath(nodePath, "children"))
			}
		}
	}
	check(nodes, "")
	return errs
}

// nodeID checks a node's own _id as fieldkit checks a row's: present
// (CodeMissingID at the node), a string (CodeInvalidType), of at most
// fieldkit.MaxIDLength characters (CodeTooBig). An Unset _id was stripped
// before this, so it is missing.
func nodeID(node map[string]any, at string, add func(path, code string, params map[string]any)) {
	id, present := node["_id"]
	if !present {
		add(at, fieldkit.CodeMissingID, nil)
		return
	}
	s, ok := id.(string)
	if !ok {
		add(fieldkit.JoinPath(at, "_id"), fieldkit.CodeInvalidType, nil)
		return
	}
	if idLength(s) > fieldkit.MaxIDLength {
		add(fieldkit.JoinPath(at, "_id"), fieldkit.CodeTooBig, map[string]any{"maximum": fieldkit.MaxIDLength})
	}
}

// isRowID reports whether a value is a well-formed _id: a non-empty string of
// at most fieldkit.MaxIDLength characters.
func isRowID(id string) bool {
	return id != "" && idLength(id) <= fieldkit.MaxIDLength
}

// idLength is a string's length as JS counts it, in UTF-16 code units.
func idLength(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// itemSegments are the path segments of an array's items (ADR-0023): an
// item's _id when it is an object holding a well-formed one no earlier item
// holds, its index otherwise — fieldkit's own grammar for every value path.
func itemSegments(items []any) []string {
	segments := make([]string, len(items))
	seen := map[string]bool{}
	for i, item := range items {
		segments[i] = strconv.Itoa(i)
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := obj["_id"].(string); ok && isRowID(id) && !seen[id] {
			seen[id] = true
			segments[i] = id
		}
	}
	return segments
}
