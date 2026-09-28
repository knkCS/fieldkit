package fieldkit

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// stampSection is a Catalogue section of one type, "stamp", whose code uses
// every hook TypeCode has, so each test below proves one seam carries it.
const stampSection = `{"version":"%s","types":[{"id":"stamp","since":"0.18.0","settings_schema":{"type":"object","properties":{"lo":{"type":"string"},"hi":{"type":"string"}},"additionalProperties":false},"positions":["root","row"],"consumers":["blueprint"],"pins":[],"has_text":true}]}`

func stampCode() map[string]TypeCode {
	return map[string]TypeCode{"stamp": {
		Settings: func(settings any) []Error {
			obj, _ := settings.(map[string]any)
			if lo, hi := obj["lo"], obj["hi"]; lo != nil && lo == hi {
				return []Error{{Path: "/hi", Code: CodeInvalidSetting}}
			}
			return nil
		},
		Value: func(_ Field, _ map[string]any, value any, _ TypeEnv) []Error {
			if s, ok := value.(string); !ok || !strings.HasPrefix(s, "S-") {
				return []Error{{Path: "", Code: CodeInvalidFormat}}
			}
			return nil
		},
		Edges: func(_ Field, _ map[string]any, value any, _ TypeEnv) []Edge {
			s, _ := value.(string)
			return []Edge{{Path: "", Kind: "stamped", Target: Target{Content: s}}}
		},
		Text: func(_ Field, _ map[string]any, value any, _ TypeEnv) string {
			s, _ := value.(string)
			return strings.TrimPrefix(s, "S-")
		},
		Compare: func(_ Field, a, b any, _ TypeEnv) (bool, *CompareDetail, error) {
			// Case does not matter to a stamp.
			as, _ := a.(string)
			bs, _ := b.(string)
			if strings.EqualFold(as, bs) {
				return true, nil, nil
			}
			return false, &CompareDetail{Status: StatusChanged}, nil
		},
		Merge: func(_ Field, _, ours, theirs any, _ TypeEnv) (any, []string, error) {
			if strings.EqualFold(ours.(string), theirs.(string)) {
				return ours, nil, nil
			}
			return nil, []string{"stamp"}, nil
		},
	}}
}

func newStampSection(t *testing.T, version string) *Catalogue {
	t.Helper()
	section, err := NewCatalogue([]byte(strings.Replace(stampSection, "%s", version, 1)), stampCode())
	if err != nil {
		t.Fatal(err)
	}
	return section
}

func withStamp(t *testing.T) *Catalogue {
	t.Helper()
	c, err := DefaultCatalogue().With(newStampSection(t, DefaultCatalogue().Version))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

const stampSpec = `[{"field_type":"stamp","config":{"name":"S","api_accessor":"s","required":false,"instructions":""},"settings":{"lo":"a","hi":"a"},"system":false},{"field_type":"group","config":{"name":"G","api_accessor":"g","required":false,"instructions":""},"children":[{"field_type":"stamp","config":{"name":"T","api_accessor":"t","required":false,"instructions":""},"system":false}],"system":false}]`

func TestSectionTypesAreUnknownUntilOptedIn(t *testing.T) {
	spec, err := DecodeSpec([]byte(stampSpec))
	if err != nil {
		t.Fatal(err)
	}
	got := codes(ValidateSpec(spec))
	want := map[string]string{"/s": CodeUnknownFieldType, "/g/children/t": CodeUnknownFieldType}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("without the section: %v, want %v", got, want)
	}
	// The default Catalogue is not changed by a With.
	withStamp(t)
	if _, ok := DefaultCatalogue().Type("stamp"); ok {
		t.Error("With changed the default Catalogue")
	}
	if errs := ValidateValue(spec, json.RawMessage(`{"s":"nope"}`)); len(errs) != 0 {
		t.Errorf("without the section a stamp's value is checked: %v", errs)
	}
}

