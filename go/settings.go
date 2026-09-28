package fieldkit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"slices"
	"unicode/utf16"
)

// Schema is the subset of JSON Schema a settings schema in the Catalogue may
// use — exactly the keywords scripts/catalogue.ts lets through, which refuses
// to generate anything else. Decoding a Catalogue with another keyword fails,
// so a keyword can never be silently ignored here.
type Schema struct {
	Type                 schemaTypes        `json:"type,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	AdditionalProperties *additional        `json:"additionalProperties,omitempty"`
	Required             []string           `json:"required,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	Enum                 []json.RawMessage  `json:"enum,omitempty"`
	Minimum              *float64           `json:"minimum,omitempty"`
	Maximum              *float64           `json:"maximum,omitempty"`
	ExclusiveMinimum     *float64           `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum     *float64           `json:"exclusiveMaximum,omitempty"`
	MinLength            *int               `json:"minLength,omitempty"`
	MaxLength            *int               `json:"maxLength,omitempty"`
}

// schemaTypes is JSON Schema's "type": one name, or a list of them.
type schemaTypes []string

func (t *schemaTypes) UnmarshalJSON(data []byte) error {
	var one string
	if err := json.Unmarshal(data, &one); err == nil {
		*t = schemaTypes{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(data, &many); err != nil {
		return fmt.Errorf("type: want a string or a list of strings: %w", err)
	}
	*t = many
	return nil
}

func (t schemaTypes) MarshalJSON() ([]byte, error) {
	if len(t) == 1 {
		return json.Marshal(t[0])
	}
	return json.Marshal([]string(t))
}

// additional is JSON Schema's "additionalProperties": true, false, or a
// schema every undeclared property must match.
type additional struct {
	Allowed bool
	Schema  *Schema
}

func (a *additional) UnmarshalJSON(data []byte) error {
	var allowed bool
	if err := json.Unmarshal(data, &allowed); err == nil {
		*a = additional{Allowed: allowed}
		return nil
	}
	var s Schema
	if err := decodeStrict(data, &s); err != nil {
		return fmt.Errorf("additionalProperties: %w", err)
	}
	*a = additional{Allowed: true, Schema: &s}
	return nil
}

func (a additional) MarshalJSON() ([]byte, error) {
	if a.Schema != nil {
		return json.Marshal(a.Schema)
	}
	return json.Marshal(a.Allowed)
}

// ValidateSettings checks one Field's settings against its type's settings
// schema in the embedded Catalogue, with the answers TS's validateSpec gives.
// Paths are relative to the settings ("" is the settings themselves).
//
// A setting whose value is Unset — absent, null, "", [] or {} — is treated as
// absent before it is checked, at every depth (ADR-0021), and Unset settings
// as a whole are {}. Each {path, code} is reported once.
//
// An unknown field type is one CodeUnknownFieldType at "". Settings that are
// not JSON are one CodeInvalidSetting at "".
func ValidateSettings(fieldType string, settings json.RawMessage) []Error {
	return DefaultCatalogue().ValidateSettings(fieldType, settings)
}

// ValidateSettings is the package-level ValidateSettings against this
// Catalogue.
func (c *Catalogue) ValidateSettings(fieldType string, settings json.RawMessage) []Error {
	t, ok := c.Type(fieldType)
	if !ok {
		return []Error{{Path: "", Code: CodeUnknownFieldType, Params: map[string]any{"field_type": fieldType}}}
	}
	var value any = map[string]any{}
	if len(bytes.TrimSpace(settings)) > 0 {
		if err := json.Unmarshal(settings, &value); err != nil {
			return []Error{{Path: "", Code: CodeInvalidSetting}}
		}
	}
	value = stripUnset(value)
	if isUnset(value) {
		value = map[string]any{}
	}
	v := &settingsValidator{}
	v.check(t.SettingsSchema, value, "")
	return v.errors
}

type settingsValidator struct {
	errors []Error
	seen   map[string]bool
}

func (v *settingsValidator) add(path, code string) {
	key := code + "\x00" + path
	if v.seen[key] {
		return
	}
	if v.seen == nil {
		v.seen = map[string]bool{}
	}
	v.seen[key] = true
	v.errors = append(v.errors, Error{Path: path, Code: code})
}

// check reports what is wrong with value at path. A value of the wrong type is
// one error, and nothing below it is checked.
func (v *settingsValidator) check(s *Schema, value any, path string) {
	if len(s.Type) > 0 && !slices.ContainsFunc(s.Type, func(t string) bool { return hasType(value, t) }) {
		v.add(path, CodeInvalidSetting)
		return
	}
	if len(s.Enum) > 0 && !inEnum(s.Enum, value) {
		v.add(path, CodeInvalidSetting)
	}
	switch x := value.(type) {
	case map[string]any:
		v.checkObject(s, x, path)
	case []any:
		if s.Items != nil {
			for i, item := range x {
				v.check(s.Items, item, joinPath(path, fmt.Sprint(i)))
			}
		}
	case float64:
		if (s.Minimum != nil && x < *s.Minimum) ||
			(s.Maximum != nil && x > *s.Maximum) ||
			(s.ExclusiveMinimum != nil && x <= *s.ExclusiveMinimum) ||
			(s.ExclusiveMaximum != nil && x >= *s.ExclusiveMaximum) {
			v.add(path, CodeInvalidSetting)
		}
	case string:
		// Lengths are counted as JS counts them, in UTF-16 code units, so a
		// string TS accepts is one Go accepts.
		n := len(utf16.Encode([]rune(x)))
		if (s.MinLength != nil && n < *s.MinLength) || (s.MaxLength != nil && n > *s.MaxLength) {
			v.add(path, CodeInvalidSetting)
		}
	}
}

func (v *settingsValidator) checkObject(s *Schema, obj map[string]any, path string) {
	for _, key := range s.Required {
		if _, ok := obj[key]; !ok {
			// Zod reports a missing required key at the key, not at the object.
			v.add(joinPath(path, key), CodeInvalidSetting)
		}
	}
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		at := joinPath(path, key)
		if prop, ok := s.Properties[key]; ok {
			v.check(prop, obj[key], at)
			continue
		}
		switch {
		case s.AdditionalProperties == nil || (s.AdditionalProperties.Allowed && s.AdditionalProperties.Schema == nil):
			// allowed, unchecked
		case s.AdditionalProperties.Schema != nil:
			v.check(s.AdditionalProperties.Schema, obj[key], at)
		default:
			v.add(at, CodeUnknownSetting)
		}
	}
}

func hasType(value any, t string) bool {
	switch t {
	case "object":
		_, ok := value.(map[string]any)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	case "string":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "null":
		return value == nil
	case "number":
		_, ok := value.(float64)
		return ok
	case "integer":
		// As JS's Number.isInteger, which Zod's int() is: 1.0 is an integer.
		f, ok := value.(float64)
		return ok && !math.IsInf(f, 0) && f == math.Trunc(f)
	}
	return false
}

func inEnum(enum []json.RawMessage, value any) bool {
	for _, raw := range enum {
		var member any
		if err := json.Unmarshal(raw, &member); err == nil && reflect.DeepEqual(member, value) {
			return true
		}
	}
	return false
}

// isUnset reports whether a decoded JSON value is Unset: absent (nil), null,
// "", [] or {} (ADR-0021). 0 and false are values.
func isUnset(value any) bool {
	switch x := value.(type) {
	case nil:
		return true
	case string:
		return x == ""
	case []any:
		return len(x) == 0
	case map[string]any:
		return len(x) == 0
	}
	return false
}

// stripUnset drops every object key whose value is Unset, at every depth,
// deepest first, so {"a": {"b": null}} loses "a" too. Array elements are kept,
// Unset or not: [null] holds one element, and is not [].
func stripUnset(value any) any {
	switch x := value.(type) {
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = stripUnset(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for key, child := range x {
			if canonical := stripUnset(child); !isUnset(canonical) {
				out[key] = canonical
			}
		}
		return out
	}
	return value
}
