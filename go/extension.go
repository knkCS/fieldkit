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
	// HeldSpecs returns the Specs the Field holds in its settings rather
	// than in children, so ValidateSpec, Pins and Resolve walk them as they
	// walk children — each in its own Position (the built-in types' heldSpec,
	// exported: a Block Type's Fields, a Reference Spec). A setting that
	// should hold a Spec but does not decode as one is the hook's error to
	// report, at that setting, and is not walked. It receives the raw
	// settings; paths are relative to the Field.
	HeldSpecs func(settings json.RawMessage) ([]HeldSpec, []Error)
	// ChildrenPosition is the Position of the Fields in the type's
	// children — authored, or a pinned Blueprint Release Resolve inlined —
	// when it is not the Field's own (ADR-0022): a Virtual Table's children
	// are its Row Spec. "" means the container is transparent, and its
	// children sit where it does.
	ChildrenPosition string
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

	// The value-side container hooks: for a type whose value holds records
	// its own settings describe, the Go twins of a TS plugin's records and
	// mintIds (ADR-0007). A container hands what it holds back through them
	// and TypeEnv, and never learns the types of its children.

	// Records are the records the value holds, each with the Fields that
	// describe it, so Edges and Texts walk into them: heldRecords' answers
	// for a section type. Paths are relative to the value.
	Records func(f Field, settings map[string]any, value any, env TypeEnv) []HeldRecord
	// MintIDs gives every row or node the value holds an _id where it has
	// none, as MintIDs does for the built-in types, through env's MintTree
	// and MintRecord, and returns the value.
	MintIDs func(f Field, value any, env TypeEnv) any
}

// HeldRecord is one record a value holds — a row, a node's values — and the
// Fields that describe it. Path is the record's, relative to the value.
type HeldRecord struct {
	Fields []Field
	Record map[string]any
	Path   string
}

// TypeEnv is what a TypeCode hook is told beside the Field and its value, and
// the shared machinery it may hand what its value holds back to: the
// composer (ADR-0007), the rules a Reference Tree follows, and minting. Each
// method is for the hook it names.
type TypeEnv struct {
	// Parts are the Resolved Spec's parts, by kind and Release: what the
	// Field pins. Nil without a Resolved Spec (ValidateValue, ValueText).
	Parts map[string]map[string]json.RawMessage

	// ValidateFields is the composer (ADR-0007), for Value: it checks a
	// record the value holds against the Fields that describe it, each by
	// its own type — Unset and required, every container, the Catalogue's
	// sections — exactly as a group's row is checked. Paths are relative to
	// the record, which Value places inside its value. Nil outside Value.
	ValidateFields func(fields []Field, record map[string]any) []Error

	catalogue *Catalogue
	// errs is the Value run's, its base the value's absolute path.
	errs *valueErrors
	// targets is WithTargetBlueprints', nil when not given.
	targets func(contentID string) string
	// composer is the Compare or Merge run's.
	composer *composer
	// mint is the MintIDs run's.
	mint *mintEnv
}

// mintEnv is a MintIDs hook's place in the run: the minter, and the value's
// absolute path, which every id is derived from.
type mintEnv struct {
	minter minter
	path   string
}

// valueRun is a run a Value hook's composer calls join: the hook's own
// context, or a fresh one when the hook runs outside ValidateValue.
func (e TypeEnv) valueRun() *valueErrors {
	if e.errs != nil && e.errs.ctx != nil {
		return &valueErrors{ctx: e.errs.ctx}
	}
	return &valueErrors{ctx: &valueContext{catalogue: e.catalogue, richText: &richTextContext{}, targetBlueprint: e.targets}}
}

// base is the absolute path of the value a Value hook checks.
func (e TypeEnv) base() string {
	if e.errs != nil {
		return e.errs.base
	}
	return ""
}

// relative returns a run's errors relative to the value, as a Value hook
// returns its own.
func (e TypeEnv) relative(run *valueErrors) []Error {
	base := e.base()
	out := make([]Error, 0, len(run.list))
	for _, err := range run.list {
		err.Path = strings.TrimPrefix(err.Path, base)
		out = append(out, err)
	}
	return out
}

