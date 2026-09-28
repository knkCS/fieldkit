package fieldkit

import (
	"encoding/json"
	"strconv"
	"unicode/utf16"
)

// MaxIDLength is the most characters — UTF-16 code units, as JS counts a
// string's length — a row's _id may hold (ADR-0023). TS's ROW_ID_MAX_LENGTH
// is the same.
const MaxIDLength = 64

// containerRule checks a container Field's value, already canonical and not
// Unset, handing what it holds to validateFields — the composer (ADR-0007) —
// so a container never learns the types its children are. Unlike a
// valueRule, its paths are absolute: path is the value's own.
type containerRule func(f Field, settings map[string]any, value any, path string, errs *valueErrors)

// containerRuleFor is the value rule of a type that holds Fields, each the
// Go reading of that type's toZodType in src/schema/field-types/. A switch
// rather than a map like valueRules: the rules recurse through
// validateFields, which looks them up here, and a map would be an
// initialization cycle.
func containerRuleFor(fieldType string) (containerRule, bool) {
	switch fieldType {
	case "group", "virtual_table":
		return rowArrayValue, true
	case "blocks":
		return blocksValue, true
	case "fieldset":
		return fieldsetValue, true
	case "rich_text":
		// No container, but checked with its absolute path (rich_text.go).
		return richTextValue, true
	}
	return nil, false
}

// isRowID reports whether a value is a well-formed _id: a non-empty string of
// at most MaxIDLength characters. Unique is the array's rule, not the id's.
func isRowID(value any) bool {
	s, ok := value.(string)
	if !ok || s == "" {
		return false
	}
	return idLength(s) <= MaxIDLength
}

