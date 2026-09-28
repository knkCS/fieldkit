package fieldkit

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// A Catalogue section is a Catalogue a package outside this one ships — the
// publishing package (ADR-0002, amended) is the first — together with the
// code of its types. Nothing registers one: a caller that wants its types
// builds a Catalogue that holds them, DefaultCatalogue().With(section), and
// runs every operation through that value. The package-level functions use
// DefaultCatalogue, so to them a section's types are unknown, as they are to
// a caller that never opted in.

// TypeCode is the hand-written half of a Field Type a Catalogue section
// defines (ADR-0018): the rules its settings schema cannot state, and
// everything about its values. It is the built-in types' per-type rules,
// exported, so a type outside this package plugs into the same operations.
// Every member is optional; a type without a member behaves as a built-in
// type without that rule does.
//
// Each hook reads what it is given leniently: a value of the wrong shape is
// Value's to report, so Edges and Text find nothing in it rather than failing.
// Paths are /-separated and relative — to the settings for Settings, to the
// value otherwise ("" is the value itself) — with each segment escaped as
// JoinPath escapes it.
type TypeCode struct {
	// Settings reports rules across the Field's own settings, beside its
	// schema. It receives the canonical settings — Unset stripped at every
	// depth (ADR-0021), numbers as float64 — whatever the schema reported.
	Settings func(settings any) []Error
	// Value checks a value, already canonical and not Unset, by exactly what
	// the type's toZodType checks in TS. Unset, required, not_canonical and
	// the caps are checked before it, for every type alike.
	Value func(f Field, settings map[string]any, value any, env TypeEnv) []Error
	// Edges are the Content Graph edges the value yields.
	Edges func(f Field, settings map[string]any, value any, env TypeEnv) []Edge
	// Text is the plain text the value yields, "" for none. A type whose
	// Catalogue entry has has_text declares it, and only such a type.
	Text func(f Field, settings map[string]any, value any, env TypeEnv) string
	// Compare compares two present values finer than a whole value, with
	// the detail a diff viewer reads (docs/compare-and-merge.md). Without it
	// the type compares as a whole value.
	Compare func(f Field, a, b any, env TypeEnv) (equal bool, detail *CompareDetail, err error)
	// Merge three-way merges three present values that all differ, finer
	// than a whole value; its conflicts are paths within the value. Without
	// it such a value is one Conflict at the Field. Only a type with Compare
	// merges finer.
	Merge func(f Field, base, ours, theirs any, env TypeEnv) (merged any, conflicts []string, err error)
}

// TypeEnv is what a TypeCode hook is told beside the Field and its value.
type TypeEnv struct {
	// Parts are the Resolved Spec's parts, by kind and Release: what the
	// Field pins. Nil without a Resolved Spec (ValidateValue, ValueText).
	Parts map[string]map[string]json.RawMessage
}

// JoinPath appends segments to a /-separated path, escaping each as RFC 6901
// does (~ as ~0, / as ~1): the grammar of every path this package reports.
func JoinPath(path string, segments ...string) string {
	return joinPath(path, segments...)
}

// NewCatalogue decodes a Catalogue section, strictly as ParseCatalogue
// decodes, with the code of its types. Every type it lists has an entry in
// code, and code names no type it does not list; a type has Text exactly
// when its entry has has_text. A type the built-in types already define is
// refused: their rules would win.
func NewCatalogue(data []byte, code map[string]TypeCode) (*Catalogue, error) {
	c, err := ParseCatalogue(data)
	if err != nil {
		return nil, err
	}
	for id := range code {
		if _, ok := c.Type(id); !ok {
			return nil, fmt.Errorf("code for %q, which the Catalogue does not list", id)
		}
	}
	for _, t := range c.Types {
		tc, ok := code[t.ID]
		if !ok {
			return nil, fmt.Errorf("type %q has no code", t.ID)
		}
		if builtInType(t.ID) {
			return nil, fmt.Errorf("type %q is a built-in type", t.ID)
		}
		if t.HasText != (tc.Text != nil) {
			return nil, fmt.Errorf("type %q: has_text is %v, but its code has Text: %v", t.ID, t.HasText, tc.Text != nil)
		}
		if tc.Merge != nil && tc.Compare == nil {
			return nil, fmt.Errorf("type %q merges finer but does not compare finer", t.ID)
		}
	}
	c.code = code
	return c, nil
}

// With is a new Catalogue holding this one's types and every section's, with
// their code — how a caller opts into a section:
//
//	c, err := fieldkit.DefaultCatalogue().With(publishing.Catalogue())
//
// Every Catalogue must carry the same version — one release ships them all
// (ADR-0018) — and no type may be listed twice. Neither Catalogue is
// changed.
func (c *Catalogue) With(sections ...*Catalogue) (*Catalogue, error) {
	out := &Catalogue{Version: c.Version, Types: slices.Clone(c.Types)}
	code := map[string]TypeCode{}
	for id, tc := range c.code {
		code[id] = tc
	}
	for _, s := range sections {
		if s.Version != c.Version {
			return nil, fmt.Errorf("fieldkit: a Catalogue %s cannot hold a section of %s", c.Version, s.Version)
		}
		out.Types = append(out.Types, s.Types...)
		for id, tc := range s.code {
			code[id] = tc
		}
	}
	slices.SortFunc(out.Types, func(a, b CatalogueType) int { return strings.Compare(a.ID, b.ID) })
	out.byID = make(map[string]*CatalogueType, len(out.Types))
	for i := range out.Types {
		t := &out.Types[i]
		if _, dup := out.byID[t.ID]; dup {
			return nil, fmt.Errorf("fieldkit: type %q is listed twice", t.ID)
		}
		out.byID[t.ID] = t
	}
	if len(code) > 0 {
		out.code = code
	}
	return out, nil
}