// ValidateTree checks a tree value by the rules a Reference Tree follows
// (ADR-0023): an array of nodes, each an object (CodeInvalidType) with an
// _id as a row's (CodeMissingID, CodeInvalidType, CodeTooBig) unique across
// every level (CodeDuplicateID at each repeat), its branch, if any, a list
// in children (CodeInvalidType); settings.max_items counting every node at
// every level (CodeTooManyItems at the value) and settings.max_depth the
// levels (CodeInvalidValue at each shallowest node past it). node checks each
// node's own keys, at the node's path relative to the value. For a Value
// hook.
func (e TypeEnv) ValidateTree(settings map[string]any, value any, node func(node map[string]any, path string) []Error) []Error {
	run := e.valueRun()
	base := e.base()
	treeValue(settings, value, base, run, func(obj map[string]any, at string, run *valueErrors) {
		for _, err := range node(obj, strings.TrimPrefix(at, base)) {
			run.add(base+err.Path, err.Code, err.Params)
		}
	})
	return e.relative(run)
}

// ReferenceValues checks a Reference node's values, at path plus "values"
// relative to the value, against its Reference Spec as a Reference Field's
// are (ReferenceSpecFor): the one its target's Blueprint has, where the
// settings link one and WithTargetBlueprints says whose the target is; an
// opaque record where that cannot be known. A missing record is an empty one.
// For a Value hook.
func (e TypeEnv) ReferenceValues(settings map[string]any, node map[string]any, path string) []Error {
	run := e.valueRun()
	referenceValues(settings, node, e.base()+path, run)
	return e.relative(run)
}

// TargetBlueprint is the Blueprint of a referenced Content, by its id, as
// WithTargetBlueprints says — "" when not known or not given.
func (e TypeEnv) TargetBlueprint(contentID string) string {
	targets := e.targets
	if targets == nil && e.errs != nil && e.errs.ctx != nil {
		targets = e.errs.ctx.targetBlueprint
	}
	if targets == nil {
		return ""
	}
	return targets(contentID)
}

// CompareTree compares two tree values node by node, by _id, as a Reference
// Tree compares (docs/compare-and-merge.md): one CompareItem per node at
// every level, a node's parent its _parent field, moved when its place among
// its siblings changed. fieldsOf describes a node's record, given the node as
// each side holds it, so its keys compare finer than whole values — its
// values as a fieldset of the Spec they follow. For a Compare hook.
func (e TypeEnv) CompareTree(f Field, a, b any, fieldsOf func(nodes ...map[string]any) []Field) (bool, *CompareDetail, error) {
	c := e.composer
	if c == nil {
		c = &composer{catalogue: e.catalogue, parts: e.Parts, richText: &richTextContext{parts: e.Parts}}
	}
	return compareTree(c, &f, a, b, fieldsOf)
}

// MergeTree three-way merges three tree values per node, by _id, as a
// Reference Tree merges (ADR-0023): per node and per field of it, its parent
// and its place among its siblings included. Its conflicts are paths
// relative to the value, as a Merge hook returns them. For a Merge hook.
func (e TypeEnv) MergeTree(f Field, base, ours, theirs any, fieldsOf func(nodes ...map[string]any) []Field) (any, []string, error) {
	c := &composer{catalogue: e.catalogue, parts: e.Parts}
	if e.composer != nil {
		c.catalogue, c.parts, c.richText = e.composer.catalogue, e.composer.parts, e.composer.richText
	}
	if c.richText == nil {
		c.richText = &richTextContext{parts: c.parts}
	}
	merged, err := mergeTree(c, &f, base, ours, theirs, "", fieldsOf)
	if err != nil {
		return nil, nil, err
	}
	conflicts := make([]string, 0, len(c.conflicts))
	for _, at := range c.conflicts {
		conflicts = append(conflicts, "/"+at)
	}
	return merged, conflicts, nil
}

// MintTree gives every node of a tree value, at every level, the _id of its
// place where it has none — as MintIDs mints a Reference Tree's. For a
// MintIDs hook.
func (e TypeEnv) MintTree(value any) {
	if e.mint != nil {
		e.mint.minter.nodes(value, e.mint.path)
	}
}

// MintRecord mints into the values a record the value holds — at path,
// relative to the value — keeps for its Fields: their rows, and their rows'
// Fields'. For a MintIDs hook.
func (e TypeEnv) MintRecord(fields []Field, record map[string]any, path string) {
	if e.mint != nil {
		e.mint.minter.record(fields, record, e.mint.path+path)
	}
}

