package fieldkit

import (
	"encoding/json"
	"strings"
	"testing"
)

// referenceField is a reference-shaped Field with its settings as JSON.
func referenceField(t *testing.T, fieldType, accessor, settings string) Field {
	t.Helper()
	f := valueField(fieldType, accessor, "")
	f.Settings = json.RawMessage(settings)
	return f
}

func TestMintIDsReferenceTree(t *testing.T) {
	f := referenceField(t, "reference", "related", `{}`)
	value := json.RawMessage(`[{"id":"a","children":[{"id":"b"},{"_id":"kept","id":"c"}]},{"id":"d","_id":""}]`)
	first, err := MintIDs(f, value, "content-1")
	if err != nil {
		t.Fatal(err)
	}
	again, _ := MintIDs(f, value, "content-1")
	if string(first) != string(again) {
		t.Errorf("not deterministic:\n%s\n%s", first, again)
	}
	if !strings.Contains(string(first), `"_id":"kept"`) {
		t.Errorf("an existing _id was replaced: %s", first)
	}
	data := json.RawMessage(`{"related":` + string(first) + `}`)
	if errs := ValidateValue(Spec{f}, data); errs != nil {
		t.Errorf("minted tree does not validate: %v", errs)
	}

	single := referenceField(t, "single_reference", "primary", `{}`)
	got, err := MintIDs(single, json.RawMessage(`{"id":"a"}`), "content-1")
	if err != nil {
		t.Fatal(err)
	}
	if errs := ValidateValue(Spec{single}, json.RawMessage(`{"primary":`+string(got)+`}`)); errs != nil {
		t.Errorf("minted Single Reference does not validate: %v (%s)", errs, got)
	}
}

// linkedSettings links a Reference Spec for book whose chapter is required;
// the embedded one asks for nothing.
const linkedSettings = `{
	"blueprints": [{"blueprint": "book", "spec_blueprint": "r1", "spec": [
		{"field_type": "number", "config": {"name": "Chapter", "api_accessor": "chapter", "required": true, "instructions": ""}, "system": false}
	]}],
	"spec": [
		{"field_type": "text", "config": {"name": "Note", "api_accessor": "note", "required": false, "instructions": ""}, "system": false}
	]
}`

func TestValidateValueReferenceTargets(t *testing.T) {
	f := referenceField(t, "reference", "related", linkedSettings)
	data := json.RawMessage(`{"related":[{"_id":"n1","id":"c-book","values":{"note":5}}]}`)

	// Without the targets' Blueprints, which Reference Spec applies is not
	// known: the values are an opaque record.
	if errs := ValidateValue(Spec{f}, data); errs != nil {
		t.Errorf("unknown targets: got %v, want nil", errs)
	}
	if errs := ValidateValue(Spec{f}, json.RawMessage(`{"related":[{"_id":"n1","id":"c","values":"x"}]}`)); len(errs) != 1 || errs[0].Code != CodeInvalidType {
		t.Errorf("an opaque record is still a record: got %v", errs)
	}

	// With them, the linked Reference Spec replaces the embedded one: chapter
	// is required and note is no Field of it.
	book := WithTargetBlueprints(func(string) string { return "book" })
	errs := ValidateValue(Spec{f}, data, book)
	if len(errs) != 1 || errs[0].Path != "/related/n1/values/chapter" || errs[0].Code != CodeRequired {
		t.Errorf("book target: got %v", errs)
	}
	// Another Blueprint's target has the embedded one.
	film := WithTargetBlueprints(func(string) string { return "film" })
	errs = ValidateValue(Spec{f}, data, film)
	if len(errs) != 1 || errs[0].Path != "/related/n1/values/note" || errs[0].Code != CodeInvalidType {
		t.Errorf("film target: got %v", errs)
	}
}

