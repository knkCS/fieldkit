package fieldkit

import (
	"testing"
)

// rejectLocalizable is the kind of policy a service brings: a content
// Blueprint may not declare localizable Fields. fieldkit ships none.
func rejectLocalizable(f Field, _, _ string) []Error {
	if f.Config.Localizable != nil && *f.Config.Localizable {
		return []Error{{Path: "/config/localizable", Code: "localizable_not_allowed"}}
	}
	return nil
}

func TestPolicyAddsErrorsAtEveryDepth(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"text","config":{"name":"Title","api_accessor":"title","required":false,"instructions":"","localizable":true},"system":false},
		{"field_type":"text","config":{"name":"Plain","api_accessor":"plain","required":false,"instructions":"","localizable":false},"system":false},
		{"field_type":"group","config":{"name":"Meta","api_accessor":"meta","required":false,"instructions":""},"children":[
			{"field_type":"text","config":{"name":"Note","api_accessor":"note","required":false,"instructions":"","localizable":true},"system":false}
		],"system":false},
		{"field_type":"blocks","config":{"name":"Content","api_accessor":"content","required":false,"instructions":""},"settings":{"allowed_blocks":[
			{"type":"hero","name":"Hero","fields":[
				{"field_type":"text","config":{"name":"Headline","api_accessor":"headline","required":false,"instructions":"","localizable":true},"system":false}
			]}
		]},"system":false}
	]`))
	if err != nil {
		t.Fatal(err)
	}

	if errs := ValidateSpec(spec); len(errs) != 0 {
		t.Fatalf("without a policy: %v, want none", errs)
	}

	got := map[string]string{}
	for _, e := range ValidateSpec(spec, WithPolicy(rejectLocalizable)) {
		got[e.Path] = e.Code
	}
	want := map[string]string{
		"/title/config/localizable":                                             "localizable_not_allowed",
		"/meta/children/note/config/localizable":                                "localizable_not_allowed",
		"/content/settings/allowed_blocks/0/fields/headline/config/localizable": "localizable_not_allowed",
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

func TestPolicyIsToldWhereTheFieldSits(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"text","config":{"name":"Title","api_accessor":"title","required":false,"instructions":""},"system":false},
		{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[
			{"field_type":"text","config":{"name":"Label","api_accessor":"label","required":false,"instructions":""},"system":false}
		],"system":false},
		{"field_type":"blocks","config":{"name":"Content","api_accessor":"content","required":false,"instructions":""},"settings":{"allowed_blocks":[
			{"type":"hero","name":"Hero","fields":[
				{"field_type":"text","config":{"name":"Headline","api_accessor":"headline","required":false,"instructions":""},"system":false}
			]}
		]},"system":false}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]string{}
	ValidateSpec(spec, WithPolicy(func(_ Field, path, position string) []Error {
		seen[path] = position
		return nil
	}))
	want := map[string]string{
		"/title":               PositionRoot,
		"/rows":                PositionRoot,
		"/rows/children/label": PositionRow,
		"/content":             PositionRoot,
		"/content/settings/allowed_blocks/0/fields/headline": PositionBlockType,
	}
	if len(seen) != len(want) {
		t.Fatalf("seen %v, want %v", seen, want)
	}
	for path, position := range want {
		if seen[path] != position {
			t.Errorf("%s: position %q, want %q", path, seen[path], position)
		}
	}
}

func TestPositionErrorNamesThePositionAndTheType(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[
			{"field_type":"group","config":{"name":"Nested","api_accessor":"nested","required":false,"instructions":""},"system":false}
		],"system":false}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	errs := ValidateSpec(spec)
	if len(errs) != 1 || errs[0].Code != CodeInvalidPosition || errs[0].Path != "/rows/children/nested" {
		t.Fatalf("got %v, want one position error at /rows/children/nested", errs)
	}
	if errs[0].Params["position"] != PositionRow || errs[0].Params["field_type"] != "group" {
		t.Errorf("params %v, want position row and field_type group", errs[0].Params)
	}
}
