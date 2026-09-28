package fieldkit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
)

// Pin is one Pin a Spec holds: the fixed Release a setting names, and of
// what kind (ADR-0020). A Pin never names a Revision, and never "latest".
type Pin struct {
	// Path is the setting holding it: "/address/settings/blueprint". A Pin
	// in a Block Type's Fields is at
	// "/content/settings/allowed_blocks/0/fields/address/settings/blueprint".
	Path string `json:"path"`
	// Kind is what the Release is of, as the Catalogue records it:
	// "blueprint" for a Blueprint Release. Every other kind is an opaque
	// part (a Text Type, a Typesetting Instruction Set).
	Kind string `json:"kind"`
	// Release is the Release's id, opaque to fieldkit.
	Release string `json:"release"`
}

// ResolvedSpec is a Spec whose every Pin is resolved (ADR-0020), so a reader
// never follows a second one.
type ResolvedSpec struct {
	// Catalogue is the version of the Catalogue it was resolved against —
	// the fieldkit version a reader must know.
	Catalogue string `json:"catalogue"`
	// Vocabulary is the knkeditor vocabulary version its rich text needs, ""
	// when it pins no rich-text part. No Field Type pins one yet.
	Vocabulary string `json:"vocabulary"`
	// Fields are the Spec with every pinned Blueprint Release inlined as the
	// pinning Field's children. The Field keeps its Pin.
	Fields Spec `json:"fields"`
	// Parts are the opaque parts it pins, each stored once however many
	// Fields pin it, by kind and then Release id. The Field keeps its Pin, and
	// fieldkit never looks inside a part.
	Parts map[string]map[string]json.RawMessage `json:"parts"`
}

// Part is the opaque part a Pin names, or nil when the Resolved Spec holds
// none.
func (r *ResolvedSpec) Part(kind, release string) json.RawMessage {
	return r.Parts[kind][release]
}

// DecodeResolvedSpec decodes a Resolved Spec strictly, as DecodeSpec decodes
// a Spec.
func DecodeResolvedSpec(data []byte) (*ResolvedSpec, error) {
	var r ResolvedSpec
	if err := decodeStrict(data, &r); err != nil {
		return nil, fmt.Errorf("fieldkit: decode resolved spec: %w", err)
	}
	if r.Fields == nil {
		r.Fields = Spec{}
	}
	if r.Parts == nil {
		r.Parts = map[string]map[string]json.RawMessage{}
	}
	return &r, nil
}

// Fetcher is the port Resolve fetches Releases through; the service
// implements it (blueprinthub, when it cuts a Blueprint Release).
//
// Fetch returns the Release a Pin names, as JSON: for a "blueprint" Pin, the
// Blueprint Release's Fields — a Spec, decoded strictly as DecodeSpec decodes
// it (a Release already resolved is fine: its resolved Fields are left
// alone). TS has no strict Field decoder and refuses only a Release that is
// not a list of objects with a config object, so a stray property is
// CodeResolveInvalidRelease here and nothing in TS — the gap DecodeSpec has
// with TS everywhere. For any other kind the part itself, which Resolve stores in
// Parts unread. An error fails Resolve with CodeResolveFetchFailed, wrapping
// it.
type Fetcher interface {
	Fetch(ctx context.Context, kind, release string) (json.RawMessage, error)
}

// FetcherFunc adapts a function to a Fetcher.
type FetcherFunc func(ctx context.Context, kind, release string) (json.RawMessage, error)

// Fetch calls f.
func (f FetcherFunc) Fetch(ctx context.Context, kind, release string) (json.RawMessage, error) {
	return f(ctx, kind, release)
}

// The caps Resolve applies unless a caller sets its own.
const (
	// DefaultMaxFetches is how many distinct Releases one Resolve fetches
	// at most (TS RESOLVE_CAPS.maxFetches).
	DefaultMaxFetches = 256
	// DefaultMaxDepth is how deeply Pins may nest: a Pin in the Spec is at
	// depth 1, a Pin in a Release it pins at depth 2 (TS
	// RESOLVE_CAPS.maxDepth).
	DefaultMaxDepth = 8
)

