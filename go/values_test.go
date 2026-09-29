package fieldkit

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// The cases the shared fixtures cannot hold — a value beyond a cap is too big
// to freeze into a fixture — and the Go-only surface around ValidateValue.
// Everything both languages answer alike is in conformance/unreleased/.

func valueField(fieldType, accessor string, settings string) Field {
	f := Field{FieldType: fieldType, Config: Config{Name: accessor, APIAccessor: accessor}}
	if settings != "" {
		f.Settings = json.RawMessage(settings)
	}
	return f
}

func codesOf(errs []Error) []string {
	out := make([]string, 0, len(errs))
	for _, e := range errs {
		out = append(out, e.Path+" "+e.Code)
	}
	return out
}

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestValidateValueCaps(t *testing.T) {
	tooMany := make([]any, MaxItems+1)
	for i := range tooMany {
		tooMany[i] = 1 // not strings: nothing inside is checked once capped
	}
	exactly := make([]string, MaxItems)
	for i := range exactly {
		exactly[i] = "a"
	}
	keys := map[string]string{}
	for i := 0; i <= MaxItems; i++ {
		keys[fmt.Sprint("k", i)] = "v"
	}
	cases := []struct {
		name  string
		field Field
		data  any
		want  []string
	}{
		{"a list beyond MaxItems", valueField("checkboxes", "tags", ""), map[string]any{"tags": tooMany}, []string{"/tags too_many_items"}},
		{"exactly MaxItems", valueField("checkboxes", "tags", ""), map[string]any{"tags": exactly}, nil},
		{"an object's keys", valueField("array", "keyed", `{"mode":"keyed"}`), map[string]any{"keyed": keys}, []string{"/keyed too_many_items"}},
		{
			// Three UTF-8 bytes each: within the cap by UTF-16 length, beyond
			// it by bytes.
			"a string beyond MaxStringBytes",
			valueField("text", "title", ""),
			map[string]any{"title": strings.Repeat("€", MaxStringBytes/3+1)},
			[]string{"/title too_many_bytes"},
		},
		{"a string of exactly MaxStringBytes", valueField("text", "title", ""), map[string]any{"title": strings.Repeat("a", MaxStringBytes)}, nil},
	}
	for _, c := range cases {
		got := codesOf(ValidateValue(Spec{c.field}, mustJSON(t, c.data)))
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestValidateValueCapsTheWholeDocument(t *testing.T) {
	stray := make([]string, MaxItems+1)
	required := valueField("text", "title", "")
	required.Config.Required = true
	got := codesOf(ValidateValue(Spec{required}, mustJSON(t, map[string]any{"stray": stray})))
	if strings.Join(got, ",") != "/stray too_many_items" {
		t.Errorf("keys the Spec does not name: got %v", got)
	}
	root := map[string]int{}
	for i := 0; i <= MaxItems; i++ {
		root[fmt.Sprint("k", i)] = 1
	}
	got = codesOf(ValidateValue(nil, mustJSON(t, root)))
	if strings.Join(got, ",") != " too_many_items" {
		t.Errorf("keys at the root: got %v", got)
	}
}

func TestValidateValueCapParams(t *testing.T) {
	errs := ValidateValue(Spec{valueField("text", "title", "")},
		mustJSON(t, map[string]any{"title": strings.Repeat("a", MaxStringBytes+1)}))
	if len(errs) != 1 || errs[0].Params["maximum"] != MaxStringBytes {
		t.Errorf("got %+v, want too_many_bytes with maximum %d", errs, MaxStringBytes)
	}
}

func TestValidateValueData(t *testing.T) {
	spec := Spec{valueField("text", "title", "")}
	cases := []struct {
		name string
		data string
		want []string
	}{
		{"empty data is {}", "", nil},
		{"whitespace is empty", "  \n", nil},
		{"not JSON", "{", []string{" invalid_type"}},
		{"two values", "{} {}", []string{" invalid_type"}},
		{"null", "null", []string{" invalid_type"}},
		{"a string", `"x"`, []string{" invalid_type"}},
	}
	for _, c := range cases {
		got := codesOf(ValidateValue(spec, json.RawMessage(c.data)))
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestValidateValueValidIsNil(t *testing.T) {
	if errs := ValidateValue(Spec{valueField("text", "title", "")}, json.RawMessage(`{"title":"x"}`)); errs != nil {
		t.Errorf("got %v, want nil", errs)
	}
}

func TestValidateValueSkipsWhatItDoesNotImplement(t *testing.T) {
	// A type outside the Catalogue — a Consumer's own — is skipped, not
	// refused, in a row too.
	group := valueField("group", "authors", "")
	group.Children = []Field{valueField("legacy", "related", "")}
	spec := Spec{
		group,
		valueField("legacy", "related", ""),
	}
	data := json.RawMessage(`{"authors": [{"_id": "a", "related": 5}], "related": "x"}`)
	if errs := ValidateValue(spec, data); errs != nil {
		t.Errorf("got %v, want nil", errs)
	}
}

func TestInvalidPatternChecksTheRest(t *testing.T) {
	// "(" is neither JS nor RE2: the pattern checks nothing, the lengths
	// still do — TS answers the same.
	f := valueField("text", "code", "")
	pattern, most := "(", 2.0
	f.Validation = &Validation{Pattern: &pattern, MaxLength: &most}
	got := codesOf(ValidateValue(Spec{f}, json.RawMessage(`{"code":"abc"}`)))
	if strings.Join(got, ",") != "/code too_big" {
		t.Errorf("got %v, want /code too_big", got)
	}
}

func TestCompilePatternUnsupported(t *testing.T) {
	// A lookahead is JS, not RE2: the pattern checks nothing rather than
	// refusing every value.
	f := valueField("text", "code", "")
	pattern := `^(?=A)A$`
	f.Validation = &Validation{Pattern: &pattern}
	if errs := ValidateValue(Spec{f}, json.RawMessage(`{"code":"B"}`)); errs != nil {
		t.Errorf("got %v, want nil", errs)
	}
}

// deepDoc is a rich-text document whose textBlocks nest levels deep, each a
// node and its content array: 2·levels JSON levels below the document.
func deepDoc(levels int) map[string]any {
	inner := map[string]any{"type": "textWrapper", "attrs": map[string]any{"id": "a"}, "content": []any{map[string]any{"type": "text", "text": "tief"}}}
	for i := range levels {
		inner = map[string]any{"type": "textBlock", "attrs": map[string]any{"id": fmt.Sprintf("b%d", i)}, "content": []any{inner}}
	}
	return map[string]any{"type": "doc", "content": []any{inner}}
}

func deepArray(levels int) any {
	var v any = "x"
	for range levels {
		v = []any{v}
	}
	return v
}

// ADR-0025: Unset and the depth cap stop at a rich-text document; the size
// caps do not.
func TestValidateValueDocumentBoundary(t *testing.T) {
	hidden := valueField("rich_text", "hidden_body", "")
	yes := true
	hidden.Config.Hidden = &yes
	withNull := func() map[string]any {
		return map[string]any{"type": "doc", "content": []any{map[string]any{
			"type": "textWrapper", "attrs": map[string]any{"id": "a", "textAlign": nil, "attributes": map[string]any{}},
			"content": []any{map[string]any{"type": "text", "text": "x"}},
		}}}
	}
	huge := map[string]any{"type": "doc", "content": []any{map[string]any{
		"type": "textWrapper", "attrs": map[string]any{"id": "a"},
		"content": []any{map[string]any{"type": "text", "text": strings.Repeat("a", MaxStringBytes+1)}},
	}}}

	cases := []struct {
		name string
		spec Spec
		data map[string]any
		want []string
	}{
		{
			"a hidden rich_text Field's document is its own too",
			Spec{hidden},
			map[string]any{"hidden_body": withNull()},
			nil,
		},
		{
			"the same document under a key no Field names is fieldkit's",
			Spec{},
			map[string]any{"stray": withNull()},
			[]string{"/stray/content/0/attrs/attributes not_canonical", "/stray/content/0/attrs/textAlign not_canonical"},
		},
		{
			"a string inside a document still counts toward MaxStringBytes",
			Spec{valueField("rich_text", "body", "")},
			map[string]any{"body": huge},
			[]string{"/body/content/0/content/0/text too_many_bytes"},
		},
		{
			// The documents are found in data cut off below MaxDepth, so a
			// pathological sibling neither hides the document nor runs the
			// containers' walk down its whole depth.
			"a document deeper than MaxDepth inside, beside data that is too deep",
			Spec{valueField("rich_text", "body", "")},
			map[string]any{"body": deepDoc(MaxDepth), "junk": deepArray(5000)},
			[]string{"/junk" + strings.Repeat("/0", MaxDepth) + " too_deep"},
		},
	}
	for _, c := range cases {
		got := codesOf(ValidateValue(c.spec, mustJSON(t, c.data)))
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
