package fieldkit

import (
	"bytes"
	"encoding/json"
	"slices"
)

// The caps every value obeys, whatever its type, so that no stored document
// can be pathological. TS's VALUE_CAPS holds the same numbers.
const (
	// MaxItems is the most items an array, or keys an object, may hold in a
	// value. More is CodeTooManyItems.
	MaxItems = 10_000
	// MaxStringBytes is the most UTF-8 bytes a string in a value may hold:
	// 1 MiB. More is CodeTooLarge.
	MaxStringBytes = 1 << 20
	// MaxDepth is the deepest an array or object may sit in a value: the
	// data's root is depth 0, its values depth 1. Deeper is CodeTooDeep.
	MaxDepth = 32
)

// markerTypes are the Field Types that hold no value: the layout Markers.
// TS's zod builder skips the same two.
var markerTypes = map[string]bool{"section": true, "card": true} //nolint:gochecknoglobals

// valueRule checks one Field's value, already canonical and not Unset,
// against its type's rules — exactly what the type's toZodType checks in TS.
// settings are the Field's canonical settings ({} when Unset). Paths are
// relative to the value ("" is the value itself).
type valueRule func(f Field, settings map[string]any, value any, errs *valueErrors)

// ValidateValue checks a Content's stored data against a Spec, with the
// answers TS's validateValue gives (ADR-0018): every value-producing Field's
// value is checked by exactly what its type's toZodType checks, no more and
// no fewer. Checks that span Contents — unique, whether a Reference's target
// or a Lookup's id exists — are the caller's.
//
// On top of the types' rules, ADR-0021:
//
//   - Unset — absent, null, "", [] or {} — is one state. A required Field
//     whose value is Unset is CodeRequired; an optional one is valid, and its
//     type is not checked. 0 and false are values.
//   - A key holding an Unset value, at any depth and whether or not the Spec
//     names it, is CodeNotCanonical: Unset is stored as absent. Array items
//     are kept whatever they hold, so [null] is one item, not Unset.
//   - MaxItems, MaxStringBytes and MaxDepth are enforced as
//     CodeTooManyItems, CodeTooLarge and CodeTooDeep, over the whole
//     document — keys the Spec does not name, and the number of keys at the
//     root, included. Data beyond a cap reports only the caps it breaks:
//     nothing else is checked.
//
// The containers dispatch what they hold to its own types (ADR-0007): a
// group's or virtual_table's rows and a resolved fieldset's record are
// checked against their children, a block against its Block Type's Fields,
// at every depth. Every row carries an _id (ADR-0023) — a row without one is
// CodeMissingID at the row, a repeat within its array CodeDuplicateID at the
// repeat.
//
// Paths are /-separated from the data's root: a Field is its Accessor, an
// object entry its key, and an array item its _id where it holds a
// well-formed one no earlier item holds, its index otherwise. Numbers are
// read as JS reads them (float64; beyond its range, ±Inf). Settings and
// validation are read in canonical form, so a "min": null is no minimum.
//
// Keys the Spec does not name are otherwise ignored, as the TS form's schema
// ignores them; hidden Fields and the Markers are not checked. Data that is
// not a JSON object is one CodeInvalidType at ""; empty data is {}.
//
// A rich_text value is checked by knkeditor (rich_text.go). Without a
// Resolved Spec there is no Text Type to narrow it by, so it is checked
// against knkeditor's vocabulary alone: ValidateResolvedValue checks it
// against the Text Type its Field pins.
//
// Not yet implemented, and skipped: the types the Catalogue does not list
// (reference, single_reference). TS validates them; the conformance fixtures
// stay clear of them until Go does.
func ValidateValue(spec Spec, data json.RawMessage) []Error {
	return validateValue(spec, data, &richTextContext{})
}

// ValidateResolvedValue is ValidateValue against a Resolved Spec (ADR-0020):
// its Fields, and — for each rich_text Field — the Text Type its text_type
// setting pins, from the Resolved Spec's parts. A Text Type the parts do not
// hold, or one knkeditor cannot use, is one CodeInvalidRichText at the Field.
// A nil Resolved Spec has no Fields.
func ValidateResolvedValue(resolved *ResolvedSpec, data json.RawMessage) []Error {
	if resolved == nil {
		return validateValue(nil, data, &richTextContext{strict: true})
	}
	return validateValue(resolved.Fields, data, &richTextContext{parts: resolved.Parts, strict: true})
}

