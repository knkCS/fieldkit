package fieldkit

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

// versionkitFieldType and versionkitFieldMerger are copied verbatim from
// versionkit's schemas.go (FieldType and FieldMerger). fieldkit never imports
// versionkit (versionkit ADR 0002): its types satisfy these structurally, and
// this file is what proves it at compile time. If versionkit changes either
// signature, copy it here again and let the build say what broke.
type versionkitFieldType interface {
	Compare(settings, a, b json.RawMessage) (equal bool, detail json.RawMessage, err error)
}

type versionkitFieldMerger interface {
	versionkitFieldType
	Merge(settings, base, ours, theirs json.RawMessage) (merged json.RawMessage, conflicts []string, err error)
}

// versionkitField is versionkit's Field, copied: a service builds one from
// each SchemaField by plain assignment.
type versionkitField struct {
	Accessor string
	TypeID   string
	Settings json.RawMessage
	Type     versionkitFieldType
}

// The compile-time half: every Type SchemaFields hands out is a Comparer, and
// a Comparer is versionkit's FieldType; a Merger is its FieldMerger.
var (
	_ versionkitFieldType   = Comparer(nil)
	_ versionkitFieldMerger = Merger(nil)
	_ versionkitFieldType   = wholeValueType{}
	_ versionkitFieldMerger = finerValueType{}
)

func TestSchemaFieldsAssignToVersionkitFields(t *testing.T) {
	resolved := resolvedFixtureSpec(t)
	fields, err := SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	merging := map[string]bool{}
	for _, f := range fields {
		// What a service writes: one assignment per property.
		vf := versionkitField{Accessor: f.Accessor, TypeID: f.TypeID, Settings: f.Settings, Type: f.Type}
		_, merges := vf.Type.(versionkitFieldMerger)
		merging[vf.Accessor] = merges
	}
	want := map[string]bool{"title": false, "count": false, "authors": true, "content": true, "address": true, "rows": true}
	if !reflect.DeepEqual(merging, want) {
		t.Errorf("merging types = %v, want %v", merging, want)
	}
}

