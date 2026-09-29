package publishing_test

import (
	"encoding/json"
	"reflect"
	"testing"

	fieldkit "github.com/knkcs/fieldkit/go"
	"github.com/knkcs/fieldkit/go/publishing"
)

// related is a Reference Field whose Reference Spec holds a
// reference_filter, beside one at the root.
const related = `[
	{"field_type":"reference","config":{"name":"Related","api_accessor":"related","required":false,"instructions":""},
	 "settings":{"spec":[{"field_type":"reference_filter","config":{"name":"Exclude","api_accessor":"exclude","required":false,"instructions":""},"system":false}]},"system":false},
	{"field_type":"reference_filter","config":{"name":"Root","api_accessor":"root","required":false,"instructions":""},"system":false}
]`

func decode(t *testing.T, raw string) fieldkit.Spec {
	t.Helper()
	spec, err := fieldkit.DecodeSpec([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	return spec
}

func codes(errs []fieldkit.Error) map[string]string {
	out := map[string]string{}
	for _, e := range errs {
		out[e.Path] = e.Code
	}
	return out
}

func TestTheSectionListsExactlyThePublishingTypes(t *testing.T) {
	section := publishing.Catalogue()
	if section.Version != fieldkit.DefaultCatalogue().Version {
		t.Errorf("the section is %s, the Catalogue %s: one release ships both", section.Version, fieldkit.DefaultCatalogue().Version)
	}
	ids := []string{}
	for _, typ := range section.Types {
		ids = append(ids, typ.ID)
	}
	if want := []string{"manipulation_tree", "outline_tree", "reference_filter", "template_text", "ti_overlay"}; !reflect.DeepEqual(ids, want) {
		t.Errorf("types = %v, want %v", ids, want)
	}
	filter, _ := section.Type("reference_filter")
	if !reflect.DeepEqual(filter.Positions, []string{fieldkit.PositionReferenceSpec}) || filter.HasText {
		t.Errorf("reference_filter = %+v", filter)
	}
}

func TestNothingRegistersThePublishingTypes(t *testing.T) {
	spec := decode(t, related)
	want := map[string]string{"/related/settings/spec/exclude": fieldkit.CodeUnknownFieldType, "/root": fieldkit.CodeUnknownFieldType}
	if got := codes(fieldkit.ValidateSpec(spec)); !reflect.DeepEqual(got, want) {
		t.Errorf("fieldkit.ValidateSpec = %v, want %v", got, want)
	}
	if _, ok := fieldkit.DefaultCatalogue().Type("reference_filter"); ok {
		t.Error("importing publishing registered its types")
	}
}

func TestReferenceFilterSitsOnlyInAReferenceSpec(t *testing.T) {
	spec := decode(t, related)
	want := map[string]string{"/root": fieldkit.CodeInvalidPosition}
	if got := codes(publishing.DefaultCatalogue().ValidateSpec(spec)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSpec = %v, want %v", got, want)
	}
	c, err := fieldkit.DefaultCatalogue().With(publishing.Catalogue())
	if err != nil {
		t.Fatal(err)
	}
	if got := codes(c.ValidateSpec(spec)); !reflect.DeepEqual(got, want) {
		t.Errorf("With: ValidateSpec = %v, want %v", got, want)
	}
}

func TestReferenceFilterHasNoSettings(t *testing.T) {
	c := publishing.DefaultCatalogue()
	if errs := c.ValidateSettings("reference_filter", json.RawMessage(`{"mode":null}`)); len(errs) != 0 {
		t.Errorf("an Unset key: %v", errs)
	}
	want := map[string]string{"/mode": fieldkit.CodeUnknownSetting}
	if got := codes(c.ValidateSettings("reference_filter", json.RawMessage(`{"mode":"strict"}`))); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSettings = %v, want %v", got, want)
	}
}

func TestReferenceFilterValues(t *testing.T) {
	spec := decode(t, related)
	c := publishing.DefaultCatalogue()
	cases := map[string]struct {
		data string
		want map[string]string
	}{
		"ids, repeats allowed": {`{"related":[{"_id":"n1","id":"c1","values":{"exclude":["c2","c3","c2"]}}]}`, map[string]string{}},
		"a blank id":           {`{"related":[{"_id":"n1","id":"c1","values":{"exclude":["c2",""]}}]}`, map[string]string{"/related/n1/values/exclude/1": fieldkit.CodeTooSmall}},
		"an id not a string":   {`{"related":[{"_id":"n1","id":"c1","values":{"exclude":[2]}}]}`, map[string]string{"/related/n1/values/exclude/0": fieldkit.CodeInvalidType}},
		"not a list":           {`{"related":[{"_id":"n1","id":"c1","values":{"exclude":{"id":"c2"}}}]}`, map[string]string{"/related/n1/values/exclude": fieldkit.CodeInvalidType}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := codes(c.ValidateValue(spec, json.RawMessage(tc.data))); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ValidateValue = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestReferenceFilterYieldsExcludeEdgesAndNoText(t *testing.T) {
	c := publishing.DefaultCatalogue()
	resolved := &fieldkit.ResolvedSpec{Fields: decode(t, related)}
	data := json.RawMessage(`{"related":[{"_id":"n1","id":"c1","values":{"exclude":["c2","c3","c2",""]}}]}`)
	edges, err := c.Edges(resolved, data)
	if err != nil {
		t.Fatal(err)
	}
	// The Reference's own edge, then one exclude edge per distinct id, at the
	// Field, with no Pin.
	want := []fieldkit.Edge{
		{Path: "/related/n1", Kind: fieldkit.EdgeReference, Target: fieldkit.Target{Content: "c1"}},
		{Path: "/related/n1/values/exclude", Kind: fieldkit.EdgeExclude, Target: fieldkit.Target{Content: "c2"}},
		{Path: "/related/n1/values/exclude", Kind: fieldkit.EdgeExclude, Target: fieldkit.Target{Content: "c3"}},
	}
	if !reflect.DeepEqual(edges, want) {
		t.Errorf("Edges = %+v, want %+v", edges, want)
	}
	texts, err := c.Texts(resolved, data)
	if err != nil || len(texts) != 0 {
		t.Errorf("Texts = %+v, %v", texts, err)
	}
}
