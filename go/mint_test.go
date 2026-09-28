package fieldkit

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUUIDv5(t *testing.T) {
	// RFC 9562's DNS namespace, checked against Python's uuid.uuid5.
	dns := [16]byte{0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8}
	if got := uuidString(uuidV5(dns, "python.org")); got != "886313e1-3b8a-5372-9b90-0c9aee199e5d" {
		t.Errorf("uuidV5 = %s", got)
	}
	if got := uuidString(mintNamespace); got != "379da0e9-e2c3-5b66-8df1-4a068984ba43" {
		t.Errorf("mintNamespace = %s", got)
	}
}

func mintSpec(t *testing.T) Field {
	t.Helper()
	spec, err := DecodeSpec([]byte(`[{
		"field_type": "blocks",
		"config": {"name": "Content", "api_accessor": "content", "required": false, "instructions": ""},
		"settings": {"allowed_blocks": [
			{"type": "heading", "name": "Heading", "fields": []},
			{"type": "gallery", "name": "Gallery", "fields": [{
				"field_type": "group",
				"config": {"name": "Images", "api_accessor": "images", "required": false, "instructions": ""},
				"children": [{"field_type": "text", "config": {"name": "Src", "api_accessor": "src", "required": false, "instructions": ""}, "system": false}],
				"system": false
			}]}
		]},
		"system": false
	}]`))
	if err != nil {
		t.Fatal(err)
	}
	return spec[0]
}

func TestMintIDs(t *testing.T) {
	f := mintSpec(t)
	value := json.RawMessage(`[
		{"_type": "heading", "title": "One", "n": 1.50},
		{"_id": "kept", "_type": "gallery", "images": [{"src": "a.png"}, {"_id": "", "src": "b.png"}]}
	]`)

	first, err := MintIDs(f, value, "content-1")
	if err != nil {
		t.Fatal(err)
	}
	again, err := MintIDs(f, value, "content-1")
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(again) {
		t.Errorf("not deterministic:\n%s\n%s", first, again)
	}
	other, _ := MintIDs(f, value, "content-2")
	if string(first) == string(other) {
		t.Error("a different seed minted the same ids")
	}

	var blocks []map[string]any
	if err := json.Unmarshal(first, &blocks); err != nil {
		t.Fatal(err)
	}
	if blocks[1]["_id"] != "kept" {
		t.Errorf("an existing _id was replaced: %v", blocks[1]["_id"])
	}
	images, _ := blocks[1]["images"].([]any)
	ids := map[string]bool{blocks[0]["_id"].(string): true, "kept": true}
	for _, image := range images {
		id, _ := image.(map[string]any)["_id"].(string)
		if !isRowID(id) {
			t.Errorf("image without an id: %v", image)
		}
		ids[id] = true
	}
	if len(ids) != 4 {
		t.Errorf("ids not distinct: %v", ids)
	}
	if !strings.Contains(string(first), `"n":1.50`) {
		t.Errorf("a number was rewritten: %s", first)
	}

	// The minted value validates.
	spec := Spec{f}
	data := json.RawMessage(`{"content":` + string(first) + `}`)
	if errs := ValidateValue(spec, data); errs != nil {
		t.Errorf("minted value does not validate: %v", errs)
	}
}

func TestMintIDsDerivesFromThePlace(t *testing.T) {
	group := valueField("group", "authors", "")
	got, err := MintIDs(group, json.RawMessage(`[{"name":"Ada"},{"name":"Grace"}]`), "content-1")
	if err != nil {
		t.Fatal(err)
	}
	// uuid.uuid5(uuid.uuid5(NAMESPACE_URL, "https://github.com/knkCS/fieldkit#_id"),
	// "content-1\x00/authors/0"), and /1, in Python.
	want := `[{"_id":"67a5d2bd-318f-5e00-a5a0-ff2727397011","name":"Ada"},{"_id":"5b485623-f3fb-5547-9c43-709d53c2b29a","name":"Grace"}]`
	if string(got) != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
}

