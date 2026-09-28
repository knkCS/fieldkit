package publishing_test

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	fieldkit "github.com/knkcs/fieldkit/go"
	"github.com/knkcs/fieldkit/go/publishing"
)

// outline is an outline_tree whose Blueprint Release is resolved: a kind and
// a required title.
const outline = `[{"field_type":"outline_tree","config":{"name":"Outline","api_accessor":"outline","required":false,"instructions":""},
 "settings":{"blueprint":"outline-bp@1","text_type":"tt@1"},
 "children":[
  {"field_type":"select","config":{"name":"Kind","api_accessor":"kind","required":false,"instructions":""},"settings":{"options":{"part":"Part"}},"system":false},
  {"field_type":"text","config":{"name":"Title","api_accessor":"title","required":true,"instructions":""},"system":false}
 ],"system":false}]`

func TestOutlineTreePinsABlueprintReleaseAndATextType(t *testing.T) {
	c := publishing.DefaultCatalogue()
	spec := decode(t, outline)
	want := []fieldkit.Pin{
		{Path: "/outline/settings/blueprint", Kind: "blueprint", Release: "outline-bp@1"},
		{Path: "/outline/settings/text_type", Kind: "text_type", Release: "tt@1"},
	}
	if got := c.Pins(spec); !reflect.DeepEqual(got, want) {
		t.Errorf("Pins = %+v, want %+v", got, want)
	}
	if got := fieldkit.Pins(spec); len(got) != 0 {
		t.Errorf("without the package: Pins = %+v", got)
	}
}

