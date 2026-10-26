package fieldkit

import (
	"encoding/json"
	"maps"
	"slices"
	"testing"
)

// The conformance runner's Annotation operations, annotationOnly,
// openSuggestion and removeCommentAnchors (conformance/README.md): what the
// rich-text field type answers, and does, for contenthub's Annotation rules
// (contenthub ADR 0014, amended).
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

// runRemoveCommentAnchors takes the comment anchors out of each Field's value,
// Revision by Revision, and expects the value given. Whatever it expects, the
// result must be Annotation-only against its input, and hold a suggestion
// exactly when the input did: only comment anchors are taken out.
func runRemoveCommentAnchors(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]map[string]json.RawMessage
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed removeCommentAnchors expectation: %v", err)
	}
	fields := annotatorsOf(t, fx)
	for _, name := range slices.Sorted(maps.Keys(want)) {
		values := revision(t, fx, name)
		for _, accessor := range slices.Sorted(maps.Keys(want[name])) {
			f, ok := fields[accessor]
			if !ok {
				t.Errorf("removeCommentAnchors %s/%s: not a Field whose type is an Annotator", name, accessor)
				continue
			}
			annotator := f.Type.(Annotator)
			value := values[accessor]
			got, err := annotator.RemoveCommentAnchors(f.Settings, value)
			if err != nil {
				t.Errorf("removeCommentAnchors %s/%s: %v", name, accessor, err)
				continue
			}
			if !sameJSONOrNone(t, got, want[name][accessor]) {
				t.Errorf("removeCommentAnchors %s/%s\n got: %s\nwant: %s", name, accessor, got, want[name][accessor])
			}
			if only, err := annotator.AnnotationOnly(f.Settings, value, got); err != nil || !only {
				t.Errorf("removeCommentAnchors %s/%s: AnnotationOnly(value, removed) = %v, %v; want true", name, accessor, only, err)
			}
			before, _ := annotator.OpenSuggestion(f.Settings, value)
			after, _ := annotator.OpenSuggestion(f.Settings, got)
			if before != after {
				t.Errorf("removeCommentAnchors %s/%s: OpenSuggestion %v before, %v after", name, accessor, before, after)
			}
		}
	}
}