func TestMintIDsFieldset(t *testing.T) {
	fieldset := valueField("fieldset", "address", "")
	group := valueField("group", "residents", "")
	fieldset.Children = []Field{group}
	got, err := MintIDs(fieldset, json.RawMessage(`{"residents":[{"name":"Ada"}],"street":"x"}`), "s")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(got), `"_id":"`) || strings.Contains(string(got), `"address"`) {
		t.Errorf("got %s", got)
	}
	// An unresolved Fieldset holds no Fields to mint into.
	fieldset.Children = nil
	got, _ = MintIDs(fieldset, json.RawMessage(`{"residents":[{"name":"Ada"}]}`), "s")
	if strings.Contains(string(got), "_id") {
		t.Errorf("minted into an unresolved Fieldset: %s", got)
	}
}

func TestMintIDsLeavesWhatItCannotRead(t *testing.T) {
	group := valueField("group", "authors", "")
	for _, value := range []string{`5`, `["x",null]`, `""`} {
		got, err := MintIDs(group, json.RawMessage(value), "s")
		if err != nil {
			t.Fatalf("%s: %v", value, err)
		}
		if string(got) != value {
			t.Errorf("%s: got %s", value, got)
		}
	}
	if _, err := MintIDs(group, json.RawMessage(`[`), "s"); err == nil {
		t.Error("malformed JSON minted without an error")
	}
}

func TestValidateValueRows(t *testing.T) {
	required := valueField("text", "name", "")
	required.Config.Required = true
	group := valueField("group", "authors", `{"min_items": 1, "max_items": 3}`)
	group.Children = []Field{required}
	long := strings.Repeat("x", MaxIDLength+1)
	cases := []struct {
		name, data string
		want       []string
	}{
		{"valid", `{"authors":[{"_id":"a","name":"Ada"}]}`, nil},
		{"errors at _id paths", `{"authors":[{"_id":"a/b","name":5}]}`, []string{"/authors/a~1b/name invalid_type"}},
		{"missing _id at the row", `{"authors":[{"name":"Ada"}]}`, []string{"/authors/0 missing_id"}},
		{"a repeat beside the row's own errors", `{"authors":[{"_id":"a","name":"Ada"},{"_id":"a"}]}`, []string{"/authors/1 duplicate_id", "/authors/1/name required"}},
		{"an _id that is no string", `{"authors":[{"_id":7,"name":"Ada"}]}`, []string{"/authors/0/_id invalid_type"}},
		{"an _id too long", `{"authors":[{"_id":"` + long + `","name":"Ada"}]}`, []string{"/authors/0/_id too_big"}},
		{"too few rows", `{"authors":[]}`, []string{"/authors not_canonical"}},
		{"too many rows", `{"authors":[{"_id":"a","name":"A"},{"_id":"b","name":"B"},{"_id":"c","name":"C"},{"_id":"d","name":"D"}]}`, []string{"/authors too_many_items"}},
		{"not rows", `{"authors":{"x":1}}`, []string{"/authors invalid_type"}},
	}
	for _, c := range cases {
		got := codesOf(ValidateValue(Spec{group}, json.RawMessage(c.data)))
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestValidateValueTooDeep(t *testing.T) {
	deep := `["x"]`
	for range MaxDepth {
		deep = "[" + deep + "]"
	}
	errs := ValidateValue(Spec{valueField("checkboxes", "tags", "")}, json.RawMessage(`{"tags":`+deep+`}`))
	want := "/tags" + strings.Repeat("/0", MaxDepth)
	if len(errs) != 1 || errs[0].Path != want || errs[0].Code != CodeTooDeep || errs[0].Params["maximum"] != MaxDepth {
		t.Errorf("got %+v, want %s too_deep", errs, want)
	}
	// One level shallower is within the cap.
	within := strings.TrimSuffix(strings.TrimPrefix(deep, "["), "]")
	if errs := ValidateValue(Spec{valueField("checkboxes", "tags", "")}, json.RawMessage(`{"tags":`+within+`}`)); len(errs) == 0 || errs[0].Code == CodeTooDeep {
		// Within the cap the checkboxes rule answers instead: its item is no string.
		t.Errorf("got %+v, want the type's own answer", errs)
	}
}
