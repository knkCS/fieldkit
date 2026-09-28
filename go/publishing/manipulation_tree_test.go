package publishing_test

import (
	"encoding/json"
	"reflect"
	"testing"

	fieldkit "github.com/knkcs/fieldkit/go"
	"github.com/knkcs/fieldkit/go/publishing"
)

// titleTree is a manipulation_tree with an embedded Reference Spec, one
// linked for the law Blueprint, and a node-level one.
const titleTree = `{"field_type":"manipulation_tree","config":{"name":"Title","api_accessor":"title","required":false,"instructions":""},
	"settings":{
		"spec":[{"field_type":"text","config":{"name":"Note","api_accessor":"note","required":false,"instructions":""},"system":false}],
		"blueprints":[{"blueprint":"law","spec_blueprint":"R1","spec":[{"field_type":"text","config":{"name":"Kolumnentitel","api_accessor":"kolumnentitel","required":true,"instructions":"","search":"A"},"system":false}]}],
		"annotation_spec":[{"field_type":"text","config":{"name":"Redtitel","api_accessor":"redtitel","required":true,"instructions":""},"system":false}]
	},"system":false}`

func titleField(t *testing.T) fieldkit.Field {
	t.Helper()
	return decode(t, "["+titleTree+"]")[0]
}

func TestManipulationTreeMintsEveryNode(t *testing.T) {
	f := titleField(t)
	value := json.RawMessage(`[{"id":"c1","intent":"include","children":[{"_id":"keep","id":"c2","intent":"exclude"},{"id":"c3","intent":"replace","with":{"id":"na1"}}]}]`)
	// Without the package the type is unknown, and nothing is minted.
	untouched, err := fieldkit.MintIDs(f, value, "content-1")
	if err != nil || string(untouched) != `[{"children":[{"_id":"keep","id":"c2","intent":"exclude"},{"id":"c3","intent":"replace","with":{"id":"na1"}}],"id":"c1","intent":"include"}]` {
		t.Fatalf("fieldkit.MintIDs = %s, %v", untouched, err)
	}
	c := publishing.DefaultCatalogue()
	first, err := c.MintIDs(f, value, "content-1")
	if err != nil {
		t.Fatal(err)
	}
	again, _ := c.MintIDs(f, value, "content-1")
	if string(first) != string(again) {
		t.Errorf("minting is not deterministic:\n%s\n%s", first, again)
	}
	var nodes []map[string]any
	if err := json.Unmarshal(first, &nodes); err != nil {
		t.Fatal(err)
	}
	children, _ := nodes[0]["children"].([]any)
	kept, _ := children[0].(map[string]any)
	minted, _ := children[1].(map[string]any)
	if nodes[0]["_id"] == nil || kept["_id"] != "keep" || minted["_id"] == nil || minted["_id"] == nodes[0]["_id"] {
		t.Errorf("MintIDs = %s", first)
	}
	if _, has := minted["with"].(map[string]any)["_id"]; has {
		t.Errorf("with is not a node, and has no _id: %s", first)
	}
}

func TestManipulationTreeInsideARowReportsAtItsPlace(t *testing.T) {
	spec := decode(t, `[{"field_type":"group","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[`+titleTree+`],"system":false}]`)
	data := json.RawMessage(`{"rows":[{"_id":"r1","title":[
		{"_id":"n1","id":"law1","intent":"include"},
		{"_id":"n2","id":"c2","intent":"annotate","values":{"redtitel":3}}
	]}]}`)
	got := codes(publishing.DefaultCatalogue().ValidateValue(spec, data, fieldkit.WithTargetBlueprints(func(id string) string {
		if id == "law1" {
			return "law"
		}
		return ""
	})))
	want := map[string]string{
		"/rows/r1/title/n1/values/kolumnentitel": fieldkit.CodeRequired,
		"/rows/r1/title/n2/values/redtitel":      fieldkit.CodeInvalidType,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateValue = %v, want %v", got, want)
	}
}