// ResolveOption configures Resolve.
type ResolveOption func(*resolveOptions)

type resolveOptions struct {
	maxFetches int
	maxDepth   int
}

// WithMaxFetches sets how many distinct Releases Resolve fetches at most.
func WithMaxFetches(n int) ResolveOption {
	return func(o *resolveOptions) { o.maxFetches = n }
}

// WithMaxDepth sets how deeply Pins may nest.
func WithMaxDepth(n int) ResolveOption {
	return func(o *resolveOptions) { o.maxDepth = n }
}

// ResolveError is why Resolve failed: a code from the data contract and the
// Pin it failed at.
type ResolveError struct {
	// Code is CodeResolveCycle, CodeResolveTooManyFetches,
	// CodeResolveTooDeep, CodeResolveFetchFailed or
	// CodeResolveInvalidRelease.
	Code string
	// Pin is the Pin being resolved. Its Path runs through the Releases
	// inlined above it: "/a/children/b/settings/blueprint".
	Pin Pin
	// Err is the fetcher's error, or why a Release did not decode.
	Err error
}

// Error formats the error as "path: code (kind release)".
func (e *ResolveError) Error() string {
	msg := fmt.Sprintf("fieldkit: resolve %s: %s (%s %q)", e.Pin.Path, e.Code, e.Pin.Kind, e.Pin.Release)
	if e.Err != nil {
		msg += ": " + e.Err.Error()
	}
	return msg
}

// Unwrap returns the underlying error.
func (e *ResolveError) Unwrap() error { return e.Err }

// Pins lists every Pin a Spec holds, in document order, against the embedded
// Catalogue: each setting the Catalogue records as a Pin that names a
// Release. It walks every Spec a Field holds, as ValidateSpec does —
// children, and a Block Type's Fields in settings — but fetches nothing, so
// the Pins inside a pinned Release are that Release's own.
func Pins(spec Spec) []Pin {
	return DefaultCatalogue().Pins(spec)
}

// Pins is the package-level Pins against this Catalogue.
func (c *Catalogue) Pins(spec Spec) []Pin {
	pins := []Pin{}
	c.collectPins(spec, "", &pins)
	return pins
}

func (c *Catalogue) collectPins(fields []Field, list string, pins *[]Pin) {
	for _, f := range fields {
		path := joinPath(list, f.Config.APIAccessor)
		if t, ok := c.Type(f.FieldType); ok && len(t.Pins) > 0 {
			settings, _ := canonicalSettings(f.Settings)
			for _, p := range t.Pins {
				if release := pinRelease(settings, p.Key); release != "" {
					*pins = append(*pins, Pin{Path: joinPath(path, "settings", p.Key), Kind: p.Kind, Release: release})
				}
			}
		}
		if len(f.Children) > 0 {
			c.collectPins(f.Children, joinPath(path, "children"), pins)
		}
		if specs := rulesFor(f.FieldType).specs; specs != nil {
			held, _ := specs(f.Settings)
			for _, h := range held {
				c.collectPins(h.fields, path+h.path, pins)
			}
		}
	}
}