func TestSchemaFieldsSkipsMarkers(t *testing.T) {
	resolved := resolvedFixtureSpec(t)
	fields, err := SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, f := range fields {
		got = append(got, f.Accessor+":"+f.TypeID)
	}
	want := []string{"title:text", "count:number", "authors:group", "content:blocks", "address:fieldset", "rows:virtual_table"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

// The Settings blob is the whole resolved Field plus the parts it pins, and it
// comes back from versionkit unchanged: decoding it gives the Field and parts
// the adapter was handed, and encoding those again gives the same bytes.
func TestSchemaSettingsRoundTrip(t *testing.T) {
	resolved := resolvedFixtureSpec(t)
	resolved.Parts = map[string]map[string]json.RawMessage{
		"text_type": {"tt-1": json.RawMessage(`{"nodes":["paragraph"]}`), "tt-unused": json.RawMessage(`{}`)},
	}
	fields, err := SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	for i, f := range fields {
		settings, err := DecodeSchemaSettings(f.Settings)
		if err != nil {
			t.Fatalf("%s: %v", f.Accessor, err)
		}
		if !sameJSONText(t, mustMarshal(t, settings.Field), mustMarshal(t, resolved.Fields[fieldIndex(resolved, f.Accessor)])) {
			t.Errorf("%s: the Field did not survive the round trip", f.Accessor)
		}
		again, err := json.Marshal(settings)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(again, f.Settings) {
			t.Errorf("field %d: re-encoded settings differ\n got: %s\nwant: %s", i, again, f.Settings)
		}
		if settings.Parts != nil {
			t.Errorf("%s pins no part, got parts %s", f.Accessor, mustMarshal(t, settings.Parts))
		}
	}
}

// A Field carries the parts it pins, at any depth, and only those.
func TestSchemaSettingsCarryPinnedParts(t *testing.T) {
	// No type in the Catalogue pins an opaque part yet (rich_text's text_type
	// arrives with #216), so a Catalogue made for the test lends text one.
	c := testCatalogue(t, func(types []map[string]any) {
		for _, typ := range types {
			if typ["id"] == "text" {
				typ["pins"] = []any{map[string]any{"key": "text_type", "kind": "text_type"}}
				schema := typ["settings_schema"].(map[string]any)
				schema["properties"].(map[string]any)["text_type"] = map[string]any{"type": "string"}
			}
		}
	})
	resolved := &ResolvedSpec{
		Fields: Spec{
			{FieldType: "group", Config: Config{Name: "G", APIAccessor: "g"}, Children: []Field{
				{FieldType: "text", Config: Config{Name: "T", APIAccessor: "t"}, Settings: json.RawMessage(`{"text_type":"tt-1"}`)},
			}},
			{FieldType: "text", Config: Config{Name: "Plain", APIAccessor: "plain"}},
		},
		Parts: map[string]map[string]json.RawMessage{
			"text_type": {"tt-1": json.RawMessage(`{"nodes":["paragraph"]}`), "tt-2": json.RawMessage(`{}`)},
		},
	}
	fields, err := c.SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	settings, err := DecodeSchemaSettings(fields[0].Settings)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]map[string]json.RawMessage{"text_type": {"tt-1": json.RawMessage(`{"nodes":["paragraph"]}`)}}
	if !sameJSONText(t, mustMarshal(t, settings.Parts), mustMarshal(t, want)) {
		t.Errorf("parts = %s, want %s", mustMarshal(t, settings.Parts), mustMarshal(t, want))
	}
	plain, err := DecodeSchemaSettings(fields[1].Settings)
	if err != nil {
		t.Fatal(err)
	}
	if plain.Parts != nil {
		t.Errorf("a Field pinning nothing carries parts %s", mustMarshal(t, plain.Parts))
	}
}

func TestSchemaFieldsNeedsAResolvedSpec(t *testing.T) {
	if _, err := SchemaFields(nil); err == nil {
		t.Error("SchemaFields(nil): want an error")
	}
}

// The Type reads everything it needs from the Settings versionkit hands back;
// Settings it cannot read are an error, never a guess.
func TestCompareRefusesUnreadableSettings(t *testing.T) {
	for _, settings := range []string{``, `[]`, `{"field":{"field_type":"text","config":{}},"extra":1}`} {
		if _, _, err := (wholeValueType{}).Compare(json.RawMessage(settings), json.RawMessage(`1`), json.RawMessage(`2`)); err == nil {
			t.Errorf("Compare with settings %q: want an error", settings)
		}
	}
}

func resolvedFixtureSpec(t *testing.T) *ResolvedSpec {
	t.Helper()
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"section","config":{"name":"Main","api_accessor":"main","required":false,"instructions":""},"system":false},
		{"field_type":"text","config":{"name":"Title","api_accessor":"title","required":true,"instructions":""},"system":false},
		{"field_type":"number","config":{"name":"Count","api_accessor":"count","required":false,"instructions":""},"settings":{"min":0},"system":false},
		{"field_type":"group","config":{"name":"Authors","api_accessor":"authors","required":false,"instructions":""},"children":[
			{"field_type":"text","config":{"name":"Name","api_accessor":"name","required":false,"instructions":""},"system":false}
		],"system":false},
		{"field_type":"blocks","config":{"name":"Content","api_accessor":"content","required":false,"instructions":""},"settings":{"allowed_blocks":[{"type":"heading","name":"Heading","fields":[]}]},"system":false},
		{"field_type":"fieldset","config":{"name":"Address","api_accessor":"address","required":false,"instructions":""},"settings":{"blueprint":"bp-address"},"system":false},
		{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[
			{"field_type":"text","config":{"name":"Cell","api_accessor":"cell","required":false,"instructions":""},"system":false}
		],"system":false}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := Resolve(context.Background(), spec, FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		return json.RawMessage(`[{"field_type":"text","config":{"name":"Street","api_accessor":"street","required":false,"instructions":""},"system":false}]`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func fieldIndex(r *ResolvedSpec, accessor string) int {
	for i, f := range r.Fields {
		if f.Config.APIAccessor == accessor {
			return i
		}
	}
	return -1
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// sameJSONText reports whether two JSON texts decode to the same value.
func sameJSONText(t *testing.T, a, b []byte) bool {
	t.Helper()
	var va, vb any
	if err := json.Unmarshal(a, &va); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &vb); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(va, vb)
}

// testCatalogue is the embedded Catalogue with edit applied to its types.
func testCatalogue(t *testing.T, edit func(types []map[string]any)) *Catalogue {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal(catalogueJSON, &raw); err != nil {
		t.Fatal(err)
	}
	list := raw["types"].([]any)
	types := make([]map[string]any, len(list))
	for i, typ := range list {
		types[i] = typ.(map[string]any)
	}
	edit(types)
	c, err := ParseCatalogue(mustMarshal(t, raw))
	if err != nil {
		t.Fatal(err)
	}
	return c
}