func TestSectionTypesValidateThroughTheirCode(t *testing.T) {
	c := withStamp(t)
	spec, err := DecodeSpec([]byte(stampSpec))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := codes(c.ValidateSpec(spec)), map[string]string{"/s/settings/hi": CodeInvalidSetting}; !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSpec = %v, want %v", got, want)
	}
	data := json.RawMessage(`{"s":"nope","g":[{"_id":"r1","t":"S-ok"},{"_id":"r2","t":7}]}`)
	want := map[string]string{"/s": CodeInvalidFormat, "/g/r2/t": CodeInvalidFormat}
	if got := codes(c.ValidateValue(spec, data)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateValue = %v, want %v", got, want)
	}
	if got := codes(c.ValidateResolvedValue(&ResolvedSpec{Fields: spec}, data)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateResolvedValue = %v, want %v", got, want)
	}
}

func TestSectionTypesYieldEdgesAndText(t *testing.T) {
	c := withStamp(t)
	spec, err := DecodeSpec([]byte(stampSpec))
	if err != nil {
		t.Fatal(err)
	}
	resolved := &ResolvedSpec{Fields: spec}
	data := json.RawMessage(`{"s":"S-one","g":[{"_id":"r1","t":"S-two"}]}`)
	edges, err := c.Edges(resolved, data)
	if err != nil {
		t.Fatal(err)
	}
	wantEdges := []Edge{
		{Path: "/s", Kind: "stamped", Target: Target{Content: "S-one"}},
		{Path: "/g/r1/t", Kind: "stamped", Target: Target{Content: "S-two"}},
	}
	if !reflect.DeepEqual(edges, wantEdges) {
		t.Errorf("Edges = %v, want %v", edges, wantEdges)
	}
	texts, err := c.Texts(resolved, data)
	if err != nil {
		t.Fatal(err)
	}
	wantTexts := []FieldText{{Path: "/s", Weight: SearchD, Text: "one"}, {Path: "/g/r1/t", Weight: SearchD, Text: "two"}}
	if !reflect.DeepEqual(texts, wantTexts) {
		t.Errorf("Texts = %v, want %v", texts, wantTexts)
	}
	if got := c.ValueText(spec[0], json.RawMessage(`"S-three"`)); got != "three" {
		t.Errorf("ValueText = %q", got)
	}
	if got := ValueText(spec[0], json.RawMessage(`"S-three"`)); got != "" {
		t.Errorf("ValueText without the section = %q", got)
	}
}

func TestSectionTypesCompareAndMergeThroughTheirCode(t *testing.T) {
	c := withStamp(t)
	spec, err := DecodeSpec([]byte(stampSpec))
	if err != nil {
		t.Fatal(err)
	}
	fields, err := c.SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		t.Fatal(err)
	}
	stamp, ok := fields[0].Type.(interface {
		Merge(settings, base, ours, theirs json.RawMessage) (json.RawMessage, []string, error)
	})
	if !ok {
		t.Fatal("a type with Merge is not a Merger")
	}
	equal, _, err := fields[0].Type.Compare(fields[0].Settings, json.RawMessage(`"S-a"`), json.RawMessage(`"s-A"`))
	if err != nil || !equal {
		t.Errorf("Compare = %v, %v; want equal", equal, err)
	}
	_, conflicts, err := stamp.Merge(fields[0].Settings, json.RawMessage(`"S-a"`), json.RawMessage(`"S-b"`), json.RawMessage(`"S-c"`))
	if err != nil || !reflect.DeepEqual(conflicts, []string{"stamp"}) {
		t.Errorf("Merge conflicts = %v, %v", conflicts, err)
	}
	// Inside a row the composer hands the child to the section's code too.
	group := fields[1].Type
	equal, _, err = group.Compare(fields[1].Settings, json.RawMessage(`[{"_id":"r1","t":"S-a"}]`), json.RawMessage(`[{"_id":"r1","t":"s-A"}]`))
	if err != nil || !equal {
		t.Errorf("a row's stamp: Compare = %v, %v; want equal", equal, err)
	}
	// Without the section it is a whole value: case matters.
	plain, err := SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		t.Fatal(err)
	}
	if equal, _, _ := plain[0].Type.Compare(plain[0].Settings, json.RawMessage(`"S-a"`), json.RawMessage(`"s-A"`)); equal {
		t.Error("without the section a stamp compares by its code")
	}
}