// idLength is a string's length as JS counts it, in UTF-16 code units.
func idLength(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// itemSegments are the path segments of an array's items (ADR-0023): an
// item's _id when it is an object holding a well-formed one no earlier item
// holds, its index otherwise. TS's itemSegments gives the same answers.
func itemSegments(items []any) []string {
	segments := make([]string, len(items))
	seen := map[string]bool{}
	for i, item := range items {
		segments[i] = strconv.Itoa(i)
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := obj["_id"].(string); ok && isRowID(id) && !seen[id] {
			seen[id] = true
			segments[i] = id
		}
	}
	return segments
}

// rowArrayValue is rowArrayZodType: an array of rows, each an object with an
// _id and — when the Field has children — the record its children describe;
// settings.min_items and max_items bound the count. A Field whose children
// are nil (a linked Row Spec never resolved) keeps the opaque row, _id and
// all.
func rowArrayValue(f Field, settings map[string]any, value any, path string, errs *valueErrors) {
	rows, ok := value.([]any)
	if !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	if lo, ok := settings["min_items"].(float64); ok && float64(len(rows)) < lo {
		errs.add(path, CodeTooSmall, map[string]any{"minimum": lo})
	}
	if hi, ok := settings["max_items"].(float64); ok && float64(len(rows)) > hi {
		errs.add(path, CodeTooManyItems, map[string]any{"maximum": hi})
	}
	duplicateIDs(rows, path, errs)
	segments := itemSegments(rows)
	for i, row := range rows {
		at := joinPath(path, segments[i])
		obj, ok := row.(map[string]any)
		if !ok {
			errs.add(at, CodeInvalidType, nil)
			continue
		}
		rowID(obj, at, errs)
		if f.Children != nil {
			validateFields(f.Children, obj, at, errs)
		}
	}
}

// duplicateIDs reports each row repeating the _id of an earlier row of the
// same array, at the repeat — which, being a repeat, is addressed by its
// index. Checked whatever else a row gets wrong, as TS's RowZodArray does.
func duplicateIDs(rows []any, path string, errs *valueErrors) {
	seen := map[string]bool{}
	for i, row := range rows {
		obj, ok := row.(map[string]any)
		if !ok {
			continue
		}
		id, ok := obj["_id"].(string)
		if !ok || !isRowID(id) {
			continue
		}
		if seen[id] {
			errs.add(joinPath(path, strconv.Itoa(i)), CodeDuplicateID, nil)
			continue
		}
		seen[id] = true
	}
}

// rowID checks a row's own _id: present (CodeMissingID at the row), a string
// (CodeInvalidType) of at most MaxIDLength characters (CodeTooBig). An Unset
// _id was stripped before this, so it is missing.
func rowID(row map[string]any, at string, errs *valueErrors) {
	id, present := row["_id"]
	if !present {
		errs.add(at, CodeMissingID, nil)
		return
	}
	s, ok := id.(string)
	if !ok {
		errs.add(joinPath(at, "_id"), CodeInvalidType, nil)
		return
	}
	if idLength(s) > MaxIDLength {
		errs.add(joinPath(at, "_id"), CodeTooBig, map[string]any{"maximum": MaxIDLength})
	}
}

// blockType is one entry of a Blocks Field's allowed_blocks, as its value
// rule reads it.
type blockType struct {
	typ    string
	typed  bool
	fields []Field
}

// blockTypes reads settings.allowed_blocks, canonical, leniently: a Field
// list that does not decode holds no Fields, as validateSpec reports it.
func blockTypes(settings map[string]any) []blockType {
	entries, _ := settings["allowed_blocks"].([]any)
	types := make([]blockType, 0, len(entries))
	for _, entry := range entries {
		obj, _ := entry.(map[string]any)
		bt := blockType{}
		bt.typ, bt.typed = obj["type"].(string)
		if items, ok := obj["fields"].([]any); ok {
			raw := make([]json.RawMessage, 0, len(items))
			for _, item := range items {
				b, err := json.Marshal(item)
				if err != nil {
					raw = nil
					break
				}
				raw = append(raw, b)
			}
			if fields, ok := decodeFieldList(raw); ok {
				bt.fields = fields
			}
		}
		types = append(types, bt)
	}
	return types
}

// blocksValue is the blocks type's toZodType: an array of Blocks, each an
// object with an _id and a _type.
//
//   - No Block Types: a _type that is a string, nothing else.
//   - One: _type must be that type's (CodeInvalidValue at _type), and the
//     Block is checked against its Fields whatever _type holds.
//   - Several: a Block whose _type names none of them is CodeInvalidValue at
//     _type and checked no further — a discriminated union has no branch to
//     check it against; one that names a type is checked against its Fields.
//
// A _type missing is CodeRequired, as any missing key a Block needs is.
func blocksValue(f Field, settings map[string]any, value any, path string, errs *valueErrors) {
	blocks, ok := value.([]any)
	if !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	types := blockTypes(settings)
	duplicateIDs(blocks, path, errs)
	segments := itemSegments(blocks)
	for i, block := range blocks {
		at := joinPath(path, segments[i])
		obj, ok := block.(map[string]any)
		if !ok {
			errs.add(at, CodeInvalidType, nil)
			continue
		}
		typ, present := obj["_type"]
		typeAt := joinPath(at, "_type")
		switch len(types) {
		case 0:
			rowID(obj, at, errs)
			switch {
			case !present:
				errs.add(typeAt, CodeRequired, nil)
			default:
				if _, ok := typ.(string); !ok {
					errs.add(typeAt, CodeInvalidType, nil)
				}
			}
		case 1:
			rowID(obj, at, errs)
			if !present {
				errs.add(typeAt, CodeRequired, nil)
			} else if s, ok := typ.(string); !ok || !types[0].typed || s != types[0].typ {
				errs.add(typeAt, CodeInvalidValue, nil)
			}
			validateFields(types[0].fields, obj, at, errs)
		default:
			match := -1
			if s, ok := typ.(string); ok {
				for j, bt := range types {
					if bt.typed && bt.typ == s {
						match = j
						break
					}
				}
			}
			if match < 0 {
				if !present {
					errs.add(typeAt, CodeRequired, nil)
				} else {
					errs.add(typeAt, CodeInvalidValue, nil)
				}
				continue
			}
			rowID(obj, at, errs)
			validateFields(types[match].fields, obj, at, errs)
		}
	}
}

// fieldsetValue is the fieldset type's toZodType: one record — the one its
// children describe once resolved, an opaque one before. A Fieldset holds no
// rows, so its record carries no _id; rows inside it do.
func fieldsetValue(f Field, _ map[string]any, value any, path string, errs *valueErrors) {
	record, ok := value.(map[string]any)
	if !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	if f.Children != nil {
		validateFields(f.Children, record, path, errs)
	}
}
