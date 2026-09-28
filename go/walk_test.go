package fieldkit

import (
	"encoding/json"
	"slices"
	"testing"
)

// The types that yield text are exactly the types the Catalogue marks
// has_text: search is valid on those (ValidateSpec), so Texts must read them.
func TestTextRulesMatchCatalogue(t *testing.T) {
	var hasText, rules []string
	for _, typ := range DefaultCatalogue().Types {
		if typ.HasText {
			hasText = append(hasText, typ.ID)
		}
	}
	for id := range textRules {
		rules = append(rules, id)
	}
	slices.Sort(hasText)
	slices.Sort(rules)
	if !slices.Equal(hasText, rules) {
		t.Errorf("textRules = %v, Catalogue has_text = %v", rules, hasText)
	}
}

// Every type with an edge rule is one the Catalogue lists, and lookup is not
// among them.
func TestEdgeRules(t *testing.T) {
	for id := range edgeRules {
		if _, ok := DefaultCatalogue().Type(id); !ok {
			t.Errorf("edge rule for %q, which the Catalogue does not list", id)
		}
	}
	if _, ok := edgeRules["lookup"]; ok {
		t.Error("lookup yields edges; its bare id is no Content")
	}
}

func TestValueText(t *testing.T) {
	field := func(typ, settings string) Field {
		f := Field{FieldType: typ, Config: Config{APIAccessor: "x"}}
		if settings != "" {
			f.Settings = json.RawMessage(settings)
		}
		return f
	}
	cases := []struct {
		name  string
		field Field
		value string
		want  string
	}{
		{"a string type", field("text", ""), `"Hello"`, "Hello"},
		{"a List", field("list", ""), `["a","","b"]`, "a\nb"},
		{"a keyed Array", field("array", `{"mode":"keyed"}`), `{"b":"2","a":"1"}`, "a\n1\nb\n2"},
		{"a type without text", field("select", ""), `"key"`, ""},
		{"a lookup", field("lookup", ""), `"id"`, ""},
		{"Unset", field("text", ""), `""`, ""},
		{"null", field("text", ""), `null`, ""},
		{"absent", field("text", ""), ``, ""},
		{"a value of the wrong shape", field("text", ""), `42`, ""},
		{"not JSON", field("text", ""), `{`, ""},
	}
	for _, c := range cases {
		if got := ValueText(c.field, json.RawMessage(c.value)); got != c.want {
			t.Errorf("%s: ValueText = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestWalkersRefuseDataThatIsNotAnObject(t *testing.T) {
	resolved := &ResolvedSpec{Fields: Spec{{FieldType: "text", Config: Config{APIAccessor: "title"}}}}
	for _, data := range []string{`[]`, `"x"`, `{`, `{} {}`, `null`} {
		if _, err := Edges(resolved, json.RawMessage(data)); err == nil {
			t.Errorf("Edges(%s): no error", data)
		}
		if _, err := Texts(resolved, json.RawMessage(data)); err == nil {
			t.Errorf("Texts(%s): no error", data)
		}
	}
	for _, data := range []string{``, `{}`} {
		edges, err := Edges(resolved, json.RawMessage(data))
		if err != nil || edges == nil || len(edges) != 0 {
			t.Errorf("Edges(%q) = %v, %v; want [], nil", data, edges, err)
		}
		texts, err := Texts(nil, json.RawMessage(data))
		if err != nil || texts == nil || len(texts) != 0 {
			t.Errorf("Texts(nil, %q) = %v, %v; want [], nil", data, texts, err)
		}
	}
}

// The walk reads what validation accepted and never panics on what it did
// not: values of the wrong shape at every level yield nothing.
func TestWalkersTolerateWrongShapes(t *testing.T) {
	spec, err := DecodeSpec([]byte(`[
		{"field_type":"media","config":{"name":"m","api_accessor":"m","required":false,"instructions":""},"system":false},
		{"field_type":"group","config":{"name":"g","api_accessor":"g","required":false,"instructions":""},"children":[
			{"field_type":"text","config":{"name":"t","api_accessor":"t","required":false,"instructions":""},"system":false}
		],"system":false},
		{"field_type":"blocks","config":{"name":"b","api_accessor":"b","required":false,"instructions":""},"settings":{"allowed_blocks":"nope"},"system":false},
		{"field_type":"array","config":{"name":"a","api_accessor":"a","required":false,"instructions":""},"system":false}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	resolved := &ResolvedSpec{Fields: spec}
	data := json.RawMessage(`{"m":"x","g":{"t":"y"},"b":[1,{"_type":"q"}],"a":[1,{"key":2}]}`)
	edges, err := Edges(resolved, data)
	if err != nil || len(edges) != 0 {
		t.Errorf("Edges = %v, %v; want none", edges, err)
	}
	texts, err := Texts(resolved, data)
	if err != nil || len(texts) != 0 {
		t.Errorf("Texts = %v, %v; want none", texts, err)
	}
}
