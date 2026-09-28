package fieldkit

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"unicode/utf16"
)

// valueRules are the value rules of every type ValidateValue implements, one
// per type, each the Go reading of that type's toZodType in
// src/schema/field-types/. A type missing here is skipped.
var valueRules = map[string]valueRule{ //nolint:gochecknoglobals
	"text":       textValue(true, true),
	"textarea":   textValue(true, false),
	"code":       textValue(true, false),
	"markdown":   textValue(true, false),
	"date":       textValue(false, false),
	"time":       textValue(false, false),
	"color":      textValue(false, false),
	"radio":      textValue(false, false),
	"lookup":     textValue(false, false),
	"email":      formatValue(isEmail),
	"url":        formatValue(isURL),
	"slug":       formatValue(slugPattern.MatchString),
	"number":     numberValue,
	"boolean":    booleanValue,
	"select":     selectValue,
	"checkboxes": stringsValue,
	"media":      stringsValue,
	"list":       listValue,
	"array":      arrayValue,
}

// textValue is z.string(), with the Field's validation.min_length and
// max_length when lengths is set, and its validation.pattern when pattern is.
// Every rule is checked, as Zod checks every one of a string's checks.
func textValue(lengths, pattern bool) valueRule {
	return func(f Field, _ map[string]any, value any, errs *valueErrors) {
		s, ok := value.(string)
		if !ok {
			errs.add("", CodeInvalidType, nil)
			return
		}
		if v := f.Validation; v != nil && lengths {
			// Counted as JS counts a string's length, in UTF-16 code units.
			n := float64(len(utf16.Encode([]rune(s))))
			if v.MinLength != nil && n < *v.MinLength {
				errs.add("", CodeTooSmall, map[string]any{"minimum": *v.MinLength})
			}
			if v.MaxLength != nil && n > *v.MaxLength {
				errs.add("", CodeTooBig, map[string]any{"maximum": *v.MaxLength})
			}
		}
		if v := f.Validation; v != nil && pattern && v.Pattern != nil && *v.Pattern != "" {
			if re := compilePattern(*v.Pattern); re != nil && !re.MatchString(s) {
				errs.add("", CodeInvalidFormat, nil)
			}
		}
	}
}

// formatValue is z.string() with one format check.
func formatValue(valid func(string) bool) valueRule {
	return func(_ Field, _ map[string]any, value any, errs *valueErrors) {
		s, ok := value.(string)
		if !ok {
			errs.add("", CodeInvalidType, nil)
			return
		}
		if !valid(s) {
			errs.add("", CodeInvalidFormat, nil)
		}
	}
}

// numberValue is z.number() with settings.min and settings.max, both
// inclusive. JSON has no NaN; ±Inf, from a number beyond float64, is a
// number, as it is to Zod.
func numberValue(_ Field, settings map[string]any, value any, errs *valueErrors) {
	n, ok := value.(float64)
	if !ok {
		errs.add("", CodeInvalidType, nil)
		return
	}
	if lo, ok := settings["min"].(float64); ok && n < lo {
		errs.add("", CodeTooSmall, map[string]any{"minimum": lo})
	}
	if hi, ok := settings["max"].(float64); ok && n > hi {
		errs.add("", CodeTooBig, map[string]any{"maximum": hi})
	}
}

func booleanValue(_ Field, _ map[string]any, value any, errs *valueErrors) {
	if _, ok := value.(bool); !ok {
		errs.add("", CodeInvalidType, nil)
	}
}

// selectValue is a list of option keys when settings.multiple is true, and
// one key otherwise. Neither is checked against settings.options, as TS does
// not check them.
func selectValue(f Field, settings map[string]any, value any, errs *valueErrors) {
	if multiple, _ := settings["multiple"].(bool); multiple {
		stringsValue(f, settings, value, errs)
		return
	}
	textValue(false, false)(f, settings, value, errs)
}

