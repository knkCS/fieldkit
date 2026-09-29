package publishing

import (
	"strconv"

	fieldkit "github.com/knkcs/fieldkit/go"
)

// referenceFilter is reference_filter: the Content ids a Reference leaves
// out. Its only Position is reference_spec, which the Catalogue records and
// ValidateSpec enforces. It has no settings of its own and no text, yields
// one exclude edge per distinct id, and compares and merges as a whole value.
var referenceFilter = fieldkit.TypeCode{ //nolint:gochecknoglobals
	Value: referenceFilterValue,
	Edges: referenceFilterEdges,
}

// referenceFilterValue is the Go reading of its toZodType,
// z.array(z.string().min(1)): a list of ids, each a string that is not "".
// A required Field's empty list is Unset, which ValidateValue reports as
// required before this runs.
func referenceFilterValue(_ fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.Error {
	items, ok := value.([]any)
	if !ok {
		return []fieldkit.Error{{Path: "", Code: fieldkit.CodeInvalidType}}
	}
	var errs []fieldkit.Error
	for i, item := range items {
		at := fieldkit.JoinPath("", strconv.Itoa(i))
		id, ok := item.(string)
		switch {
		case !ok:
			errs = append(errs, fieldkit.Error{Path: at, Code: fieldkit.CodeInvalidType})
		case id == "":
			errs = append(errs, fieldkit.Error{Path: at, Code: fieldkit.CodeTooSmall, Params: map[string]any{"minimum": 1}})
		}
	}
	return errs
}

// referenceFilterEdges are one EdgeExclude per Content id, at the Field — the
// value is one whole, never addressed by index — its target the Content, with
// no Pin (#223 D8): which Titles exclude a Content is then a question the
// Content Graph answers. An id listed twice is one edge, as a media Field's
// Asset is; an item that is not a non-empty string yields none. TS's
// referenceFilterEdges.
func referenceFilterEdges(_ fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.Edge {
	items, _ := value.([]any)
	seen := map[string]bool{}
	var edges []fieldkit.Edge
	for _, item := range items {
		id, ok := nonEmpty(item)
		if !ok || seen[id] {
			continue
		}
		seen[id] = true
		edges = append(edges, fieldkit.Edge{Kind: fieldkit.EdgeExclude, Target: fieldkit.Target{Content: id}})
	}
	return edges
}