// Resolve resolves every Pin in a Spec against the embedded Catalogue
// (ADR-0020), fetching each Release through fetcher:
//
//   - a pinned Blueprint Release is inlined as the pinning Field's children,
//     and the Pins inside it are resolved in turn. A Field that already has
//     children is resolved already — or, for a Virtual Table, embeds its Row
//     Spec — and is left alone, so resolving a Resolved Spec's Fields
//     fetches no Blueprint again;
//   - any other Pin names an opaque part, stored once in Parts;
//   - each Release is fetched once, however many Fields pin it.
//
// It walks every Spec a Field holds, a Block Type's Fields included. A Pin
// in a Release that pins, however indirectly, that Release is
// CodeResolveCycle; more than the maximum distinct fetches
// (DefaultMaxFetches, WithMaxFetches) is CodeResolveTooManyFetches; Pins
// nested deeper than the maximum depth (DefaultMaxDepth, WithMaxDepth) are
// CodeResolveTooDeep. Every failure is a *ResolveError.
//
// Resolve does not validate: run ValidateSpec on the authored Spec, and
// ValidateResolvedSpec on the result, which checks the Positions of what was
// inlined.
func Resolve(ctx context.Context, spec Spec, fetcher Fetcher, opts ...ResolveOption) (*ResolvedSpec, error) {
	return DefaultCatalogue().Resolve(ctx, spec, fetcher, opts...)
}

// Resolve is the package-level Resolve against this Catalogue.
func (c *Catalogue) Resolve(ctx context.Context, spec Spec, fetcher Fetcher, opts ...ResolveOption) (*ResolvedSpec, error) {
	o := resolveOptions{maxFetches: DefaultMaxFetches, maxDepth: DefaultMaxDepth}
	for _, opt := range opts {
		opt(&o)
	}
	r := &resolver{
		c:       c,
		ctx:     ctx,
		fetcher: fetcher,
		opts:    o,
		fetched: map[pinKey]json.RawMessage{},
		parts:   map[string]map[string]json.RawMessage{},
	}
	fields, _, err := r.fields(spec, "", nil)
	if err != nil {
		return nil, err
	}
	if fields == nil {
		fields = Spec{}
	}
	return &ResolvedSpec{
		Catalogue:  c.Version,
		Vocabulary: "",
		Fields:     fields,
		Parts:      r.parts,
	}, nil
}

// pinKey is a Release: a Pin without the place that holds it.
type pinKey struct{ kind, release string }

type resolver struct {
	c       *Catalogue
	ctx     context.Context
	fetcher Fetcher
	opts    resolveOptions
	// fetched holds each Release fetched so far.
	fetched map[pinKey]json.RawMessage
	parts   map[string]map[string]json.RawMessage
}

// fields resolves a list of Fields at list, inside the Blueprint Releases in
// chain. changed is whether any Field in it changed.
func (r *resolver) fields(fields []Field, list string, chain []pinKey) ([]Field, bool, error) {
	var out []Field
	for i, f := range fields {
		resolved, changed, err := r.field(f, joinPath(list, f.Config.APIAccessor), chain)
		if err != nil {
			return nil, false, err
		}
		if changed && out == nil {
			out = slices.Clone(fields)
		}
		if out != nil {
			out[i] = resolved
		}
	}
	if out == nil {
		return fields, false, nil
	}
	return out, true, nil
}