func TestSectionTypeWithoutMergeMergesAsAWholeValue(t *testing.T) {
	code := stampCode()
	stamp := code["stamp"]
	stamp.Merge = nil
	code["stamp"] = stamp
	section, err := NewCatalogue([]byte(strings.Replace(stampSection, "%s", DefaultCatalogue().Version, 1)), code)
	if err != nil {
		t.Fatal(err)
	}
	c, err := DefaultCatalogue().With(section)
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := DecodeSpec([]byte(stampSpec))
	fields, err := c.SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		t.Fatal(err)
	}
	if _, merger := fields[0].Type.(interface {
		Merge(settings, base, ours, theirs json.RawMessage) (json.RawMessage, []string, error)
	}); merger {
		t.Error("a type without Merge is a Merger, so versionkit would not merge it as a whole value")
	}
}

func TestNewCatalogueRefusesCodeThatDoesNotMatch(t *testing.T) {
	section := func(id string, hasText bool) []byte {
		return []byte(`{"version":"0.18.0","types":[{"id":"` + id + `","since":"0.18.0","settings_schema":{},"positions":["root"],"consumers":[],"pins":[],"has_text":` + map[bool]string{true: "true", false: "false"}[hasText] + `}]}`)
	}
	text := func(Field, map[string]any, any, TypeEnv) string { return "" }
	cases := map[string]struct {
		data []byte
		code map[string]TypeCode
		want string
	}{
		"a type without code":       {section("x", false), map[string]TypeCode{}, "has no code"},
		"code for no listed type":   {section("x", false), map[string]TypeCode{"x": {}, "y": {}}, `code for "y"`},
		"a built-in type":           {section("text", true), map[string]TypeCode{"text": {Text: text}}, "built-in"},
		"has_text without Text":     {section("x", true), map[string]TypeCode{"x": {}}, "has_text is true"},
		"Text without has_text":     {section("x", false), map[string]TypeCode{"x": {Text: text}}, "has_text is false"},
		"Merge without Compare":     {section("x", false), map[string]TypeCode{"x": {Merge: func(Field, any, any, any, TypeEnv) (any, []string, error) { return nil, nil, nil }}}, "does not compare finer"},
		"a malformed section":       {[]byte(`{"version":"0.18.0","types":[],"extra":1}`), nil, "unknown field"},
		"a type without its schema": {[]byte(`{"version":"0.18.0","types":[{"id":"x","since":"0.18.0","positions":[],"consumers":[],"pins":[],"has_text":false}]}`), map[string]TypeCode{"x": {}}, "no settings_schema"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := NewCatalogue(c.data, c.code)
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Errorf("got %v, want an error mentioning %q", err, c.want)
			}
		})
	}
}

func TestWithRefusesSectionsThatDisagree(t *testing.T) {
	if _, err := DefaultCatalogue().With(newStampSection(t, "0.0.1")); err == nil || !strings.Contains(err.Error(), "cannot hold a section of 0.0.1") {
		t.Errorf("another version: %v", err)
	}
	stamp := newStampSection(t, DefaultCatalogue().Version)
	if _, err := DefaultCatalogue().With(stamp, stamp); err == nil || !strings.Contains(err.Error(), "listed twice") {
		t.Errorf("a type twice: %v", err)
	}
	c := withStamp(t)
	if len(c.Types) != len(DefaultCatalogue().Types)+1 {
		t.Errorf("With holds %d types", len(c.Types))
	}
	for i := 1; i < len(c.Types); i++ {
		if c.Types[i-1].ID >= c.Types[i].ID {
			t.Fatalf("types are not sorted by id: %q before %q", c.Types[i-1].ID, c.Types[i].ID)
		}
	}
}

// codes are errors as path → code.
func codes(errs []Error) map[string]string {
	out := map[string]string{}
	for _, e := range errs {
		out[e.Path] = e.Code
	}
	return out
}
