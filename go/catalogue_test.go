package fieldkit

import (
	"strings"
	"testing"
)

func TestDefaultCatalogue(t *testing.T) {
	c := DefaultCatalogue()
	if c.Version == "" {
		t.Error("the Catalogue has no version")
	}
	for _, id := range []string{"text", "number", "group"} {
		typ, ok := c.Type(id)
		if !ok {
			t.Errorf("the Catalogue does not list %q", id)
			continue
		}
		if typ.Since == "" || len(typ.Positions) == 0 || typ.SettingsSchema == nil {
			t.Errorf("%q is incomplete: %+v", id, typ)
		}
	}
	if text, _ := c.Type("text"); text == nil || !text.HasText {
		t.Error("text should have text")
	}
	if _, ok := c.Type("editor_schema"); ok {
		t.Error("the Catalogue lists a type core dropped")
	}
}

func TestCatalogueRecordsPins(t *testing.T) {
	c := DefaultCatalogue()
	want := map[string][]CataloguePin{
		// A Fieldset's Blueprint and a linked Row Spec's Blueprint (ADR-0020).
		"fieldset":      {{Key: "blueprint", Kind: pinKindBlueprint}},
		"virtual_table": {{Key: "blueprint", Kind: pinKindBlueprint}},
		// A Block Type's Fields may pin, but in Fields of their own.
		"blocks": {},
		"group":  {},
	}
	for id, pins := range want {
		typ, ok := c.Type(id)
		if !ok {
			t.Errorf("the Catalogue does not list %q", id)
			continue
		}
		if len(typ.Pins) != len(pins) {
			t.Errorf("%q pins %v, want %v", id, typ.Pins, pins)
			continue
		}
		for i := range pins {
			if typ.Pins[i] != pins[i] {
				t.Errorf("%q pins %v, want %v", id, typ.Pins, pins)
			}
		}
	}
}

func TestParseCatalogueIsStrict(t *testing.T) {
	cases := map[string]struct {
		json string
		want string
	}{
		"a property the model lacks": {
			json: `{"version":"1.0.0","types":[],"vocabulary":"x"}`,
			want: `unknown field "vocabulary"`,
		},
		"a JSON Schema keyword the validator does not implement": {
			json: `{"version":"1.0.0","types":[{"id":"t","since":"1.0.0","settings_schema":{"type":"string","pattern":"^a"},"positions":["root"],"consumers":[],"pins":[],"has_text":false}]}`,
			want: `unknown field "pattern"`,
		},
		"a type listed twice": {
			json: `{"version":"1.0.0","types":[{"id":"t","since":"1.0.0","settings_schema":{},"positions":[],"consumers":[],"pins":[],"has_text":false},{"id":"t","since":"1.0.0","settings_schema":{},"positions":[],"consumers":[],"pins":[],"has_text":false}]}`,
			want: "listed twice",
		},
		"a type without a settings schema": {
			json: `{"version":"1.0.0","types":[{"id":"t","since":"1.0.0","positions":[],"consumers":[],"pins":[],"has_text":false}]}`,
			want: "no settings_schema",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := ParseCatalogue([]byte(c.json))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Errorf("got %v, want an error mentioning %q", err, c.want)
			}
		})
	}
}

func TestCatalogueValidatesAgainstItsOwnTypes(t *testing.T) {
	c, err := ParseCatalogue([]byte(`{"version":"9.9.9","types":[{"id":"flag","since":"9.9.9","settings_schema":{"type":"object","properties":{"mode":{"enum":["a","b"]},"tags":{"type":"array","items":{"type":"string","minLength":2}},"label":{"type":"string","maxLength":2}},"required":["mode"],"additionalProperties":{"type":"boolean"}},"positions":["root"],"consumers":[],"pins":[],"has_text":false}]}`))
	if err != nil {
		t.Fatal(err)
	}
	spec, err := DecodeSpec([]byte(`[{"field_type":"flag","config":{"name":"F","api_accessor":"f","required":false,"instructions":""},"settings":{"mode":"c","tags":["ok","x"],"label":"😀","extra":1,"fine":true},"system":false},{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":""},"system":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, e := range c.ValidateSpec(spec) {
		got[e.Path] = e.Code
	}
	want := map[string]string{
		"/f/settings/mode":   CodeInvalidSetting,
		"/f/settings/tags/1": CodeInvalidSetting,
		"/f/settings/extra":  CodeInvalidSetting,
		"/t":                 CodeUnknownFieldType,
	}
	// "😀" is two UTF-16 code units, as JS counts it: within maxLength 2.
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for path, code := range want {
		if got[path] != code {
			t.Errorf("%s: got %q, want %q", path, got[path], code)
		}
	}
}
