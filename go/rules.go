package fieldkit

import (
	"bytes"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// typeRules is the hand-written half of a Field Type's Spec validation: the
// rules its settings schema cannot state (ADR-0018). The schema is data, read
// from the Catalogue; these are code, one entry per type that needs any, and
// most types need none. Every member is optional.
//
// Each rule reads what it is given leniently, the way TS reads the same
// settings: a value of the wrong shape is the schema's to report, so a rule
// finds nothing in it rather than failing twice.
type typeRules struct {
	// settings reports rules across the Field's own settings. It receives the
	// canonical settings (canonicalSettings) whatever the schema reported,
	// and its paths are relative to the settings, as ValidateSettings'
	// are. ValidateSettings runs it, so ValidateSpec does too.
	settings func(settings any) []Error
	// field reports rules across the Field's settings and the Fields it
	// holds. Its paths are relative to the Field ("" is the Field itself).
	// ValidateSpec runs it whether or not the Catalogue lists the type, as TS
	// runs the same rules by field_type. settings is nil when the Field's
	// settings are not JSON. resolved is whether the Spec is a Resolved Spec
	// (ValidateResolvedSpec), whose children may be a resolved Pin's.
	field func(c *Catalogue, f Field, settings any, resolved bool) []Error
	// specs returns the Specs the Field holds in its settings rather than in
	// children, so ValidateSpec walks them as it walks children. A setting
	// that should hold a Spec but does not decode as one is an error at that
	// setting, and is not walked. Paths are relative to the Field.
	specs func(settings json.RawMessage) ([]heldSpec, []Error)
	// childrenPosition is the Position of the Fields in the type's children,
	// when it is not the Field's own: a Virtual Table's children are its Row
	// Spec. "" means the container is transparent, and its children sit
	// where it does.
	childrenPosition string
}

// heldSpec is one Spec a Field holds in its settings, and where.
type heldSpec struct {
	// path is the list's path relative to the Field:
	// "/settings/allowed_blocks/0/fields". A Field in it is at path plus its
	// Accessor.
	path string
	// at is the list's segments inside the Field's settings:
	// {"allowed_blocks", "0", "fields"}. Resolve writes a resolved list back
	// there.
	at     []string
	fields []Field
	// position is the Position its Fields sit in.
	position string
}

// typeRulesByID are the rules of every built-in type that has any. A
// Catalogue section's types bring theirs as TypeCode, and
// (*Catalogue).rulesFor reads both (extension.go).
var typeRulesByID = map[string]typeRules{ //nolint:gochecknoglobals
	"virtual_table":    {field: virtualTableRowSpec, childrenPosition: PositionRow},
	"blocks":           {settings: duplicateBlockTypes, specs: blockTypeSpecs},
	"reference":        referenceRules,
	"single_reference": referenceRules,
}

// linkedBlueprint is the Blueprint a Field links, or "" for none: the setting
// the Catalogue records as the type's Blueprint Pin, when it holds a string
// that is not blank. It is TS's linkedBlueprintId, reading the key from the
// Catalogue rather than naming it.
func (c *Catalogue) linkedBlueprint(fieldType string, settings any) string {
	t, ok := c.Type(fieldType)
	if !ok {
		return ""
	}
	for _, pin := range t.Pins {
		// A link is one top-level setting; a Pin in a settings list (a
		// Reference Field's linked Reference Specs) links no Row Spec.
		if pin.Kind == pinKindBlueprint && !strings.Contains(pin.Key, "/") {
			return pinRelease(settings, pin.Key)
		}
	}
	return ""
}

// pinRelease is the Release a Pin setting names, or "" for none: a string
// that is not blank, read from canonical settings.
func pinRelease(settings any, key string) string {
	obj, _ := settings.(map[string]any)
	return releaseIn(obj[key])
}

// releaseIn is a setting's value as a Release id: a string that is not blank,
// trimmed; "" otherwise.
func releaseIn(value any) string {
	if id, ok := value.(string); ok {
		return trimJS(id)
	}
	return ""
}

// pinnedRelease is one Pin a Field's settings hold: the setting's segments
// inside the settings, and the Release it names.
type pinnedRelease struct {
	at      []string
	release string
}

// pinReleases are the Releases a Catalogue Pin key names in canonical
// settings. A key is a /-separated settings path in which * stands for every
// item of a list: "blueprint" is one setting, "blueprints/*/spec_blueprint"
// one per blueprints entry. TS's pinnedReleases reads the same grammar.
func pinReleases(settings any, key string) []pinnedRelease {
	var found []pinnedRelease
	var walk func(node any, rest, at []string)
	walk = func(node any, rest, at []string) {
		if len(rest) == 0 {
			if release := releaseIn(node); release != "" {
				found = append(found, pinnedRelease{at: at, release: release})
			}
			return
		}
		if rest[0] == "*" {
			items, _ := node.([]any)
			for i, item := range items {
				walk(item, rest[1:], append(slices.Clone(at), strconv.Itoa(i)))
			}
			return
		}
		obj, ok := node.(map[string]any)
		if !ok {
			return
		}
		walk(obj[rest[0]], rest[1:], append(slices.Clone(at), rest[0]))
	}
	walk(settings, strings.Split(key, "/"), nil)
	return found
}

// pinKindBlueprint is the kind of a Pin naming a Blueprint's Release.
const pinKindBlueprint = "blueprint"

// virtualTableRowSpec is ADR-0017: a Virtual Table declares its Row Spec
// exactly one way — linked, by a Blueprint Pin in its settings, or embedded,
// in its children. What a Row Spec may hold is the "row" Position, which the
// Position check enforces for every container alike (ADR-0022).
//
// In a Resolved Spec a linked Row Spec is in children as well, so a Field
// that links and has children is resolved, not ambiguous: only the authored
// Spec can tell the two apart, and ValidateSpec checks it there. Missing is
// reported in both.
func virtualTableRowSpec(c *Catalogue, f Field, settings any, resolved bool) []Error {
	var errs []Error
	linked := c.linkedBlueprint(f.FieldType, settings) != ""
	embedded := len(f.Children) > 0
	switch {
	case linked && embedded && !resolved:
		errs = append(errs, Error{Path: "", Code: CodeVirtualTableRowSpecAmbiguous})
	case !linked && !embedded:
		errs = append(errs, Error{Path: "", Code: CodeVirtualTableRowSpecMissing})
	}
	return errs
}

// duplicateBlockTypes reports each Block Type repeating the type an earlier
// one declared, at its type. A Block's _type names its Block Type, so two
// sharing one would make a stored Block ambiguous.
func duplicateBlockTypes(settings any) []Error {
	obj, _ := settings.(map[string]any)
	blockTypes, _ := obj["allowed_blocks"].([]any)
	var errs []Error
	seen := map[string]bool{}
	for i, blockType := range blockTypes {
		entry, _ := blockType.(map[string]any)
		typ, ok := entry["type"].(string)
		if !ok || typ == "" {
			continue
		}
		if seen[typ] {
			errs = append(errs, Error{
				Path: joinPath("", "allowed_blocks", strconv.Itoa(i), "type"),
				Code: CodeDuplicateBlockType,
			})
			continue
		}
		seen[typ] = true
	}
	return errs
}

// blockTypeSpecs returns the Fields of each Block Type of a Blocks Field,
// which live in its settings (allowed_blocks[].fields), not in children
// (ADR-0007). Fields that are Unset hold no Spec. A fields list whose items do
// not decode as Fields — strictly, as DecodeSpec decodes — is one
// CodeInvalidSetting at that list.
func blockTypeSpecs(raw json.RawMessage) ([]heldSpec, []Error) {
	var settings map[string]json.RawMessage
	if json.Unmarshal(raw, &settings) != nil {
		return nil, nil
	}
	var blockTypes []json.RawMessage
	if json.Unmarshal(settings["allowed_blocks"], &blockTypes) != nil {
		return nil, nil
	}
	var held []heldSpec
	var errs []Error
	for i, blockType := range blockTypes {
		var entry map[string]json.RawMessage
		if json.Unmarshal(blockType, &entry) != nil {
			continue
		}
		var items []json.RawMessage
		if json.Unmarshal(entry["fields"], &items) != nil || len(items) == 0 {
			continue
		}
		path := joinPath("", "settings", "allowed_blocks", strconv.Itoa(i), "fields")
		fields, ok := decodeFieldList(items)
		if !ok {
			errs = append(errs, Error{Path: path, Code: CodeInvalidSetting})
			continue
		}
		held = append(held, heldSpec{
			path:     path,
			at:       []string{"allowed_blocks", strconv.Itoa(i), "fields"},
			fields:   fields,
			position: PositionBlockType,
		})
	}
	return held, errs
}

// decodeFieldList decodes each item as a Field, strictly. An item must be an
// object with a config object — the least TS needs to walk it — so the two
// refuse the same lists wherever TS can tell.
func decodeFieldList(items []json.RawMessage) ([]Field, bool) {
	fields := make([]Field, 0, len(items))
	for _, item := range items {
		var obj map[string]json.RawMessage
		if json.Unmarshal(item, &obj) != nil || obj == nil {
			return nil, false
		}
		if config := bytes.TrimSpace(obj["config"]); len(config) == 0 || config[0] != '{' {
			return nil, false
		}
		var f Field
		if decodeStrict(item, &f) != nil {
			return nil, false
		}
		fields = append(fields, f)
	}
	return fields, true
}

// trimJS trims what JS's String.prototype.trim trims — which is not quite
// what strings.TrimSpace does: JS trims U+FEFF and keeps U+0085.
func trimJS(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		switch r {
		case '\t', '\n', '\v', '\f', '\r', '\u2028', '\u2029', '\ufeff':
			return true
		}
		return unicode.Is(unicode.Zs, r)
	})
}