// stringsValue is z.array(z.string()).
func stringsValue(_ Field, _ map[string]any, value any, errs *valueErrors) {
	items, ok := value.([]any)
	if !ok {
		errs.add("", CodeInvalidType, nil)
		return
	}
	for i, item := range items {
		if _, ok := item.(string); !ok {
			errs.add(joinPath("", fmt.Sprint(i)), CodeInvalidType, nil)
		}
	}
}

// listValue is z.array(z.string()), and a required List's entries may not be
// blank: an entry that is "" is too short.
func listValue(f Field, _ map[string]any, value any, errs *valueErrors) {
	items, ok := value.([]any)
	if !ok {
		errs.add("", CodeInvalidType, nil)
		return
	}
	for i, item := range items {
		s, ok := item.(string)
		switch {
		case !ok:
			errs.add(joinPath("", fmt.Sprint(i)), CodeInvalidType, nil)
		case f.Config.Required && s == "":
			errs.add(joinPath("", fmt.Sprint(i)), CodeTooSmall, map[string]any{"minimum": 1})
		}
	}
}

// arrayValue is, with settings.mode "keyed", an object of strings; otherwise
// a list of {key, value} pairs, either half a string or absent. A pair may
// hold other keys, which are not checked, as Zod's object ignores them.
func arrayValue(_ Field, settings map[string]any, value any, errs *valueErrors) {
	if mode, _ := settings["mode"].(string); mode == "keyed" {
		entries, ok := value.(map[string]any)
		if !ok {
			errs.add("", CodeInvalidType, nil)
			return
		}
		for key, entry := range entries {
			if _, ok := entry.(string); !ok {
				errs.add(joinPath("", key), CodeInvalidType, nil)
			}
		}
		return
	}
	rows, ok := value.([]any)
	if !ok {
		errs.add("", CodeInvalidType, nil)
		return
	}
	// A pair holding an _id is addressed by it, as every array item is.
	segments := itemSegments(rows)
	for i, row := range rows {
		at := joinPath("", segments[i])
		pair, ok := row.(map[string]any)
		if !ok {
			errs.add(at, CodeInvalidType, nil)
			continue
		}
		for _, half := range []string{"key", "value"} {
			if v, present := pair[half]; present {
				if _, ok := v.(string); !ok {
					errs.add(joinPath(at, half), CodeInvalidType, nil)
				}
			}
		}
	}
}

// slugPattern is the slug type's SLUG_PATTERN.
var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`) //nolint:gochecknoglobals

// emailBody is Zod 3's email regex without its two lookaheads, which RE2
// cannot state and isEmail checks by hand. Its classes are spelled out in
// both cases rather than with (?i): Go folds case over Unicode, so (?i) would
// let the Kelvin sign match k, which JS's non-unicode /i does not.
var emailBody = regexp.MustCompile(`^([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$`) //nolint:gochecknoglobals

// isEmail is Zod 3's z.string().email():
// /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i
//
// JS's (?!.*\.\.) cannot see past a line break, where this looks at the whole
// string; the body refuses a line break anyway, so the answers agree.
func isEmail(s string) bool {
	return !strings.HasPrefix(s, ".") && !strings.Contains(s, "..") && emailBody.MatchString(s)
}

// patterns caches compiled validation patterns; a pattern RE2 cannot compile
// is cached as nil.
var patterns sync.Map //nolint:gochecknoglobals

// compilePattern compiles a Field's validation.pattern, which is written for
// JS's RegExp (TS tests it unanchored, as RegExp.test does, and so does
// MatchString). RE2 reads the common subset alike. A pattern it cannot
// compile — a lookaround, a backreference — is nil, and checks nothing: the
// service then accepts what the form might refuse, never the other way round.
// Where the two dialects differ in meaning (\s is ASCII-only in RE2), RE2's
// reading is used.
func compilePattern(pattern string) *regexp.Regexp {
	if re, ok := patterns.Load(pattern); ok {
		return re.(*regexp.Regexp)
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		re = nil
	}
	patterns.Store(pattern, re)
	return re
}