// builtInType reports whether this package defines rules of its own for a
// type id — rules a section's code could never replace, since they are looked
// up first.
func builtInType(id string) bool {
	if _, ok := typeRulesByID[id]; ok {
		return true
	}
	if _, ok := valueRules[id]; ok {
		return true
	}
	if _, ok := containerRuleFor(id); ok {
		return true
	}
	if _, ok := finerRuleFor(id); ok {
		return true
	}
	_, edges := edgeRules[id]
	_, text := textRules[id]
	return edges || text || markerTypes[id]
}

// codeOf is a section type's code, when this Catalogue holds one. A nil
// Catalogue holds none, so the internal callers that build no Catalogue — a
// composer in a test — see the built-in types alone.
func (c *Catalogue) codeOf(fieldType string) (TypeCode, bool) {
	if c == nil || c.code == nil {
		return TypeCode{}, false
	}
	tc, ok := c.code[fieldType]
	return tc, ok
}

// rulesFor are a type's Spec rules: a built-in type's, or a section type's
// Settings.
func (c *Catalogue) rulesFor(fieldType string) typeRules {
	if rules, ok := typeRulesByID[fieldType]; ok {
		return rules
	}
	if tc, ok := c.codeOf(fieldType); ok {
		return typeRules{settings: tc.Settings}
	}
	return typeRules{}
}

// valueRule is a type's value rule: a built-in type's, or a section type's
// Value. A type with neither is not checked.
func (c *Catalogue) valueRule(fieldType string) (valueRule, bool) {
	if rule, ok := valueRules[fieldType]; ok {
		return rule, true
	}
	tc, ok := c.codeOf(fieldType)
	if !ok || tc.Value == nil {
		return nil, false
	}
	return func(f Field, settings map[string]any, value any, errs *valueErrors) {
		var env TypeEnv
		if errs.ctx != nil && errs.ctx.richText != nil {
			env.Parts = errs.ctx.richText.parts
		}
		for _, e := range tc.Value(f, settings, value, env) {
			errs.add(e.Path, e.Code, e.Params)
		}
	}, true
}

// edgeRule is a type's edge rule, with the Resolved Spec's parts for a
// section type's Edges.
func (c *Catalogue) edgeRule(fieldType string, parts map[string]map[string]json.RawMessage) (edgeRule, bool) {
	if rule, ok := edgeRules[fieldType]; ok {
		return rule, true
	}
	tc, ok := c.codeOf(fieldType)
	if !ok || tc.Edges == nil {
		return nil, false
	}
	return func(f Field, settings map[string]any, value any) []Edge {
		return tc.Edges(f, settings, value, TypeEnv{Parts: parts})
	}, true
}

// textRule is a type's text rule: a built-in type's, or a section type's
// Text.
func (c *Catalogue) textRule(fieldType string) (textRule, bool) {
	if rule, ok := textRules[fieldType]; ok {
		return rule, true
	}
	tc, ok := c.codeOf(fieldType)
	if !ok || tc.Text == nil {
		return nil, false
	}
	return func(f Field, settings map[string]any, value any, parts map[string]map[string]json.RawMessage) string {
		return tc.Text(f, settings, value, TypeEnv{Parts: parts})
	}, true
}

// finerRule is a type's Compare and Merge finer than a whole value: a
// built-in type's, or a section type's Compare and Merge.
func (c *Catalogue) finerRule(fieldType string) (finerRule, bool) {
	if rule, ok := finerRuleFor(fieldType); ok {
		return rule, true
	}
	tc, ok := c.codeOf(fieldType)
	if !ok || tc.Compare == nil {
		return finerRule{}, false
	}
	return finerRule{
		compare: func(k *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
			return tc.Compare(*f, a, b, TypeEnv{Parts: k.parts})
		},
		merge: func(k *composer, f *Field, base, ours, theirs any, path string) (any, error) {
			if tc.Merge == nil {
				k.conflict(path)
				return nil, nil
			}
			merged, conflicts, err := tc.Merge(*f, base, ours, theirs, TypeEnv{Parts: k.parts})
			if err != nil {
				return nil, err
			}
			// A conflict is a path relative to the value, as every hook's
			// is: "" or JoinPath's "/a/b". A bare segment is read as one
			// segment, and escaped, as rich_text's conflicts are.
			for _, at := range conflicts {
				switch {
				case at == "":
					k.conflict(path)
				case strings.HasPrefix(at, "/"):
					k.conflict(path + at)
				default:
					k.conflict(joinPath(path, at))
				}
			}
			return merged, nil
		},
	}, true
}