// EachTreeNode visits every node of a tree value that is an object, in
// document order, at its path relative to the value: its _id segment
// (ADR-0023) — its index where it has no usable one — through children.
func EachTreeNode(value any, visit func(node map[string]any, path string)) {
	eachReferenceNode(value, "", visit)
}

// ReferenceSpecFor is the Reference Spec of a Reference whose target is of
// blueprint, read from a Field's canonical settings — blueprints, spec — as
// every Reference Field reads it (ADR-0008, amended): a linked one replaces
// the embedded spec, never merged. known is false when it cannot be known:
// the settings link a Reference Spec and blueprint is "", or the linked Spec
// is not resolved.
func ReferenceSpecFor(settings map[string]any, blueprint string) (fields []Field, known bool) {
	return referenceSpecFor(settings, blueprint)
}

// ReferenceSettings reports the rules across a Reference Field's settings its
// schema cannot state, for a type that shares them: a Blueprint two
// blueprints entries name (CodeDuplicateBlueprint), an entry's spec without a
// spec_blueprint (CodeInvalidSetting). Paths are relative to the settings.
func ReferenceSettings(settings any) []Error {
	return referenceSettings(settings)
}

// ReferenceSpecs are the Reference Specs a Field's raw settings hold — the
// embedded spec and each blueprints entry's linked one once resolved — in the
// reference_spec Position, for a type that shares a Reference Field's
// settings (its HeldSpecs); and CodeInvalidSetting at a list that does not
// decode as Fields.
func ReferenceSpecs(settings json.RawMessage) ([]HeldSpec, []Error) {
	held, errs := referenceSpecs(settings)
	out := make([]HeldSpec, 0, len(held))
	for _, h := range held {
		out = append(out, HeldSpec{Path: h.path, At: h.at, Fields: h.fields, Position: h.position})
	}
	return out, errs
}

// DecodeFieldList decodes a list of Fields held in settings strictly, as
// DecodeSpec decodes a Spec, each item an object with a config object; false
// when any item is not one.
func DecodeFieldList(items []json.RawMessage) ([]Field, bool) {
	return decodeFieldList(items)
}

// HeldSpec is one Spec a Field holds in its settings, and where: what a
// TypeCode's HeldSpecs returns.
type HeldSpec struct {
	// Path is the list's path relative to the Field:
	// "/settings/allowed_blocks/0/fields". A Field in it is at Path plus its
	// Accessor.
	Path string
	// At is the list's segments inside the Field's settings:
	// {"allowed_blocks", "0", "fields"}. Resolve writes a resolved list back
	// there.
	At []string
	// Fields are the Spec.
	Fields []Field
	// Position is the Position its Fields sit in (ADR-0022).
	Position string
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
		rules := typeRules{settings: tc.Settings, childrenPosition: tc.ChildrenPosition}
		if tc.HeldSpecs != nil {
			rules.specs = func(settings json.RawMessage) ([]heldSpec, []Error) {
				held, errs := tc.HeldSpecs(settings)
				out := make([]heldSpec, 0, len(held))
				for _, h := range held {
					out = append(out, heldSpec{path: h.Path, at: h.At, fields: h.Fields, position: h.Position})
				}
				return out, errs
			}
		}
		return rules
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
		env := TypeEnv{catalogue: c, errs: errs, ValidateFields: func(fields []Field, record map[string]any) []Error {
			sub := &valueErrors{ctx: errs.ctx}
			validateFields(fields, record, "", sub)
			return sub.list
		}}
		if errs.ctx != nil {
			env.targets = errs.ctx.targetBlueprint
			if errs.ctx.richText != nil {
				env.Parts = errs.ctx.richText.parts
			}
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
		return tc.Edges(f, settings, value, TypeEnv{Parts: parts, catalogue: c})
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
		return tc.Text(f, settings, value, TypeEnv{Parts: parts, catalogue: c})
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
			return tc.Compare(*f, a, b, TypeEnv{Parts: k.parts, catalogue: c, composer: k})
		},
		merge: func(k *composer, f *Field, base, ours, theirs any, path string) (any, error) {
			if tc.Merge == nil {
				k.conflict(path)
				return nil, nil
			}
			merged, conflicts, err := tc.Merge(*f, base, ours, theirs, TypeEnv{Parts: k.parts, catalogue: c, composer: k})
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