func TestOutlineTreeResolveInlinesItsBlueprintRelease(t *testing.T) {
	c := publishing.DefaultCatalogue()
	authored := decode(t, `[{"field_type":"outline_tree","config":{"name":"Outline","api_accessor":"outline","required":false,"instructions":""},"settings":{"blueprint":"outline-bp@1","text_type":"tt@1"},"system":false}]`)
	fetched := map[string]int{}
	resolved, err := c.Resolve(context.Background(), authored, fieldkit.FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		fetched[kind+" "+release]++
		if kind == "text_type" {
			return json.RawMessage(`{"minimumVocabularyVersion":null,"nodes":{"doc":{"options":{}},"textWrapper":{"options":{}},"text":{"options":{}}},"marks":{}}`), nil
		}
		return json.RawMessage(`[{"field_type":"text","config":{"name":"Title","api_accessor":"title","required":false,"instructions":""},"system":false},
			{"field_type":"group","config":{"name":"Box","api_accessor":"box","required":false,"instructions":""},"system":false}]`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	if want := map[string]int{"blueprint outline-bp@1": 1, "text_type tt@1": 1}; !reflect.DeepEqual(fetched, want) {
		t.Errorf("fetched %v, want %v", fetched, want)
	}
	if got := resolved.Fields[0].Children; len(got) != 2 || got[0].Config.APIAccessor != "title" {
		t.Fatalf("children = %+v", got)
	}
	if resolved.Part("text_type", "tt@1") == nil {
		t.Error("the Text Type is not in parts")
	}
	// The inlined Fields sit where a Reference Spec's do: no container.
	want := map[string]string{"/outline/children/box": fieldkit.CodePosition}
	if got := codes(c.ValidateResolvedSpec(resolved)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateResolvedSpec = %v, want %v", got, want)
	}
}

func TestOutlineTreeSettings(t *testing.T) {
	c := publishing.DefaultCatalogue()
	want := map[string]string{"/levels": fieldkit.CodeUnknownSetting, "/text_type_id": fieldkit.CodeUnknownSetting}
	if got := codes(c.ValidateSettings("outline_tree", json.RawMessage(`{"levels":[{"key":"part"}],"text_type_id":"tt"}`))); !reflect.DeepEqual(got, want) {
		t.Errorf("core's keys: %v, want %v", got, want)
	}
	// Only at the root: not in a Row Spec.
	spec := decode(t, `[{"field_type":"virtual_table","config":{"name":"VT","api_accessor":"vt","required":false,"instructions":""},"children":[
		{"field_type":"outline_tree","config":{"name":"O","api_accessor":"o","required":false,"instructions":""},"system":false}],"system":false}]`)
	if got := codes(c.ValidateSpec(spec)); !reflect.DeepEqual(got, map[string]string{"/vt/children/o": fieldkit.CodePosition}) {
		t.Errorf("ValidateSpec = %v", got)
	}
}

func TestOutlineTreeValues(t *testing.T) {
	spec := decode(t, outline)
	c := publishing.DefaultCatalogue()
	cases := map[string]struct {
		data string
		want map[string]string
	}{
		"a tree": {`{"outline":[{"_id":"n1","values":{"kind":"part","title":"One"},"children":[{"_id":"n2","values":{"title":"One.One"}}]},{"_id":"n3","values":{"title":"Two"}}]}`, map[string]string{}},
		"node values": {`{"outline":[{"_id":"n1","values":{"kind":5,"title":"One"},"children":[{"_id":"n2"},{"_id":"n3","values":{"title":3}}]}]}`, map[string]string{
			"/outline/n1/values/kind":              fieldkit.CodeInvalidType,
			"/outline/n1/children/n2/values/title": fieldkit.CodeRequired,
			"/outline/n1/children/n3/values/title": fieldkit.CodeInvalidType,
		}},
		"ids across the tree": {`{"outline":[{"_id":"n1","values":{"title":"a"},"children":[{"_id":"n1","values":{"title":"b"}}]},{"values":{"title":"c"}},{"_id":7,"values":{"title":"d"}}]}`, map[string]string{
			"/outline/n1/children/n1": fieldkit.CodeDuplicateID,
			"/outline/1":              fieldkit.CodeMissingID,
			"/outline/2/_id":          fieldkit.CodeInvalidType,
		}},
		"shapes": {`{"outline":["n1",{"_id":"n2","values":["x"],"children":{"_id":"n3"}}]}`, map[string]string{
			"/outline/0":           fieldkit.CodeInvalidType,
			"/outline/n2/values":   fieldkit.CodeInvalidType,
			"/outline/n2/children": fieldkit.CodeInvalidType,
		}},
		"not a list": {`{"outline":{"_id":"n1"}}`, map[string]string{"/outline": fieldkit.CodeInvalidType}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := codes(c.ValidateValue(spec, json.RawMessage(tc.data))); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ValidateValue = %v, want %v", got, tc.want)
			}
		})
	}
	// Unresolved, a node's values are an opaque record.
	unresolved := decode(t, `[{"field_type":"outline_tree","config":{"name":"Outline","api_accessor":"outline","required":false,"instructions":""},"settings":{"blueprint":"outline-bp@1"},"system":false}]`)
	if errs := c.ValidateValue(unresolved, json.RawMessage(`{"outline":[{"_id":"n1","values":{"anything":1}}]}`)); len(errs) != 0 {
		t.Errorf("unresolved: %v", errs)
	}
}

func TestTemplateText(t *testing.T) {
	c := publishing.DefaultCatalogue()
	want := map[string]string{"/context_blueprints/1": fieldkit.CodeInvalidSetting, "/mode": fieldkit.CodeUnknownSetting}
	if got := codes(c.ValidateSettings("template_text", json.RawMessage(`{"context_blueprints":["bp-1",2],"mode":"go"}`))); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSettings = %v, want %v", got, want)
	}
	spec := decode(t, `[{"field_type":"template_text","config":{"name":"Template","api_accessor":"template","required":true,"instructions":""},"system":false}]`)
	cases := map[string]map[string]string{
		`{"template":"{{ if .Count }}{{ end }"}`: {},
		`{"template":3}`:                         {"/template": fieldkit.CodeInvalidType},
		`{}`:                                     {"/template": fieldkit.CodeRequired},
	}
	for data, want := range cases {
		if got := codes(c.ValidateValue(spec, json.RawMessage(data))); !reflect.DeepEqual(got, want) {
			t.Errorf("ValidateValue(%s) = %v, want %v", data, got, want)
		}
	}
	texts, err := c.Texts(&fieldkit.ResolvedSpec{Fields: spec}, json.RawMessage(`{"template":"Hello {{ .Name }}"}`))
	if err != nil || len(texts) != 0 {
		t.Errorf("Texts = %+v, %v", texts, err)
	}
}
