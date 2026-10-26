package fieldkit

import (
	"encoding/json"
	"maps"
	"slices"
	"testing"
)

// The conformance runner's Annotation operations, annotationOnly and
// openSuggestion (conformance/README.md): the rich-text field type's two
// answers for contenthub's Annotation rules (contenthub ADR 0014, amended).
// Each asks the Field's Type from SchemaFields, as contenthub does — it never
// reads rich text itself — so a Type that is no Annotator answers nothing.

// annotatorsOf are the fixture's Fields whose Type is an Annotator, with their
// Settings, by Accessor.
func annotatorsOf(t *testing.T, fx fixture) map[string]SchemaField {
	t.Helper()
	out := map[string]SchemaField{}
	for _, f := range schemaFieldsFixture(t, fx) {
		if _, ok := f.Type.(Annotator); ok {
			out[f.Accessor] = f
		}
	}
	return out
}

// runAnnotationOnly asks, Field by Field, whether Revision next differs from
// base only in Annotations, for exactly the Fields the expectation names.
func runAnnotationOnly(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]bool
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed annotationOnly expectation: %v", err)
	}
	base, next := revision(t, fx, "base"), revision(t, fx, "next")
	fields := annotatorsOf(t, fx)
	for _, accessor := range slices.Sorted(maps.Keys(want)) {
		f, ok := fields[accessor]
		if !ok {
			t.Errorf("annotationOnly %s: not a Field whose type is an Annotator", accessor)
			continue
		}
		got, err := f.Type.(Annotator).AnnotationOnly(f.Settings, base[accessor], next[accessor])
		if err != nil {
			t.Errorf("annotationOnly %s: %v", accessor, err)
			continue
		}
		if got != want[accessor] {
			t.Errorf("annotationOnly %s = %v, want %v", accessor, got, want[accessor])
		}
	}
}

// runOpenSuggestion asks, Revision by Revision and Field by Field, whether the
// value holds an open suggestion.
func runOpenSuggestion(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]map[string]bool
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed openSuggestion expectation: %v", err)
	}
	fields := annotatorsOf(t, fx)
	for _, name := range slices.Sorted(maps.Keys(want)) {
		values := revision(t, fx, name)
		for _, accessor := range slices.Sorted(maps.Keys(want[name])) {
			f, ok := fields[accessor]
			if !ok {
				t.Errorf("openSuggestion %s/%s: not a Field whose type is an Annotator", name, accessor)
				continue
			}
			got, err := f.Type.(Annotator).OpenSuggestion(f.Settings, values[accessor])
			if err != nil {
				t.Errorf("openSuggestion %s/%s: %v", name, accessor, err)
				continue
			}
			if got != want[name][accessor] {
				t.Errorf("openSuggestion %s/%s = %v, want %v", name, accessor, got, want[name][accessor])
			}
		}
	}
}
