package publishing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"unicode/utf16"
	"unicode/utf8"

	vocabulary "github.com/knkcms/knkeditor/go"
	fieldkit "github.com/knkcs/fieldkit/go"
)

// The codes only ti_overlay reports, both from ValidateResolvedValue alone:
// they need the TI Set the Field pins, which only a Resolved Spec holds, so
// TS never reports them. Part of the data contract (conformance/README.md).
const (
	// CodeUnknownCommand is an entry's command that is not a code of the TI
	// Set the Field pins. At the entry's command.
	CodeUnknownCommand = "unknown_command"
	// CodeInvalidTISet is a TI Set the Field pins that the Resolved Spec does
	// not hold, or that is not one fieldkit can read (TISetKind). At the
	// Field; its commands are then not checked.
	CodeInvalidTISet = "invalid_ti_set"
)

// TISetKind is the kind of a Pin naming a Typesetting Instruction Set
// Release: ti_overlay's ti_set setting, resolved into the Resolved Spec's
// Parts["ti_set"] like any opaque part (TS TI_SET_KIND).
//
// fieldkit reads one thing of a TI Set: the codes it offers, as
// {"instructions": [{"code": "np", …}, …]} — every other key, and every other
// key of an instruction, is blueprinthub's and left alone. A TI Set in any
// other shape is CodeInvalidTISet.
const TISetKind = "ti_set"

// maxSafeInteger is JS's Number.MAX_SAFE_INTEGER: the largest offset TS's
// inlineAnchorSchema, and knkeditor's InlineAnchor, accept.
const maxSafeInteger = 1<<53 - 1

// tiOverlay is ti_overlay: a Title's typesetting instructions (contenthub ADR
// 0012) — {entries: [...]}, each entry a row with its _id, knkeditor's inline
// anchor, a command of the pinned TI Set, params, a source and notes. No
// text, no edges; its entries compare, merge and are minted by _id, as a
// Group's rows.
var tiOverlay = fieldkit.TypeCode{ //nolint:gochecknoglobals
	Value:   tiOverlayValue,
	Compare: tiOverlayCompare,
	Merge:   tiOverlayMerge,
	MintIDs: tiOverlayMint,
}

// tiOverlayMint gives every entry an _id where it has none, deterministically
// (ADR-0023): the overlay is minted as a record whose entries are a Group's
// rows, which hold nothing further to mint. A value that is not an object is
// returned as it is. TS's mintIds.
func tiOverlayMint(_ fieldkit.Field, value any, env fieldkit.TypeEnv) any {
	if record, ok := value.(map[string]any); ok {
		env.MintRecord([]fieldkit.Field{{FieldType: "group", Config: fieldkit.Config{Name: "entries", APIAccessor: "entries"}}}, record, "")
	}
	return value
}

var (
	overlayKeys = map[string]bool{"entries": true}                                                                             //nolint:gochecknoglobals
	entryKeys   = map[string]bool{"_id": true, "anchor": true, "command": true, "params": true, "source": true, "notes": true} //nolint:gochecknoglobals
	anchorKeys  = map[string]bool{"node": true, "offset": true, "before": true, "after": true}                                 //nolint:gochecknoglobals
	sources     = map[string]bool{"editor": true, "oasys": true}                                                               //nolint:gochecknoglobals
)

