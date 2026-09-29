package fieldkit

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Comparer is one Field Type's Compare, in versionkit's shape: its method is
// exactly versionkit's FieldType's, typed only with standard types, so a
// Comparer is a versionkit.FieldType without fieldkit importing versionkit
// (versionkit ADR 0002).
//
// settings are a SchemaField's Settings, handed back unchanged; a and b are
// two present values of the Field, as stored. equal says that they are the
// same value for the Field's type whatever their spelling — 1 and 1.0, keys
// in any order, a key holding an Unset value and no key (ADR-0021). detail is
// the finer description of the difference (docs/compare-and-merge.md): nil
// for a type compared as a whole value, and whenever equal. err is a failure —
// settings that are not a SchemaSettings, a value that is not JSON or not what
// its type holds — never a difference.
type Comparer interface {
	Compare(settings, a, b json.RawMessage) (equal bool, detail json.RawMessage, err error)
}

// Merger is a Comparer that merges finer than a whole value: versionkit's
// FieldMerger, structurally. The types that hold rows, nodes or a record —
// group, virtual_table, blocks, fieldset, reference, single_reference — are
// Mergers, and so is rich_text, which knkeditor merges node by node; every
// other type is a Comparer only, and versionkit merges it as a whole value.
//
// Merge three-way merges three present values of the Field. It returns the
// merged value when clean, or the conflicting paths within the value when not
// (merged is then nil): /-separated, without a leading /, each segment an
// Accessor, a row's or node's _id, _parent for a tree node's parent, or
// _order for the order of a row array or a node's children; inside a
// rich_text value, a top-level node's id (or knkeditor's JSON Pointer) —
// versionkit prefixes the Field's Accessor. err is a failure, never a
// Conflict.
type Merger interface {
	Comparer
	Merge(settings, base, ours, theirs json.RawMessage) (merged json.RawMessage, conflicts []string, err error)
}

// SchemaField is one entry of versionkit's Schemas.Fields, in standard types:
// a service copies each property into a versionkit.Field.
type SchemaField struct {
	// Accessor is the Field's key in the data.
	Accessor string
	// TypeID is the Field's field_type.
	TypeID string
	// Settings are a SchemaSettings encoded as JSON: the whole resolved Field
	// and the parts it pins, which Type reads back.
	Settings json.RawMessage
	// Type compares the Field's values; it is a Merger when the type merges
	// finer than a whole value. It holds no state: everything it knows comes
	// from Settings.
	Type Comparer
}

// SchemaSettings is what a SchemaField's Settings hold (fieldkit#201): the
// whole resolved Field, not only its settings, so a container reaches its
// children, and the opaque parts it pins at any depth, so a nested rich_text
// reaches its Text Type without the Resolved Spec.
type SchemaSettings struct {
	// Field is the resolved Field, its pinned Blueprint Releases inlined as
	// its children.
	Field Field `json:"field"`
	// Parts are the opaque parts the Field pins, at any depth, by kind and
	// then Release id, as ResolvedSpec.Parts holds them. Absent when it pins
	// none.
	Parts map[string]map[string]json.RawMessage `json:"parts,omitempty"`
}

// DecodeSchemaSettings decodes a SchemaField's Settings strictly, as
// DecodeSpec decodes a Spec.
func DecodeSchemaSettings(data json.RawMessage) (*SchemaSettings, error) {
	var s SchemaSettings
	if err := decodeStrict(data, &s); err != nil {
		return nil, fmt.Errorf("fieldkit: decode schema settings: %w", err)
	}
	return &s, nil
}

// SchemaFields turns a Resolved Spec into versionkit's Schemas.Fields entries
// (ADR-0023, fieldkit#201), in the Spec's order: one per top-level Field that
// holds a value — the Markers hold none. Each carries its Field and pinned
// parts in Settings, and a Type that compares — and, for the row and record
// types, merges — its values. fieldkit never imports versionkit: a service
// builds its versionkit.Field from each entry by assignment, and hands the
// Resolved Spec's entries back from its Schemas.Fields.
func SchemaFields(resolved *ResolvedSpec) ([]SchemaField, error) {
	return DefaultCatalogue().SchemaFields(resolved)
}