func TestPinsInASettingsList(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[{"field_type":"reference","config":{"name":"R","api_accessor":"r","required":false,"instructions":""},
		"settings":{"blueprints":[{"blueprint":"a"},{"blueprint":"b","spec_blueprint":" r2 "},{"blueprint":"c","spec_blueprint":""}]},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	pins := Pins(spec)
	if len(pins) != 1 || pins[0].Path != "/r/settings/blueprints/1/spec_blueprint" || pins[0].Release != "r2" {
		t.Errorf("got %v", pins)
	}
}

func TestCompareSingleReferenceOtherNode(t *testing.T) {
	c := &composer{}
	f := referenceField(t, "single_reference", "primary", `{}`)
	a := map[string]any{"_id": "s1", "id": "c1"}
	b := map[string]any{"_id": "s2", "id": "c1"}
	equal, detail, err := c.compare(&f, a, b)
	if err != nil || equal || detail != nil {
		t.Errorf("another node compares whole: equal %v detail %v err %v", equal, detail, err)
	}
}

func TestMergeReferenceTreeCycle(t *testing.T) {
	c := &composer{}
	f := referenceField(t, "reference", "related", `{}`)
	decode := func(s string) any {
		v, err := decodeStored(json.RawMessage(s))
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	base := decode(`[{"_id":"a","id":"1"},{"_id":"b","id":"2"}]`)
	ours := decode(`[{"_id":"a","id":"1","children":[{"_id":"b","id":"2"}]}]`)
	theirs := decode(`[{"_id":"b","id":"2","children":[{"_id":"a","id":"1"}]}]`)
	if _, err := c.merge(&f, base, ours, theirs, ""); err != nil {
		t.Fatal(err)
	}
	if strings.Join(c.conflicts, ",") != "a/_parent,b/_parent" && strings.Join(c.conflicts, ",") != "b/_parent,a/_parent" {
		t.Errorf("a cycle of moves: got %v", c.conflicts)
	}
}

// Compare, Merge and ValidateValue of the Reference types never panic,
// whatever they are handed — a cycle of moves, a node repeated, a branch that
// is not a list.
func FuzzReferenceTree(f *testing.F) {
	f.Add(`[{"_id":"a","id":"1","children":[{"_id":"b","id":"2"}]}]`, `[{"_id":"b","id":"2","children":[{"_id":"a","id":"1"}]}]`, `[{"_id":"a","id":"1","values":{"page":1}}]`)
	f.Add(`[]`, `{}`, `null`)
	f.Add(`[{"_id":"a"},{"_id":"a"}]`, `[{"_id":1,"children":"x"}]`, `{"_id":"s","id":"x"}`)
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"reference","config":{"name":"R","api_accessor":"r","required":false,"instructions":""},"settings":{"spec":[
			{"field_type":"number","config":{"name":"Page","api_accessor":"page","required":true,"instructions":""},"system":false}
		],"max_depth":2,"max_items":5},"system":false},
		{"field_type":"single_reference","config":{"name":"S","api_accessor":"s","required":false,"instructions":""},"system":false}
	]`))
	if err != nil {
		f.Fatal(err)
	}
	fields, err := SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		f.Fatal(err)
	}
	f.Fuzz(func(t *testing.T, base, ours, theirs string) {
		for _, sf := range fields {
			_, _, _ = sf.Type.Compare(sf.Settings, json.RawMessage(ours), json.RawMessage(theirs))
			_, _, _ = sf.Type.(Merger).Merge(sf.Settings, json.RawMessage(base), json.RawMessage(ours), json.RawMessage(theirs))
		}
		_ = ValidateValue(spec, json.RawMessage(`{"r":`+ours+`,"s":`+theirs+`}`), WithTargetBlueprints(func(string) string { return "" }))
	})
}

func TestReadReferenceTreeRefusesMalformed(t *testing.T) {
	f := referenceField(t, "reference", "related", `{}`)
	for _, value := range []string{`{}`, `[1]`, `[{"id":"x"}]`, `[{"_id":"a"},{"_id":"a"}]`, `[{"_id":"a","children":"x"}]`} {
		v, _ := decodeStored(json.RawMessage(value))
		if _, err := readReferenceTree(&f, v); err == nil {
			t.Errorf("%s: read without an error", value)
		}
	}
}
