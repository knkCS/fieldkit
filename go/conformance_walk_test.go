package fieldkit

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

// The conformance runner's walker operations: edges and texts
// (conformance/README.md). Both walk the Resolved Spec the fixture's spec
// resolves to against its releases.

func runEdges(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []Edge
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed edges expectation: %v", err)
	}
	resolved, err := resolveFixture(t, fx)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	got, err := fx.catalogue.Edges(resolved, fx.Data, fx.valueOptions()...)
	if err != nil {
		t.Fatalf("Edges: %v", err)
	}
	if want == nil {
		want = []Edge{}
	}
	byEdge := func(a, b Edge) int {
		ka, _ := json.Marshal(a)
		kb, _ := json.Marshal(b)
		return strings.Compare(string(ka), string(kb))
	}
	slices.SortFunc(got, byEdge)
	slices.SortFunc(want, byEdge)
	if !slices.Equal(got, want) {
		gotJSON, _ := json.MarshalIndent(got, "", "  ")
		wantJSON, _ := json.MarshalIndent(want, "", "  ")
		t.Errorf("edges\n got: %s\nwant: %s", gotJSON, wantJSON)
	}
}

func runTexts(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []FieldText
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed texts expectation: %v", err)
	}
	resolved, err := resolveFixture(t, fx)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	got, err := fx.catalogue.Texts(resolved, fx.Data, fx.valueOptions()...)
	if err != nil {
		t.Fatalf("Texts: %v", err)
	}
	if want == nil {
		want = []FieldText{}
	}
	byText := func(a, b FieldText) int {
		if c := strings.Compare(a.Path, b.Path); c != 0 {
			return c
		}
		if c := strings.Compare(a.Weight, b.Weight); c != 0 {
			return c
		}
		return strings.Compare(a.Text, b.Text)
	}
	slices.SortFunc(got, byText)
	slices.SortFunc(want, byText)
	if !slices.Equal(got, want) {
		gotJSON, _ := json.MarshalIndent(got, "", "  ")
		wantJSON, _ := json.MarshalIndent(want, "", "  ")
		t.Errorf("texts\n got: %s\nwant: %s", gotJSON, wantJSON)
	}
}

// A released fixture's edges and texts always bind: they are no list of
// errors, so there is no invalid case to loosen.
func TestBindsWalkers(t *testing.T) {
	for _, op := range []string{"edges", "texts"} {
		if !binds("0.18.0", op, json.RawMessage(`[]`)) {
			t.Errorf("a released %s expectation does not bind", op)
		}
	}
}