func TestManipulationTreeTextsFollowTheLinkedReferenceSpec(t *testing.T) {
	resolved := &fieldkit.ResolvedSpec{Fields: decode(t, "["+titleTree+"]")}
	data := json.RawMessage(`{"title":[
		{"_id":"n1","id":"law1","intent":"include","values":{"kolumnentitel":"BGB","note":"not the law's"}},
		{"_id":"n2","id":"c2","intent":"include","values":{"note":"embedded"}}
	]}`)
	texts, err := publishing.DefaultCatalogue().Texts(resolved, data, fieldkit.WithTargetBlueprints(func(id string) string {
		if id == "law1" {
			return "law"
		}
		return "other"
	}))
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, text := range texts {
		got[text.Path] = text.Weight + ":" + text.Text
	}
	want := map[string]string{"/title/n1/values/kolumnentitel": "A:BGB", "/title/n2/values/note": "D:embedded"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Texts = %v, want %v", got, want)
	}
}

func TestManipulationTreeConflictsAreEscaped(t *testing.T) {
	resolved := &fieldkit.ResolvedSpec{Fields: decode(t, "["+titleTree+"]")}
	fields, err := publishing.DefaultCatalogue().SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	merger, ok := fields[0].Type.(fieldkit.Merger)
	if !ok {
		t.Fatal("manipulation_tree does not merge finer")
	}
	node := func(intent string) json.RawMessage {
		return json.RawMessage(`[{"_id":"a/b","id":"c1","intent":"` + intent + `"}]`)
	}
	_, conflicts, err := merger.Merge(fields[0].Settings, node("include"), node("exclude"), node("annotate"))
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a~1b/intent"}; !reflect.DeepEqual(conflicts, want) {
		t.Errorf("conflicts = %q, want %q", conflicts, want)
	}
}

func titleType(t *testing.T) (json.RawMessage, fieldkit.Merger) {
	t.Helper()
	resolved := &fieldkit.ResolvedSpec{Fields: decode(t, "["+titleTree+"]")}
	fields, err := publishing.DefaultCatalogue().SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	return fields[0].Settings, fields[0].Type.(fieldkit.Merger)
}

func TestManipulationTreeComparesAnIntentOfTheWrongType(t *testing.T) {
	settings, typ := titleType(t)
	a := json.RawMessage(`[{"_id":"n1","id":"c1","intent":{"x":1}}]`)
	b := json.RawMessage(`[{"_id":"n1","id":"c1","intent":{"x":2}}]`)
	equal, _, err := typ.Compare(settings, a, b)
	if err != nil || equal {
		t.Errorf("Compare = %v, %v; want a difference", equal, err)
	}
	if _, conflicts, err := typ.Merge(settings, a, b, json.RawMessage(`[{"_id":"n1","id":"c1","intent":{"x":3}}]`)); err != nil || len(conflicts) == 0 {
		t.Errorf("Merge = %v, %v; want a conflict", conflicts, err)
	}
}

func TestManipulationTreeMergeNeverAnswersAnIncoherentNode(t *testing.T) {
	settings, typ := titleType(t)
	cases := map[string]struct{ base, ours, theirs string }{
		"an exclude gaining values": {
			`[{"_id":"n1","id":"c1","intent":"include"}]`,
			`[{"_id":"n1","id":"c1","intent":"exclude"}]`,
			`[{"_id":"n1","id":"c1","intent":"include","values":{"note":"x"}}]`,
		},
		"a replace gaining values": {
			`[{"_id":"n1","id":"c1","intent":"include"}]`,
			`[{"_id":"n1","id":"c1","intent":"replace","with":{"id":"na1"}}]`,
			`[{"_id":"n1","id":"c1","intent":"include","values":{"note":"x"}}]`,
		},
		"a with left on an annotate": {
			`[{"_id":"n1","id":"c1","intent":"replace","with":{"id":"na1"}}]`,
			`[{"_id":"n1","id":"c1","intent":"annotate","with":{"id":"na1"},"values":{"redtitel":"r"}}]`,
			`[{"_id":"n1","id":"c1","intent":"replace","with":{"id":"na1"},"pin":"r2"}]`,
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			merged, conflicts, err := typ.Merge(settings, json.RawMessage(tc.base), json.RawMessage(tc.ours), json.RawMessage(tc.theirs))
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(conflicts, []string{"n1/intent"}) {
				t.Errorf("conflicts = %q, merged %s; want n1/intent", conflicts, merged)
			}
		})
	}
}