func validateValue(spec Spec, data json.RawMessage, richText *richTextContext) []Error {
	var raw any = map[string]any{}
	if len(bytes.TrimSpace(data)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber()
		if err := dec.Decode(&raw); err != nil || dec.More() {
			return []Error{{Path: "", Code: CodeInvalidType}}
		}
		raw = toFloats(raw)
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return []Error{{Path: "", Code: CodeInvalidType}}
	}

	// The caps come first and cover the whole document, keys the Spec does
	// not name included: nothing else walks a document beyond them.
	errs := &valueErrors{ctx: &valueContext{data: bytes.TrimSpace(data), decoded: obj, richText: richText}}
	if capErrors(obj, "", errs) {
		return errs.list
	}
	reportNonCanonical(obj, "", errs)
	canonical, _ := stripUnset(obj).(map[string]any)

	validateFields(spec, canonical, "", errs)
	if len(errs.list) == 0 {
		return nil
	}
	return errs.list
}

// validateFields checks a record — the data's root, a row, a Fieldset's
// record — against the Fields that describe it, each by its own type's rule.
// It is the composer a container hands what it holds to (ADR-0007). path is
// the record's own.
func validateFields(fields []Field, record map[string]any, path string, errs *valueErrors) {
	for _, f := range fields {
		if markerTypes[f.FieldType] || (f.Config.Hidden != nil && *f.Config.Hidden) {
			continue
		}
		container, isContainer := containerRuleFor(f.FieldType)
		rule, ok := valueRules[f.FieldType]
		if !ok && !isContainer {
			continue
		}
		at := joinPath(path, f.Config.APIAccessor)
		value, present := record[f.Config.APIAccessor]
		if !present {
			if f.Config.Required {
				errs.add(at, CodeRequired, nil)
			}
			continue
		}
		settings, _ := canonicalSettings(f.Settings)
		settingsObj, _ := settings.(map[string]any)
		if settingsObj == nil {
			settingsObj = map[string]any{}
		}
		if isContainer {
			container(f, settingsObj, value, at, errs)
			continue
		}
		sub := &valueErrors{ctx: errs.ctx}
		rule(f, settingsObj, value, sub)
		for _, e := range sub.list {
			errs.add(at+e.Path, e.Code, e.Params)
		}
	}
}

// valueErrors collects errors, each {path, code} once, as TS does.
type valueErrors struct {
	list []Error
	seen map[string]bool
	// ctx is what the whole run shares, for the rules that need more than
	// their value: rich_text's (rich_text.go).
	ctx *valueContext
}

func (v *valueErrors) add(path, code string, params map[string]any) {
	key := code + "\x00" + path
	if v.seen[key] {
		return
	}
	if v.seen == nil {
		v.seen = map[string]bool{}
	}
	v.seen[key] = true
	v.list = append(v.list, Error{Path: path, Code: code, Params: params})
}

// reportNonCanonical reports every key holding an Unset value, at every
// depth. A reported key is not looked into: its whole value is Unset. Array
// items are kept whatever they hold, and looked into.
func reportNonCanonical(value any, path string, errs *valueErrors) {
	switch x := value.(type) {
	case []any:
		segments := itemSegments(x)
		for i, item := range x {
			reportNonCanonical(item, joinPath(path, segments[i]), errs)
		}
	case map[string]any:
		for _, key := range sortedKeys(x) {
			at := joinPath(path, key)
			if isUnset(stripUnset(x[key])) {
				errs.add(at, CodeNotCanonical, nil)
			} else {
				reportNonCanonical(x[key], at, errs)
			}
		}
	}
}

// sortedKeys are an object's keys in order, so errors come in one order.
func sortedKeys(obj map[string]any) []string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

// capErrors reports the caps a value breaks, and whether it broke any. A
// container beyond MaxDepth or MaxItems is not looked into.
func capErrors(value any, path string, errs *valueErrors) bool {
	broke := false
	tooDeep := func(at string, depth int) bool {
		if depth <= MaxDepth {
			return false
		}
		errs.add(at, CodeTooDeep, map[string]any{"maximum": MaxDepth})
		broke = true
		return true
	}
	var walk func(node any, at string, depth int)
	walk = func(node any, at string, depth int) {
		switch x := node.(type) {
		case string:
			if len(x) > MaxStringBytes {
				errs.add(at, CodeTooLarge, map[string]any{"maximum": MaxStringBytes})
				broke = true
			}
		case []any:
			if tooDeep(at, depth) {
				return
			}
			if len(x) > MaxItems {
				errs.add(at, CodeTooManyItems, map[string]any{"maximum": MaxItems})
				broke = true
				return
			}
			segments := itemSegments(x)
			for i, item := range x {
				walk(item, joinPath(at, segments[i]), depth+1)
			}
		case map[string]any:
			if tooDeep(at, depth) {
				return
			}
			if len(x) > MaxItems {
				errs.add(at, CodeTooManyItems, map[string]any{"maximum": MaxItems})
				broke = true
				return
			}
			for _, key := range sortedKeys(x) {
				walk(x[key], joinPath(at, key), depth+1)
			}
		}
	}
	walk(value, path, 0)
	return broke
}