// tiOverlayValue is the Go reading of its toZodType: a strict object holding
// entries, a row array (RowZodArray) of strict entries. A key it does not
// declare is one CodeInvalidValue at the object holding it, as Zod's strict
// object reports it — which is how core's published, drafts, label,
// base_revision_id, oasys_response and an entry's status are refused.
//
// With a Resolved Spec (env.Parts not nil) each command is looked up in the
// TI Set the Field's ti_set pins.
func tiOverlayValue(_ fieldkit.Field, settings map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.Error {
	var errs []fieldkit.Error
	add := func(path, code string) { errs = append(errs, fieldkit.Error{Path: path, Code: code}) }

	obj, ok := value.(map[string]any)
	if !ok {
		add("", fieldkit.CodeInvalidType)
		return errs
	}
	if hasUnknownKey(obj, overlayKeys) {
		add("", fieldkit.CodeInvalidValue)
	}
	raw, present := obj["entries"]
	if !present {
		add("/entries", fieldkit.CodeRequired)
		return errs
	}
	entries, ok := raw.([]any)
	if !ok {
		add("/entries", fieldkit.CodeInvalidType)
		return errs
	}
	for _, i := range duplicateIDs(entries) {
		add(fieldkit.JoinPath("/entries", strconv.Itoa(i)), fieldkit.CodeDuplicateID)
	}
	segments := itemSegments(entries)
	commands := make(map[string]string, len(entries)) // path → command
	for i, item := range entries {
		at := fieldkit.JoinPath("/entries", segments[i])
		entry, ok := item.(map[string]any)
		if !ok {
			add(at, fieldkit.CodeInvalidType)
			continue
		}
		if hasUnknownKey(entry, entryKeys) {
			add(at, fieldkit.CodeInvalidValue)
		}
		switch id, present := entry["_id"]; {
		case !present:
			add(at, fieldkit.CodeMissingID)
		case !isString(id):
			add(at+"/_id", fieldkit.CodeInvalidType)
		case idLength(id.(string)) > fieldkit.MaxIDLength:
			add(at+"/_id", fieldkit.CodeTooBig)
		}
		errs = append(errs, anchorErrors(entry, at)...)
		if command, ok := requiredString(entry, "command", at, add); ok {
			commands[at+"/command"] = command
		}
		if params, present := entry["params"]; present {
			record, ok := params.(map[string]any)
			if !ok {
				add(at+"/params", fieldkit.CodeInvalidType)
			} else {
				for key, v := range record {
					if !isString(v) {
						add(fieldkit.JoinPath(at+"/params", key), fieldkit.CodeInvalidType)
					}
				}
			}
		}
		if source, ok := requiredString(entry, "source", at, add); ok && !sources[source] {
			add(at+"/source", fieldkit.CodeInvalidValue)
		}
		if notes, present := entry["notes"]; present && !isString(notes) {
			add(at+"/notes", fieldkit.CodeInvalidType)
		}
	}
	return append(errs, commandErrors(settings, commands, env)...)
}

// anchorErrors checks an entry's anchor in knkeditor's shape, by its shape
// alone: resolving it against a document is knkeditor's. before and after
// are counted in code points, as knkeditor counts them; either is absent
// where there is no text (Unset, ADR-0021).
func anchorErrors(entry map[string]any, at string) []fieldkit.Error {
	at += "/anchor"
	raw, present := entry["anchor"]
	if !present {
		return []fieldkit.Error{{Path: at, Code: fieldkit.CodeRequired}}
	}
	anchor, ok := raw.(map[string]any)
	if !ok {
		return []fieldkit.Error{{Path: at, Code: fieldkit.CodeInvalidType}}
	}
	var errs []fieldkit.Error
	add := func(path, code string) { errs = append(errs, fieldkit.Error{Path: path, Code: code}) }
	if hasUnknownKey(anchor, anchorKeys) {
		add(at, fieldkit.CodeInvalidValue)
	}
	requiredString(anchor, "node", at, add)
	switch offset, present := anchor["offset"]; {
	case !present:
		add(at+"/offset", fieldkit.CodeRequired)
	default:
		n, ok := offset.(float64)
		if !ok {
			add(at+"/offset", fieldkit.CodeInvalidType)
			break
		}
		// Zod checks each rule and reports every one broken: not an
		// integer, below 0, beyond the safe integers.
		if math.IsInf(n, 0) || n != math.Trunc(n) {
			add(at+"/offset", fieldkit.CodeInvalidType)
		}
		if n < 0 {
			add(at+"/offset", fieldkit.CodeTooSmall)
		}
		if n > maxSafeInteger {
			add(at+"/offset", fieldkit.CodeTooBig)
		}
	}
	for _, key := range []string{"before", "after"} {
		v, present := anchor[key]
		if !present {
			continue
		}
		s, ok := v.(string)
		switch {
		case !ok:
			add(at+"/"+key, fieldkit.CodeInvalidType)
		case utf8.RuneCountInString(s) > vocabulary.InlineAnchorWindow:
			add(at+"/"+key, fieldkit.CodeTooBig)
		}
	}
	return errs
}

// requiredString checks a key that must hold a string, reporting it under at;
// the string, when it is one. An Unset "" was stripped before, so it is
// missing.
func requiredString(obj map[string]any, key, at string, add func(path, code string)) (string, bool) {
	v, present := obj[key]
	if !present {
		add(at+"/"+key, fieldkit.CodeRequired)
		return "", false
	}
	s, ok := v.(string)
	if !ok {
		add(at+"/"+key, fieldkit.CodeInvalidType)
	}
	return s, ok
}

// commandErrors looks each entry's command up in the TI Set the Field pins,
// when there is a Resolved Spec to hold it and the Field pins one.
func commandErrors(settings map[string]any, commands map[string]string, env fieldkit.TypeEnv) []fieldkit.Error {
	release, _ := settings["ti_set"].(string)
	if env.Parts == nil || release == "" {
		return nil
	}
	codes, err := tiSetCodes(env.Parts[TISetKind][release])
	if err != nil {
		return []fieldkit.Error{{Path: "", Code: CodeInvalidTISet, Params: map[string]any{"release": release, "reason": err.Error()}}}
	}
	var errs []fieldkit.Error
	for at, command := range commands {
		if !codes[command] {
			errs = append(errs, fieldkit.Error{Path: at, Code: CodeUnknownCommand, Params: map[string]any{"command": command, "release": release}})
		}
	}
	return errs
}

// tiSetCodes reads the codes a TI Set offers (TISetKind).
func tiSetCodes(raw json.RawMessage) (map[string]bool, error) {
	if raw == nil {
		return nil, fmt.Errorf("the Resolved Spec holds no such TI Set")
	}
	var set struct {
		Instructions []struct {
			Code *string `json:"code"`
		} `json:"instructions"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	if err := dec.Decode(&set); err != nil {
		return nil, fmt.Errorf("not a TI Set: %w", err)
	}
	if set.Instructions == nil {
		return nil, fmt.Errorf("not a TI Set: no instructions")
	}
	codes := make(map[string]bool, len(set.Instructions))
	for i, instruction := range set.Instructions {
		if instruction.Code == nil || *instruction.Code == "" {
			return nil, fmt.Errorf("not a TI Set: instruction %d has no code", i)
		}
		codes[*instruction.Code] = true
	}
	return codes, nil
}

func hasUnknownKey(obj map[string]any, known map[string]bool) bool {
	for key := range obj {
		if !known[key] {
			return true
		}
	}
	return false
}

func isString(v any) bool {
	_, ok := v.(string)
	return ok
}

// duplicateIDs are the indices of the rows repeating a well-formed _id an
// earlier row holds, as fieldkit's row arrays report them.
func duplicateIDs(rows []any) []int {
	var out []int
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
			out = append(out, i)
			continue
		}
		seen[id] = true
	}
	return out
}

// entryFields describe an entry to the Compare and Merge composer: each key
// a child Field compared as a whole value — an anchor, a params record — so
// two sides changing different keys of one entry merge cleanly and the same
// key is a Conflict at it. Only the field_type's finer rule, which none of
// these has, would matter.
var entryFields = []fieldkit.Field{ //nolint:gochecknoglobals
	wholeValue("anchor"), wholeValue("command"), wholeValue("params"), wholeValue("source"), wholeValue("notes"),
}

func wholeValue(accessor string) fieldkit.Field {
	return fieldkit.Field{FieldType: "text", Config: fieldkit.Config{Name: accessor, APIAccessor: accessor}}
}

// asRecord is how fieldkit's own composer sees a ti_overlay Field: a
// Fieldset whose one child, entries, is a Group of entries — so the value
// compares and merges by the Group's rules (ADR-0023), per entry by _id and
// per key within it, reorders at entries/_order, through the public
// versionkit adapter rather than a copy of it.
func asRecord(f fieldkit.Field) (fieldkit.SchemaField, error) {
	record := fieldkit.Field{
		FieldType: "fieldset",
		Config:    fieldkit.Config{Name: f.Config.Name, APIAccessor: f.Config.APIAccessor},
		Children: []fieldkit.Field{{
			FieldType: "group",
			Config:    fieldkit.Config{Name: "entries", APIAccessor: "entries"},
			Children:  entryFields,
		}},
	}
	fields, err := fieldkit.DefaultCatalogue().SchemaFields(&fieldkit.ResolvedSpec{Fields: fieldkit.Spec{record}})
	if err != nil {
		return fieldkit.SchemaField{}, err
	}
	return fields[0], nil
}

func tiOverlayCompare(f fieldkit.Field, a, b any, _ fieldkit.TypeEnv) (bool, *fieldkit.CompareDetail, error) {
	record, err := asRecord(f)
	if err != nil {
		return false, nil, err
	}
	rawA, err := json.Marshal(a)
	if err != nil {
		return false, nil, err
	}
	rawB, err := json.Marshal(b)
	if err != nil {
		return false, nil, err
	}
	equal, raw, err := record.Type.Compare(record.Settings, rawA, rawB)
	if err != nil || equal || raw == nil {
		return equal, nil, err
	}
	var detail fieldkit.CompareDetail
	if err := json.Unmarshal(raw, &detail); err != nil {
		return false, nil, err
	}
	return false, &detail, nil
}

func tiOverlayMerge(f fieldkit.Field, base, ours, theirs any, _ fieldkit.TypeEnv) (any, []string, error) {
	record, err := asRecord(f)
	if err != nil {
		return nil, nil, err
	}
	merger, ok := record.Type.(fieldkit.Merger)
	if !ok {
		return nil, nil, fmt.Errorf("fieldkit/publishing: a Fieldset does not merge")
	}
	raws := make([]json.RawMessage, 3)
	for i, v := range []any{base, ours, theirs} {
		if raws[i], err = json.Marshal(v); err != nil {
			return nil, nil, err
		}
	}
	merged, conflicts, err := merger.Merge(record.Settings, raws[0], raws[1], raws[2])
	if err != nil {
		return nil, nil, err
	}
	if len(conflicts) > 0 {
		// versionkit's paths lack the leading /; a hook's are /-led.
		out := make([]string, len(conflicts))
		for i, c := range conflicts {
			out[i] = "/" + c
		}
		return nil, out, nil
	}
	dec := json.NewDecoder(bytes.NewReader(merged))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, nil, err
	}
	return value, nil, nil
}

// isRowID, idLength and itemSegments read an entry's _id as fieldkit reads a
// row's; fieldkit exports no reading of a flat row array, so they are copies
// of its own (#270). A tree reads through fieldkit.EachTreeNode and TypeEnv.

// isRowID reports whether a value is a well-formed _id: a non-empty string of
// at most fieldkit.MaxIDLength characters.
func isRowID(id string) bool {
	return id != "" && idLength(id) <= fieldkit.MaxIDLength
}

// idLength is a string's length as JS counts it, in UTF-16 code units.
func idLength(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// itemSegments are the path segments of an array's items (ADR-0023): an
// item's _id when it is an object holding a well-formed one no earlier item
// holds, its index otherwise — fieldkit's own grammar for every value path.
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
