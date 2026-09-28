package fieldkit

import (
	"strings"
)

// The error codes this module reports. They are part of the data contract,
// shared with TS's validateSpec: a code is only ever added, never renamed or
// removed (ADR-0019).
const (
	// CodeUnknownFieldType is a Field whose field_type the Catalogue does not
	// list. Its settings are not checked.
	CodeUnknownFieldType = "unknown_field_type"
	// CodeUnknownSetting is a settings key the type's settings schema does not
	// declare.
	CodeUnknownSetting = "unknown_setting"
	// CodeInvalidSetting is a declared setting whose value the type's settings
	// schema refuses: a wrong type, or a number or length out of range.
	CodeInvalidSetting = "invalid_setting"
	// CodeVirtualTableRowSpecAmbiguous is a Virtual Table that links a
	// Blueprint and has children: two Row Specs where ADR-0017 allows one.
	CodeVirtualTableRowSpecAmbiguous = "virtual_table_row_spec_ambiguous"
	// CodeVirtualTableRowSpecMissing is a Virtual Table with neither a linked
	// nor an embedded Row Spec.
	CodeVirtualTableRowSpecMissing = "virtual_table_row_spec_missing"
	// CodePosition is a Field in a Position its type's Catalogue entry does
	// not list (ADR-0022) — a group in a Row Spec, say. At the Field, with
	// position and field_type as Params.
	CodePosition = "position"
	// CodeReservedAccessor is an Accessor beginning with "_", reserved in
	// every Position for _id, _type, _order and what value shapes need later
	// (ADR-0022). At the Field.
	CodeReservedAccessor = "reserved_accessor"
	// CodeLooseFieldInCardedTab is a Field before the first card marker of a
	// tab that has one: once a tab has a card, every Field in it lives in a
	// card. At the Field. Top level only.
	CodeLooseFieldInCardedTab = "loose_field_in_carded_tab"
	// CodeInvalidConfig is a config key holding a value it does not accept —
	// a search other than off, A, B, C or D. At the key.
	CodeInvalidConfig = "invalid_config"
	// CodeSearchWithoutText is config.search on a type the Catalogue marks as
	// having no text. At the key.
	CodeSearchWithoutText = "search_without_text"
	// CodeDuplicateBlockType is a Block Type repeating the type an earlier
	// Block Type of the same Blocks Field declared, reported at its type.
	CodeDuplicateBlockType = "duplicate_block_type"

	// The codes ValidateValue reports, shared with TS's validateValue.

	// CodeRequired is a required Field whose value is Unset (ADR-0021).
	CodeRequired = "required"
	// CodeNotCanonical is a key holding an Unset value — null, "", [] or {} —
	// at any depth of stored data: Unset is stored as absent (ADR-0021).
	CodeNotCanonical = "not_canonical"
	// CodeInvalidType is a value of the wrong JSON type, or data that is not
	// a JSON object.
	CodeInvalidType = "invalid_type"
	// CodeInvalidFormat is a string not in its type's format: an email
	// address, a URL, a slug, or the Field's validation pattern.
	CodeInvalidFormat = "invalid_format"
	// CodeTooSmall is a value below a minimum the Spec states: a string
	// shorter than validation.min_length, a number below settings.min — and a
	// blank entry in a required List.
	CodeTooSmall = "too_small"
	// CodeTooBig is a value above a maximum the Spec states: a string longer
	// than validation.max_length, a number above settings.max.
	CodeTooBig = "too_big"
	// CodeTooManyItems is an array, or an object's keys, beyond MaxItems.
	CodeTooManyItems = "too_many_items"
	// CodeTooLarge is a string beyond MaxStringBytes.
	CodeTooLarge = "too_large"
	// CodeInvalidValue is any other rule a type's value rules state. TS
	// reports it for a Zod rule none of the other codes names; here, a Block
	// whose _type is not one of its Field's Block Types.
	CodeInvalidValue = "invalid_value"
	// CodeMissingID is a row of a group, virtual_table or blocks value
	// without an _id (ADR-0023). At the row.
	CodeMissingID = "missing_id"
	// CodeDuplicateID is a row repeating an _id an earlier row of the same
	// array holds. At each repeat.
	CodeDuplicateID = "duplicate_id"
	// CodeTooDeep is an array or object nested deeper than MaxDepth.
	CodeTooDeep = "too_deep"
)

// Error is one validation error, in the shape TS reports it: where, which
// rule, and optional detail.
type Error struct {
	// Path is /-separated. In a Spec it is each Field's Accessor from the
	// root, with "children" between a Field and the Fields it holds, then
	// "settings" and the key for a settings error:
	// "/authors/children/name/settings/placeholder". A segment holding / or ~
	// is escaped as in RFC 6901.
	Path string `json:"path"`
	// Code is one of the Code constants.
	Code string `json:"code"`
	// Params is detail a message may interpolate, such as field_type for
	// CodeUnknownFieldType. Nil when the code says everything.
	Params map[string]any `json:"params,omitempty"`
}

// Error formats the error as "path: code".
func (e Error) Error() string {
	if e.Path == "" {
		return e.Code
	}
	return e.Path + ": " + e.Code
}

var segmentEscaper = strings.NewReplacer("~", "~0", "/", "~1")

// joinPath appends segments to a path, each escaped as in RFC 6901.
func joinPath(path string, segments ...string) string {
	var b strings.Builder
	b.WriteString(path)
	for _, s := range segments {
		b.WriteByte('/')
		b.WriteString(segmentEscaper.Replace(s))
	}
	return b.String()
}
