package fieldkit

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// nestSection is a Catalogue section of one container type, "nest", whose
// code uses the spec-side container hooks: its children are a Row Spec
// (ChildrenPosition), it holds a second Spec in settings.inner (HeldSpecs),
// and its value is one record its children describe, checked through the
// composer TypeEnv hands it (ValidateFields).
const nestSection = `{"version":"%s","types":[{"id":"nest","since":"0.18.0","settings_schema":{"type":"object","properties":{"blueprint":{"type":"string"},"inner":{"type":"array"}},"additionalProperties":false},"positions":["root"],"consumers":["blueprint"],"pins":[{"key":"blueprint","kind":"blueprint"}],"has_text":false}]}`

func nestCode() map[string]TypeCode {
	return map[string]TypeCode{"nest": {
		ChildrenPosition: PositionRow,
		HeldSpecs: func(raw json.RawMessage) ([]HeldSpec, []Error) {
			var settings map[string]json.RawMessage
			if json.Unmarshal(raw, &settings) != nil || settings["inner"] == nil {
				return nil, nil
			}
			var fields []Field
			if json.Unmarshal(settings["inner"], &fields) != nil {
				return nil, []Error{{Path: "/settings/inner", Code: CodeInvalidSetting}}
			}
			return []HeldSpec{{Path: "/settings/inner", At: []string{"inner"}, Fields: fields, Position: PositionReferenceSpec}}, nil
		},
		Value: func(f Field, _ map[string]any, value any, env TypeEnv) []Error {
			record, ok := value.(map[string]any)
			if !ok {
				return []Error{{Path: "", Code: CodeInvalidType}}
			}
			return env.ValidateFields(f.Children, record)
		},
	}}
}

func withNest(t *testing.T) *Catalogue {
	t.Helper()
	section, err := NewCatalogue([]byte(strings.Replace(nestSection, "%s", DefaultCatalogue().Version, 1)), nestCode())
	if err != nil {
		t.Fatal(err)
	}
	c, err := DefaultCatalogue().With(section)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// fieldJSON is one Field of a type, as a Spec stores it.
func fieldJSON(fieldType, accessor string, required bool) string {
	r := "false"
	if required {
		r = "true"
	}
	return `{"field_type":"` + fieldType + `","config":{"name":"X","api_accessor":"` + accessor + `","required":` + r + `,"instructions":""},"system":false}`
}

func TestSectionContainerChildrenSitInItsChildrenPosition(t *testing.T) {
	c := withNest(t)
	// A group may not sit in a Row Spec; a text may.
	spec, err := DecodeSpec([]byte(`[{"field_type":"nest","config":{"name":"N","api_accessor":"n","required":false,"instructions":""},"children":[` +
		fieldJSON("text", "title", false) + `,` + fieldJSON("group", "g", false) + `],"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"/n/children/g": CodePosition}
	if got := codes(c.ValidateSpec(spec)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSpec = %v, want %v", got, want)
	}
}

func TestSectionContainerHeldSpecsAreWalked(t *testing.T) {
	c := withNest(t)
	spec, err := DecodeSpec([]byte(`[{"field_type":"nest","config":{"name":"N","api_accessor":"n","required":false,"instructions":""},"settings":{"inner":[` +
		fieldJSON("text", "title", false) + `,` + fieldJSON("section", "tab", false) + `,` +
		`{"field_type":"fieldset","config":{"name":"F","api_accessor":"f","required":false,"instructions":""},"settings":{"blueprint":"bp@1"},"system":false}` +
		`]},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	// Held in the reference_spec Position: no Marker, no container.
	want := map[string]string{"/n/settings/inner/tab": CodePosition, "/n/settings/inner/f": CodePosition}
	if got := codes(c.ValidateSpec(spec)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSpec = %v, want %v", got, want)
	}
	// Pins walks the held Spec, and Resolve resolves it — the section type's
	// own Blueprint Pin too, inlined as its children.
	pins := c.Pins(spec)
	if len(pins) != 1 || pins[0].Path != "/n/settings/inner/f/settings/blueprint" {
		t.Errorf("Pins = %+v", pins)
	}
	resolved, err := c.Resolve(context.Background(), spec, FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		return json.RawMessage(`[` + fieldJSON("text", "street", false) + `]`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string][]Field
	if err := json.Unmarshal(resolved.Fields[0].Settings, &settings); err != nil {
		t.Fatal(err)
	}
	if got := settings["inner"][2].Children; len(got) != 1 || got[0].Config.APIAccessor != "street" {
		t.Errorf("the held Fieldset was not resolved: %+v", settings["inner"][2])
	}
	// Unreadable held settings are the hook's to report.
	bad, err := DecodeSpec([]byte(`[{"field_type":"nest","config":{"name":"N","api_accessor":"n","required":false,"instructions":""},"settings":{"inner":[1]},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	if got := codes(c.ValidateSpec(bad)); got["/n/settings/inner"] != CodeInvalidSetting {
		t.Errorf("ValidateSpec = %v", got)
	}
}

func TestSectionContainerPinIsInlinedAsChildren(t *testing.T) {
	c := withNest(t)
	spec, err := DecodeSpec([]byte(`[{"field_type":"nest","config":{"name":"N","api_accessor":"n","required":false,"instructions":""},"settings":{"blueprint":"rows@1"},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := c.Resolve(context.Background(), spec, FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		if kind != "blueprint" || release != "rows@1" {
			t.Errorf("fetched %s %s", kind, release)
		}
		return json.RawMessage(`[` + fieldJSON("text", "title", true) + `,` + fieldJSON("group", "g", false) + `]`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	if got := resolved.Fields[0].Children; len(got) != 2 {
		t.Fatalf("children = %+v", got)
	}
	// The inlined Fields sit in the type's ChildrenPosition.
	want := map[string]string{"/n/children/g": CodePosition}
	if got := codes(c.ValidateResolvedSpec(resolved)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateResolvedSpec = %v, want %v", got, want)
	}
}

func TestSectionContainerValueComposesItsChildren(t *testing.T) {
	c := withNest(t)
	spec, err := DecodeSpec([]byte(`[{"field_type":"nest","config":{"name":"N","api_accessor":"n","required":false,"instructions":""},"children":[` +
		fieldJSON("text", "title", true) + `,` + fieldJSON("number", "count", false) + `],"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]struct {
		data string
		want map[string]string
	}{
		"valid":            {`{"n":{"title":"a","count":2}}`, map[string]string{}},
		"a child's type":   {`{"n":{"title":"a","count":"two"}}`, map[string]string{"/n/count": CodeInvalidType}},
		"a child required": {`{"n":{"count":2}}`, map[string]string{"/n/title": CodeRequired}},
		"not a record":     {`{"n":[1]}`, map[string]string{"/n": CodeInvalidType}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := codes(c.ValidateValue(spec, json.RawMessage(tc.data))); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ValidateValue = %v, want %v", got, tc.want)
			}
		})
	}
}
