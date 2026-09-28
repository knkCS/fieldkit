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
