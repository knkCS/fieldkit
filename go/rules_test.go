package fieldkit

import (
	"encoding/json"
	"testing"
)

// The shared fixtures pin the rules across settings against TS. These pin
// what they cannot reach: ValidateSettings running a type's settings rules on
// its own, a Block Type's fields that do not decode, and JS's trim.

func TestValidateSettingsRunsTheSettingsRules(t *testing.T) {
	errs := ValidateSettings("blocks", json.RawMessage(`{"allowed_blocks":[{"type":"a","name":"A"},{"type":"b","name":"B"},{"type":"a","name":"A2"}]}`))
	if len(errs) != 1 || errs[0].Path != "/allowed_blocks/2/type" || errs[0].Code != CodeDuplicateBlockType {
		t.Errorf("got %v", errs)
	}
}

func TestBlockTypeFieldsThatAreNotASpec(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[{"field_type":"blocks","config":{"name":"C","api_accessor":"content","required":false,"instructions":""},"settings":{"allowed_blocks":[
		{"type":"a","name":"A","fields":[` + validField + `,"title"]},
		{"type":"b","name":"B","fields":[{"field_type":"text"}]},
		{"type":"c","name":"C","fields":[{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":""},"system":false,"label":"x"}]},
		{"type":"d","name":"D","fields":[` + validField + `]}
	]},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, e := range ValidateSpec(spec) {
		got[e.Path] = e.Code
	}
	want := map[string]string{
		// Not an object, as TS refuses it too.
		"/content/settings/allowed_blocks/0/fields": CodeInvalidSetting,
		// No config, as TS refuses it too.
		"/content/settings/allowed_blocks/1/fields": CodeInvalidSetting,
		// A property the Field model lacks: refused as DecodeSpec refuses it.
		// TS has no strict Field decoder and walks it (conformance/README.md).
		"/content/settings/allowed_blocks/2/fields": CodeInvalidSetting,
	}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for path, code := range want {
		if got[path] != code {
			t.Errorf("%s: got %q, want %q", path, got[path], code)
		}
	}
}

func TestVirtualTableRuleRunsOnSettingsThatAreNotJSON(t *testing.T) {
	// A Field built in Go, not decoded: its settings are not JSON. The rule
	// still runs, reading no link, as TS reads none from settings it cannot
	// read.
	f := Field{FieldType: "virtual_table", Config: Config{Name: "V", APIAccessor: "v"}, Settings: json.RawMessage(`{`)}
	got := map[string]string{}
	for _, e := range ValidateSpec(Spec{f}) {
		got[e.Path] = e.Code
	}
	if got["/v"] != CodeVirtualTableRowSpecMissing || got["/v/settings"] != CodeInvalidSetting || len(got) != 2 {
		t.Errorf("got %v", got)
	}
}

func TestTrimJS(t *testing.T) {
	cases := map[string]string{
		" \t\n\v\f\r x \u00a0": "x",
		"\ufeffx\u3000":        "x", // JS trims the BOM; strings.TrimSpace does not
		"\u0085x":              "\u0085x",
		"\u2028\u2029x\u202f":  "x",
	}
	for in, want := range cases {
		if got := trimJS(in); got != want {
			t.Errorf("trimJS(%q) = %q, want %q", in, got, want)
		}
	}
}
