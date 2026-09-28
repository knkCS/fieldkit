package fieldkit

import (
	"encoding/json"
	"fmt"
)

// The Content Graph's edge kinds a Field Type yields (contenthub ADR 0009):
// media from a media Field, reference from a Reference (EdgeReference, in
// reference.go), and link, footnote and media from rich text, which knkeditor
// reads. The graph's other kinds — toc, include, exclude, replace, annotate,
// blueprint — are the Consumer's, or the publishing package's.
const (
	// EdgeMedia points at an Asset a media Field or an image in rich text
	// holds.
	EdgeMedia = "media"
	// EdgeLink points at a Content a content link in rich text names, and at
	// an Anchor in it when the link names one.
	EdgeLink = "link"
	// EdgeFootnote points at the Content holding a footnote's body.
	EdgeFootnote = "footnote"
)

// Edge is one edge of the Content Graph a Content's data holds: what it
// points at, of what kind, and from where.
type Edge struct {
	// Path is the value the edge comes from, /-separated from the data's
	// root with each row as its _id (ADR-0023): "/gallery",
	// "/sections/r1/image". A type whose value is one whole — media — yields
	// its edges at the Field's own path, never at an index.
	Path string `json:"path"`
	// Kind is the edge's kind: EdgeMedia, or a kind a later type adds.
	Kind string `json:"kind"`
	// Target is what the edge points at.
	Target Target `json:"target"`
}

// Target is what an Edge points at: exactly one of Content, Asset and
// BlueprintRelease is set. Pin and Anchor narrow a Content. Every id is
// opaque to fieldkit, and never checked to exist.
type Target struct {
	// Content is a Content's id.
	Content string `json:"content,omitempty"`
	// Pin is the Release of Content the edge is pinned to, "" when it
	// follows the Release In Force.
	Pin string `json:"pin,omitempty"`
	// Anchor is a node inside Content's rich text, "" for the Content
	// itself.
	Anchor string `json:"anchor,omitempty"`
	// Asset is a mediahub Asset's id.
	Asset string `json:"asset,omitempty"`
	// BlueprintRelease is a Blueprint Release's id.
	BlueprintRelease string `json:"blueprint_release,omitempty"`
}

// edgeRule is the edges a type's value yields, already canonical and not
// Unset. Paths are relative to the value ("" is the value itself), built
// with joinPath so each segment is escaped as TS's toPath escapes it. A value
// not of the type's shape yields none: the walk reads what ValidateValue
// accepted.
type edgeRule func(f Field, settings map[string]any, value any) []Edge

// edgeRules are the types whose values point at something. A type missing
// here yields no edge — a lookup's bare id among them: it names a row of
// another service, never a Content (contenthub ADR 0010).
var edgeRules = map[string]edgeRule{ //nolint:gochecknoglobals
	"media":            mediaEdges,
	"reference":        referenceTreeEdges,
	"rich_text":        richTextEdges,
	"single_reference": singleReferenceEdges,
}

// mediaEdges are a media Field's Assets, one edge each, at the Field: its
// value is a list of Asset ids. An Asset listed twice is one edge.
func mediaEdges(_ Field, _ map[string]any, value any) []Edge {
	items, _ := value.([]any)
	seen := map[string]bool{}
	var edges []Edge
	for _, item := range items {
		id, ok := item.(string)
		if !ok || id == "" || seen[id] {
			continue
		}
		seen[id] = true
		edges = append(edges, Edge{Kind: EdgeMedia, Target: Target{Asset: id}})
	}
	return edges
}

// Edges are every Content Graph edge a Content's data holds, against the
// Resolved Spec it was validated with: each Field's own, through every
// container at every depth — a group's and a virtual_table's rows, a Block's
// Fields, a resolved fieldset's record, a Reference's values — in Spec order,
// then row order. opts are ValidateValue's: WithTargetBlueprints says which
// Reference Spec a Reference's values follow.
//
// It reads data ValidateValue accepted, and checks nothing: a value of the
// wrong shape yields no edge rather than an error, and markers and hidden
// Fields yield none, as ValidateValue skips them. A lookup yields none. Data
// that is not a JSON object is an error; empty data is {}.
func Edges(resolved *ResolvedSpec, data json.RawMessage, opts ...ValueOption) ([]Edge, error) {
	return DefaultCatalogue().Edges(resolved, data, opts...)
}

// Edges is the package-level Edges against this Catalogue, whose sections'
// types yield their edges too.
func (c *Catalogue) Edges(resolved *ResolvedSpec, data json.RawMessage, opts ...ValueOption) ([]Edge, error) {
	edges := []Edge{}
	var parts map[string]map[string]json.RawMessage
	if resolved != nil {
		parts = resolved.Parts
	}
	err := c.walkData(resolved, data, opts, func(f Field, settings map[string]any, value any, path string) {
		rule, ok := c.edgeRule(f.FieldType, parts)
		if !ok {
			return
		}
		for _, e := range rule(f, settings, value) {
			e.Path = path + e.Path
			edges = append(edges, e)
		}
	})
	if err != nil {
		return nil, fmt.Errorf("fieldkit: edges: %w", err)
	}
	return edges, nil
}