// SchemaFields is the package-level SchemaFields against this Catalogue, which
// says which settings pin a part.
func (c *Catalogue) SchemaFields(resolved *ResolvedSpec) ([]SchemaField, error) {
	if resolved == nil {
		return nil, errors.New("fieldkit: schema fields: no Resolved Spec")
	}
	out := make([]SchemaField, 0, len(resolved.Fields))
	for _, f := range resolved.Fields {
		if markerTypes[f.FieldType] {
			continue
		}
		settings := SchemaSettings{Field: f}
		for _, pin := range c.Pins(Spec{f}) {
			part, ok := resolved.Parts[pin.Kind][pin.Release]
			if !ok || pin.Kind == pinKindBlueprint {
				continue
			}
			if settings.Parts == nil {
				settings.Parts = map[string]map[string]json.RawMessage{}
			}
			if settings.Parts[pin.Kind] == nil {
				settings.Parts[pin.Kind] = map[string]json.RawMessage{}
			}
			settings.Parts[pin.Kind][pin.Release] = part
		}
		raw, err := json.Marshal(settings)
		if err != nil {
			return nil, fmt.Errorf("fieldkit: schema fields: %s: %w", f.Config.APIAccessor, err)
		}
		out = append(out, SchemaField{
			Accessor: f.Config.APIAccessor,
			TypeID:   f.FieldType,
			Settings: raw,
			Type:     c.typeFor(f.FieldType),
		})
	}
	return out, nil
}

// typeFor is the Type a Field Type's values compare and merge by. A
// Catalogue section's type that compares finer but has no Merge of its own is
// a whole-value Type to versionkit, which then merges it as a whole value.
func (c *Catalogue) typeFor(fieldType string) Comparer {
	if _, finer := finerRuleFor(fieldType); finer {
		return finerValueType{wholeValueType{c}}
	}
	if tc, ok := c.codeOf(fieldType); ok && tc.Compare != nil && tc.Merge != nil {
		return finerValueType{wholeValueType{c}}
	}
	return wholeValueType{c}
}

// wholeValueType compares any Field by the composer, which for every type
// without a finer rule is equality of the whole value. It has no Merge, so
// versionkit merges such a Field as a whole value. catalogue is the one
// SchemaFields ran against, whose sections' types compare by their code.
type wholeValueType struct{ catalogue *Catalogue }

// Compare compares a and b under settings.
func (t wholeValueType) Compare(settings, a, b json.RawMessage) (bool, json.RawMessage, error) {
	s, err := DecodeSchemaSettings(settings)
	if err != nil {
		return false, nil, err
	}
	va, err := decodeStored(t.catalogue, s.Field, a)
	if err != nil {
		return false, nil, err
	}
	vb, err := decodeStored(t.catalogue, s.Field, b)
	if err != nil {
		return false, nil, err
	}
	c := composer{catalogue: t.catalogue, parts: s.Parts}
	equal, detail, err := c.compare(&s.Field, va, vb)
	if err != nil || equal || detail == nil {
		return equal, nil, err
	}
	raw, err := json.Marshal(detail)
	if err != nil {
		return false, nil, fmt.Errorf("fieldkit: compare: %w", err)
	}
	return false, raw, nil
}

// finerValueType is a type with a finer rule — holding rows or a record, or
// rich_text: it compares with detail and merges per row and per child Field,
// or rich text per top-level node.
type finerValueType struct{ wholeValueType }

// Merge three-way merges base, ours and theirs under settings.
func (t finerValueType) Merge(settings, base, ours, theirs json.RawMessage) (json.RawMessage, []string, error) {
	s, err := DecodeSchemaSettings(settings)
	if err != nil {
		return nil, nil, err
	}
	values := make([]any, 3)
	for i, raw := range []json.RawMessage{base, ours, theirs} {
		if values[i], err = decodeStored(t.catalogue, s.Field, raw); err != nil {
			return nil, nil, err
		}
	}
	c := composer{catalogue: t.catalogue, parts: s.Parts}
	merged, err := c.merge(&s.Field, values[0], values[1], values[2], "")
	if err != nil {
		return nil, nil, err
	}
	if len(c.conflicts) > 0 {
		return nil, c.conflicts, nil
	}
	raw, err := encodeValue(merged)
	if err != nil {
		return nil, nil, fmt.Errorf("fieldkit: merge: %w", err)
	}
	return raw, nil, nil
}