func (r *resolver) field(f Field, path string, chain []pinKey) (Field, bool, error) {
	changed := false
	inlined := false
	if t, ok := r.c.Type(f.FieldType); ok && len(t.Pins) > 0 {
		settings, _ := canonicalSettings(f.Settings)
		for _, p := range t.Pins {
			release := pinRelease(settings, p.Key)
			if release == "" {
				continue
			}
			pin := Pin{Path: joinPath(path, "settings", p.Key), Kind: p.Kind, Release: release}
			key := pinKey{p.Kind, release}
			if p.Kind != pinKindBlueprint {
				raw, err := r.fetch(pin, chain)
				if err != nil {
					return f, false, err
				}
				if r.parts[p.Kind] == nil {
					r.parts[p.Kind] = map[string]json.RawMessage{}
				}
				r.parts[p.Kind][release] = raw
				continue
			}
			// Children present is resolved already, or an embedded Row Spec
			// (ADR-0017): nothing to fetch.
			if f.Children != nil {
				continue
			}
			raw, err := r.fetch(pin, chain)
			if err != nil {
				return f, false, err
			}
			spec, err := DecodeSpec(raw)
			if err != nil {
				return f, false, &ResolveError{Code: CodeResolveInvalidRelease, Pin: pin, Err: err}
			}
			children, _, err := r.fields(spec, joinPath(path, "children"), append(slices.Clone(chain), key))
			if err != nil {
				return f, false, err
			}
			if children == nil {
				children = []Field{}
			}
			f.Children = children
			changed, inlined = true, true
		}
	}
	// Children not fetched here sit inside the same Releases this Field does.
	if !inlined && len(f.Children) > 0 {
		children, childChanged, err := r.fields(f.Children, joinPath(path, "children"), chain)
		if err != nil {
			return f, false, err
		}
		if childChanged {
			f.Children = children
			changed = true
		}
	}
	if specs := rulesFor(f.FieldType).specs; specs != nil {
		held, _ := specs(f.Settings)
		for _, h := range held {
			fields, heldChanged, err := r.fields(h.fields, path+h.path, chain)
			if err != nil {
				return f, false, err
			}
			if !heldChanged {
				continue
			}
			encoded, err := json.Marshal(fields)
			if err != nil {
				return f, false, err
			}
			settings, err := setRaw(f.Settings, h.at, encoded)
			if err != nil {
				return f, false, err
			}
			f.Settings = settings
			changed = true
		}
	}
	return f, changed, nil
}

// fetch returns the Release a Pin names, fetching it at most once per
// Resolve, after refusing a cycle, a Pin too deep and a fetch too many.
func (r *resolver) fetch(pin Pin, chain []pinKey) (json.RawMessage, error) {
	key := pinKey{pin.Kind, pin.Release}
	if slices.Contains(chain, key) {
		return nil, &ResolveError{Code: CodeResolveCycle, Pin: pin}
	}
	if len(chain)+1 > r.opts.maxDepth {
		return nil, &ResolveError{Code: CodeResolveTooDeep, Pin: pin}
	}
	if raw, ok := r.fetched[key]; ok {
		return raw, nil
	}
	if len(r.fetched) >= r.opts.maxFetches {
		return nil, &ResolveError{Code: CodeResolveTooManyFetches, Pin: pin}
	}
	if err := r.ctx.Err(); err != nil {
		return nil, &ResolveError{Code: CodeResolveFetchFailed, Pin: pin, Err: err}
	}
	raw, err := r.fetcher.Fetch(r.ctx, pin.Kind, pin.Release)
	if err != nil {
		return nil, &ResolveError{Code: CodeResolveFetchFailed, Pin: pin, Err: err}
	}
	if !json.Valid(raw) {
		return nil, &ResolveError{Code: CodeResolveInvalidRelease, Pin: pin, Err: errors.New("not JSON")}
	}
	r.fetched[key] = raw
	return raw, nil
}

// setRaw replaces the JSON value at segments inside raw — object keys, and
// array indices as decimal strings — and returns the result. Everything else
// is kept as it was, but an object's keys come back sorted.
func setRaw(raw json.RawMessage, segments []string, value json.RawMessage) (json.RawMessage, error) {
	if len(segments) == 0 {
		return value, nil
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		var items []json.RawMessage
		if err := json.Unmarshal(trimmed, &items); err != nil {
			return nil, err
		}
		i, err := strconv.Atoi(segments[0])
		if err != nil || i < 0 || i >= len(items) {
			return nil, fmt.Errorf("fieldkit: no item %q to set", segments[0])
		}
		item, err := setRaw(items[i], segments[1:], value)
		if err != nil {
			return nil, err
		}
		items[i] = item
		return json.Marshal(items)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &obj); err != nil {
		return nil, err
	}
	entry, err := setRaw(obj[segments[0]], segments[1:], value)
	if err != nil {
		return nil, err
	}
	obj[segments[0]] = entry
	return json.Marshal(obj)
}
