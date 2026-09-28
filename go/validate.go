package fieldkit

import (
	"slices"
	"strings"
)

// ValidateSpec checks an authored Spec against the embedded Catalogue, with
// the answers TS's validateSpec gives for the same rules:
//
//   - every Field's field_type is in the Catalogue (CodeUnknownFieldType,
//     at the Field; its settings are then not checked);
//   - every Field's settings are what its type's settings schema declares
//     (CodeUnknownSetting, CodeInvalidSetting, at the setting);
//   - every Field sits in a Position its type lists (CodePosition, ADR-0022):
//     the root, a Row Spec, a Reference Spec, a Block Type. One check for
//     every container —
//     what a Row Spec may hold (ADR-0017) is the "row" Position;
//   - no Accessor begins with "_" (CodeReservedAccessor);
//   - config.search is off or A–D (CodeInvalidConfig), and only on a type
//     the Catalogue marks as having text (CodeSearchWithoutText);
//   - the card-marker rule at the top level (CodeLooseFieldInCardedTab);
//   - the rules across settings a type has beside its schema (rules.go):
//     a Virtual Table's Row Spec (ADR-0017), a Blocks Field's Block Types,
//     and a Reference Field's blueprints (CodeDuplicateBlueprint);
//   - and whatever a caller's Policy adds (WithPolicy).
//
// It walks every Spec a Field holds, at every depth: its children, whatever
// Field holds them, a Blocks Field's Block Types' Fields and a Reference
// Field's Reference Specs, which live in its settings. A Field in a Block Type
// is at "/content/settings/allowed_blocks/0/fields/title", one in a Reference
// Spec at "/related/settings/spec/page". The result is nil for a valid Spec.
//
// TS's validateSpec checks rules this does not implement yet — empty names
// and Accessors, duplicate Accessors — and the conformance fixtures stay clear
// of them.
//
// The Catalogue lists every built-in type. A type it does not list — a
// Consumer's own — reports unknown_field_type here, and has no Positions and
// no text, so it is never reported as CodePosition as well.
func ValidateSpec(spec Spec, opts ...Option) []Error {
	return DefaultCatalogue().ValidateSpec(spec, opts...)
}

// Policy is a caller's own rule, run on every Field at every depth beside
// fieldkit's — where a service's policy lives (refusing localizable on a
// content Blueprint, say), so that fieldkit ships none. path is the Field's
// own, position where it sits. The errors' paths are relative to the Field:
// "" is the Field itself, "/config/localizable" a key of it. TS's
// validateSpec takes the same hook (its policy option).
type Policy func(f Field, path, position string) []Error

// Option configures ValidateSpec.
type Option func(*options)

type options struct {
	policy   Policy
	resolved bool
}

// WithPolicy runs a caller's Policy on every Field.
func WithPolicy(p Policy) Option {
	return func(o *options) { o.policy = p }
}

// ValidateSpec is the package-level ValidateSpec against this Catalogue.
func (c *Catalogue) ValidateSpec(spec Spec, opts ...Option) []Error {
	var o options
	for _, opt := range opts {
		opt(&o)
	}
	errs := cardLayout(spec)
	c.validateFields(spec, "", PositionRoot, &o, &errs)
	return errs
}

// ValidateResolvedSpec checks a Resolved Spec against the embedded Catalogue:
// every rule ValidateSpec checks, now also over the Fields each pinned
// Blueprint Release was inlined as (ADR-0020). Only here is it known what a
// linked Blueprint is linked *as*, so only here are its Fields' Positions
// checked — a group in a Blueprint linked as a Row Spec is CodePosition at
// "/lines/children/group".
//
// blueprinthub runs ValidateSpec when a Revision is saved and this when a
// Release is cut. A Virtual Table that links a Blueprint and has children is
// resolved here, not ambiguous: that rule is the authored Spec's
// (ValidateSpec).
func ValidateResolvedSpec(resolved *ResolvedSpec, opts ...Option) []Error {
	return DefaultCatalogue().ValidateResolvedSpec(resolved, opts...)
}

// ValidateResolvedSpec is the package-level ValidateResolvedSpec against this
// Catalogue.
func (c *Catalogue) ValidateResolvedSpec(resolved *ResolvedSpec, opts ...Option) []Error {
	return c.ValidateSpec(resolved.Fields, append(slices.Clone(opts), func(o *options) { o.resolved = true })...)
}

// searchWeights are the values config.search accepts.
var searchWeights = map[string]bool{"off": true, "A": true, "B": true, "C": true, "D": true} //nolint:gochecknoglobals

// validateFields validates a list of Fields at list, the path of the list
// itself — "" for the root, ".../children" for a Field's children — sitting in
// position.
func (c *Catalogue) validateFields(fields []Field, list, position string, o *options, errs *[]Error) {
	for _, f := range fields {
		path := joinPath(list, f.Config.APIAccessor)
		t, known := c.Type(f.FieldType)
		if !known {
			*errs = append(*errs, Error{
				Path:   path,
				Code:   CodeUnknownFieldType,
				Params: map[string]any{"field_type": f.FieldType},
			})
		} else {
			settingsPath := joinPath(path, "settings")
			for _, e := range c.ValidateSettings(f.FieldType, f.Settings) {
				e.Path = settingsPath + e.Path
				*errs = append(*errs, e)
			}
			if !c.allowsPosition(f.FieldType, position) {
				*errs = append(*errs, Error{
					Path:   path,
					Code:   CodePosition,
					Params: map[string]any{"position": position, "field_type": f.FieldType},
				})
			}
		}
		if strings.HasPrefix(f.Config.APIAccessor, "_") {
			*errs = append(*errs, Error{Path: path, Code: CodeReservedAccessor})
		}
		if f.Config.Search != "" {
			searchPath := joinPath(path, "config", "search")
			switch {
			case !searchWeights[f.Config.Search]:
				*errs = append(*errs, Error{Path: searchPath, Code: CodeInvalidConfig})
			case known && !t.HasText:
				*errs = append(*errs, Error{Path: searchPath, Code: CodeSearchWithoutText})
			}
		}
		rules := c.rulesFor(f.FieldType)
		if rules.field != nil {
			settings, _ := canonicalSettings(f.Settings)
			for _, e := range rules.field(c, f, settings, o.resolved) {
				e.Path = path + e.Path
				*errs = append(*errs, e)
			}
		}
		if o.policy != nil {
			for _, e := range o.policy(f, path, position) {
				e.Path = path + e.Path
				*errs = append(*errs, e)
			}
		}
		if len(f.Children) > 0 {
			childPosition := position
			if rules.childrenPosition != "" {
				childPosition = rules.childrenPosition
			}
			c.validateFields(f.Children, joinPath(path, "children"), childPosition, o, errs)
		}
		if rules.specs != nil {
			held, specErrs := rules.specs(f.Settings)
			for _, e := range specErrs {
				e.Path = path + e.Path
				*errs = append(*errs, e)
			}
			for _, h := range held {
				c.validateFields(h.fields, path+h.path, h.position, o, errs)
			}
		}
	}
}
