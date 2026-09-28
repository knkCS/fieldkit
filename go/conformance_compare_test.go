package fieldkit

import (
	"encoding/json"
	"maps"
	"reflect"
	"slices"
	"testing"
)

// The conformance runner's versionkit operations, compare and merge
// (conformance/README.md). Only Go implements them: the TS runner recognises
// them and runs nothing.
//
// Each runs through the adapter as versionkit would: the fixture's Spec is
// resolved, SchemaFields turns it into Fields, and each Field's Type is
// handed its own Settings back with the Field's values from the fixture's
// Revisions.

type compareExpectation struct {
	Equal  bool            `json:"equal"`
	Detail json.RawMessage `json:"detail,omitempty"`
}

type mergeExpectation struct {
	Merged    json.RawMessage `json:"merged,omitempty"`
	Conflicts []string        `json:"conflicts,omitempty"`
}

// mergeConflicts reports whether a merge expectation expects a Conflict at any
// Field.
func mergeConflicts(raw json.RawMessage) bool {
	var want map[string]mergeExpectation
	if err := json.Unmarshal(raw, &want); err != nil {
		return true // malformed: let the run report it
	}
	for _, w := range want {
		if len(w.Conflicts) > 0 {
			return true
		}
	}
	return false
}

func schemaFieldsFixture(t *testing.T, fx fixture) []SchemaField {
	t.Helper()
	resolved, err := resolveFixture(t, fx)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	fields, err := fx.catalogue.SchemaFields(resolved)
	if err != nil {
		t.Fatalf("SchemaFields: %v", err)
	}
	return fields
}

func revision(t *testing.T, fx fixture, name string) map[string]json.RawMessage {
	t.Helper()
	r, ok := fx.Revisions[name]
	if !ok {
		t.Fatalf("the fixture has no revision %q", name)
	}
	return r
}

// runCompare compares Revisions a and b Field by Field, for every Field both
// hold — the ones versionkit hands to a type — and expects exactly those.
func runCompare(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]compareExpectation
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed compare expectation: %v", err)
	}
	a, b := revision(t, fx, "a"), revision(t, fx, "b")
	compared := map[string]bool{}
	for _, f := range schemaFieldsFixture(t, fx) {
		va, inA := a[f.Accessor]
		vb, inB := b[f.Accessor]
		if !inA || !inB {
			continue
		}
		compared[f.Accessor] = true
		w, ok := want[f.Accessor]
		if !ok {
			t.Errorf("compare %s: not expected", f.Accessor)
			continue
		}
		equal, detail, err := f.Type.Compare(f.Settings, va, vb)
		if err != nil {
			t.Errorf("compare %s: %v", f.Accessor, err)
			continue
		}
		if equal != w.Equal {
			t.Errorf("compare %s: equal = %v, want %v", f.Accessor, equal, w.Equal)
		}
		if !sameJSONOrNone(t, detail, w.Detail) {
			t.Errorf("compare %s: detail\n got: %s\nwant: %s", f.Accessor, detail, w.Detail)
		}
	}
	for accessor := range want {
		if !compared[accessor] {
			t.Errorf("compare %s: expected, but not a Field both revisions hold", accessor)
		}
	}
}

// runMerge merges base, ours and theirs Field by Field, for every Field all
// three hold whose type is a Merger — the others versionkit merges itself —
// and expects exactly those. Conflicts compare in any order.
func runMerge(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]mergeExpectation
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed merge expectation: %v", err)
	}
	base, ours, theirs := revision(t, fx, "base"), revision(t, fx, "ours"), revision(t, fx, "theirs")
	merged := map[string]bool{}
	for _, f := range schemaFieldsFixture(t, fx) {
		vb, inB := base[f.Accessor]
		vo, inO := ours[f.Accessor]
		vt, inT := theirs[f.Accessor]
		merger, finer := f.Type.(Merger)
		if !inB || !inO || !inT || !finer {
			continue
		}
		merged[f.Accessor] = true
		w, ok := want[f.Accessor]
		if !ok {
			t.Errorf("merge %s: not expected", f.Accessor)
			continue
		}
		value, conflicts, err := merger.Merge(f.Settings, vb, vo, vt)
		if err != nil {
			t.Errorf("merge %s: %v", f.Accessor, err)
			continue
		}
		slices.Sort(conflicts)
		wantConflicts := slices.Sorted(slices.Values(w.Conflicts))
		if !slices.Equal(conflicts, wantConflicts) {
			t.Errorf("merge %s: conflicts = %q, want %q", f.Accessor, conflicts, wantConflicts)
		}
		if len(conflicts) == 0 && !sameJSONOrNone(t, value, w.Merged) {
			t.Errorf("merge %s: merged\n got: %s\nwant: %s", f.Accessor, value, w.Merged)
		}
	}
	for _, accessor := range slices.Sorted(maps.Keys(want)) {
		if !merged[accessor] {
			t.Errorf("merge %s: expected, but not a merging Field all three revisions hold", accessor)
		}
	}
}

// sameJSONOrNone reports whether two JSON texts are the same value, an empty
// text being none.
func sameJSONOrNone(t *testing.T, got, want json.RawMessage) bool {
	t.Helper()
	if len(got) == 0 || len(want) == 0 {
		return len(got) == 0 && len(want) == 0
	}
	var vg, vw any
	if err := json.Unmarshal(got, &vg); err != nil {
		t.Fatalf("not JSON: %s", got)
	}
	if err := json.Unmarshal(want, &vw); err != nil {
		t.Fatalf("not JSON: %s", want)
	}
	return reflect.DeepEqual(vg, vw)
}
