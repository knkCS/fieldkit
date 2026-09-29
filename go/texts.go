package fieldkit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode/utf16"
)

// The search weights config.search takes (contenthub ADR 0019): SearchOff
// excludes a Field's text, and A (heaviest) to D weigh it. An Unset search
// is SearchD on a type that has text.
const (
	SearchOff = "off"
	SearchA   = "A"
	SearchB   = "B"
	SearchC   = "C"
	SearchD   = "D"
)

// FieldText is the plain text one Field's value yields, and how it weighs in
// Delivery Search.
type FieldText struct {
	// Path is the value's, /-separated from the data's root with each row as
	// its _id (ADR-0023): "/title", "/authors/a1/bio".
	Path string `json:"path"`
	// Weight is the Field's config.search, SearchD when Unset. Never
	// SearchOff: such a Field yields no FieldText.
	Weight string `json:"weight"`
	// Text is the plain text, never "".
	Text string `json:"text"`
}

// textRule is the plain text a type's value yields, already canonical and
// not Unset; "" for none. A value not of the type's shape yields none. parts
// are the Resolved Spec's (nil without one), for a type whose text reads a
// part: rich_text's custom symbols come from its Text Type's Symbol Set.
type textRule func(f Field, settings map[string]any, value any, parts map[string]map[string]json.RawMessage) string

// textRules are the types that have text — exactly the types the Catalogue
// marks has_text, which a test holds them to. A type missing here yields no
// text, whatever its search says. The choice types (select, radio,
// checkboxes) hold option keys and yield none.
var textRules = map[string]textRule{ //nolint:gochecknoglobals
	"text":     stringText,
	"textarea": stringText,
	"email":    stringText,
	"url":      stringText,
	"slug":     stringText,
	"code":     stringText,
	"markdown": stringText,
	"list":     listText,
	"array":    arrayText,
	// knkeditor's reading text (#216).
	"rich_text": richTextText,
}

// stringText is a string value itself.
func stringText(_ Field, _ map[string]any, value any, _ map[string]map[string]json.RawMessage) string {
	s, _ := value.(string)
	return s
}

// listText is a List's Entries, one per line; a blank Entry adds no line.
func listText(_ Field, _ map[string]any, value any, _ map[string]map[string]json.RawMessage) string {
	items, _ := value.([]any)
	lines := make([]string, 0, len(items))
	for _, item := range items {
		if s, ok := item.(string); ok && s != "" {
			lines = append(lines, s)
		}
	}
	return strings.Join(lines, "\n")
}

// arrayText is an Array's keys and values, each non-blank one a line: pair
// by pair in a list, and in a keyed Array key by key, the keys sorted by
// UTF-16 code units as JS sorts strings (an object's keys have no order a
// JSON reader keeps).
func arrayText(_ Field, settings map[string]any, value any, _ map[string]map[string]json.RawMessage) string {
	var lines []string
	add := func(v any) {
		if s, ok := v.(string); ok && s != "" {
			lines = append(lines, s)
		}
	}
	if mode, _ := settings["mode"].(string); mode == "keyed" {
		entries, _ := value.(map[string]any)
		keys := make([]string, 0, len(entries))
		for key := range entries {
			keys = append(keys, key)
		}
		slices.SortFunc(keys, compareUTF16)
		for _, key := range keys {
			add(key)
			add(entries[key])
		}
	} else {
		pairs, _ := value.([]any)
		for _, pair := range pairs {
			obj, _ := pair.(map[string]any)
			add(obj["key"])
			add(obj["value"])
		}
	}
	return strings.Join(lines, "\n")
}

// compareUTF16 orders strings as JS's default sort does: by UTF-16 code
// units, where Go's < compares UTF-8 bytes (the two differ past U+FFFF).
func compareUTF16(a, b string) int {
	return slices.Compare(utf16.Encode([]rune(a)), utf16.Encode([]rune(b)))
}

// ValueText is the plain text one Field's stored value yields — Text in
// contenthub ADR 0010 — "" for a type without text, an Unset value, or a
// value not of the type's shape. f is the resolved Field; value is its
// value, not the whole Content's data. A container yields none of its own:
// Texts reads its children. It has no Resolved Spec, so a rich_text Field's
// custom symbols read as nothing: Texts reads them through its Text Type.
func ValueText(f Field, value json.RawMessage) string {
	return DefaultCatalogue().ValueText(f, value)
}

// ValueText is the package-level ValueText against this Catalogue, whose
// sections' types yield their text too.
func (c *Catalogue) ValueText(f Field, value json.RawMessage) string {
	rule, ok := c.textRule(f.FieldType)
	if !ok || len(bytes.TrimSpace(value)) == 0 {
		return ""
	}
	dec := json.NewDecoder(bytes.NewReader(value))
	dec.UseNumber()
	var decoded any
	if err := dec.Decode(&decoded); err != nil || dec.More() {
		return ""
	}
	decoded = c.canonicalFieldValue([]Field{f}, f.Config.APIAccessor, toFloats(decoded), nil)
	if isUnset(decoded) {
		return ""
	}
	settings, _ := canonicalSettings(f.Settings)
	settingsObj, _ := settings.(map[string]any)
	if settingsObj == nil {
		settingsObj = map[string]any{}
	}
	return rule(f, settingsObj, decoded, nil)
}

// Texts are the plain texts a Content's data yields for Delivery Search,
// against the Resolved Spec it was validated with (contenthub ADR 0019): one
// per Field with text, through every container at every depth — a group's
// and a virtual_table's rows, a Block's Fields, a resolved fieldset's record
// — in Spec order, then row order.
//
// Each Field weighs by its own config.search, inside a row as at the root: a
// Field whose search is SearchOff yields nothing, and an Unset one weighs
// SearchD. A Field whose value yields no text yields nothing.
//
// opts are ValidateValue's: WithTargetBlueprints says which Reference Spec a
// Reference's values follow, and without it the values of a Reference Field
// that links one yield none.
//
// It reads data ValidateValue accepted, and checks nothing; markers and
// hidden Fields yield none, as ValidateValue skips them. Data that is not a
// JSON object is an error; empty data is {}.
func Texts(resolved *ResolvedSpec, data json.RawMessage, opts ...ValueOption) ([]FieldText, error) {
	return DefaultCatalogue().Texts(resolved, data, opts...)
}

// Texts is the package-level Texts against this Catalogue, whose sections'
// types yield their text too.
func (c *Catalogue) Texts(resolved *ResolvedSpec, data json.RawMessage, opts ...ValueOption) ([]FieldText, error) {
	texts := []FieldText{}
	err := c.walkData(resolved, data, opts, func(f Field, settings map[string]any, value any, path string) {
		rule, ok := c.textRule(f.FieldType)
		if !ok {
			return
		}
		weight := f.Config.Search
		switch weight {
		case SearchOff:
			return
		case "":
			weight = SearchD
		}
		if text := rule(f, settings, value, resolved.Parts); text != "" {
			texts = append(texts, FieldText{Path: path, Weight: weight, Text: text})
		}
	})
	if err != nil {
		return nil, fmt.Errorf("fieldkit: texts: %w", err)
	}
	return texts, nil
}
