package fieldkit

import (
	"encoding/json"
	"strings"
	"testing"
)

const validField = `{"field_type":"text","config":{"name":"Title","api_accessor":"title","required":false,"instructions":""},"system":false}`

func TestDecodeSpecRefusesWhatItDoesNotModel(t *testing.T) {
	cases := map[string]struct {
		spec string
		want string
	}{
		"unknown Field property": {
			spec: `[{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":""},"system":false,"label":"x"}]`,
			want: `unknown field "label"`,
		},
		"unknown config property": {
			spec: `[{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":"","placeholder":"x"},"system":false}]`,
			want: `unknown field "placeholder"`,
		},
		"unknown validation property": {
			spec: `[{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":""},"validation":{"min":1},"system":false}]`,
			want: `unknown field "min"`,
		},
		"unknown property in a child": {
			spec: `[{"field_type":"group","config":{"name":"G","api_accessor":"g","required":false,"instructions":""},"children":[{"field_type":"text","config":{"name":"T","api_accessor":"t","required":false,"instructions":"","condition":{"field":"g","operator":"eq","value":1,"negate":true}},"system":false}],"system":false}]`,
			want: `unknown field "negate"`,
		},
		"data after the Spec": {
			spec: `[` + validField + `] []`,
			want: "after the JSON value",
		},
		"not a list": {
			spec: validField,
			want: "cannot unmarshal object",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := DecodeSpec([]byte(c.spec))
			if err == nil {
				t.Fatal("DecodeSpec accepted it")
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not mention %q", err, c.want)
			}
		})
	}
}

func TestDecodeSpecKeepsEveryModelledProperty(t *testing.T) {
	in := `[{"field_type":"group","config":{"name":"G","api_accessor":"g","required":true,"instructions":"Fill","default_value":[{"a":1}],"unique":false,"localizable":true,"hidden":false,"read_only":true,"condition":{"field":"x","operator":"in","value":["a"]},"locked_settings":[{"key":"max_items","reason":"12 contents"}]},"validation":{"min_length":1,"max_length":5,"pattern":"^a","pattern_message":"A"},"settings":{"max_items":3},"children":[` + validField + `],"system":true}]`
	spec, err := DecodeSpec([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(spec)
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	_ = json.Unmarshal([]byte(in), &a)
	_ = json.Unmarshal(out, &b)
	if !jsonEqual(a, b) {
		t.Errorf("round trip lost something\n in: %s\nout: %s", in, out)
	}
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

func TestValidateSettings(t *testing.T) {
	t.Run("an unknown type", func(t *testing.T) {
		errs := ValidateSettings("editor_schema", json.RawMessage(`{}`))
		if len(errs) != 1 || errs[0].Code != CodeUnknownFieldType || errs[0].Path != "" {
			t.Errorf("got %v", errs)
		}
	})
	t.Run("paths are relative to the settings", func(t *testing.T) {
		errs := ValidateSettings("text", json.RawMessage(`{"placeholder":1,"x":true}`))
		want := map[string]string{"/placeholder": CodeInvalidSetting, "/x": CodeUnknownSetting}
		if len(errs) != len(want) {
			t.Fatalf("got %v", errs)
		}
		for _, e := range errs {
			if want[e.Path] != e.Code {
				t.Errorf("unexpected %v", e)
			}
		}
	})
	t.Run("absent and malformed settings", func(t *testing.T) {
		if errs := ValidateSettings("number", nil); errs != nil {
			t.Errorf("absent settings: %v", errs)
		}
		errs := ValidateSettings("number", json.RawMessage(`{`))
		if len(errs) != 1 || errs[0].Code != CodeInvalidSetting || errs[0].Path != "" {
			t.Errorf("malformed settings: %v", errs)
		}
	})
}
