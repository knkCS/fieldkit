package fieldkit

import (
	"bytes"
	"encoding/json"
	"errors"
)

// The walk Edges and Texts share: every Field of a Resolved Spec with the
// value the data holds for it, at every depth. A container hands what it
// holds back to the walk as records, each with the Fields that describe it —
// the composer ADR-0007 gives validation, here for reading — so neither
// walker learns a container's name, and a type that both holds records and
// yields edges (a Reference, #215) plugs into both at once.

// heldRecord is one record a container's value holds: a row, a Block, a
// Fieldset's record. fields describe it; path is its own.
type heldRecord struct {
	fields []Field
	record map[string]any
	path   string
}

// heldRecords are the records a container Field's value holds, each Go's
// reading of what the type's toZodType composes its children into:
//
//   - group, virtual_table: each row, against children, at its _id;
//   - blocks: each Block, against the Fields of the Block Type its _type
//     names, at its _id — a Block naming none holds no Fields;
//   - fieldset: its one record, against children, at the Field's own path;
//   - reference, single_reference: each node's values, against its Reference
//     Spec, at the node's path plus "values" — chosen by the target's
//     Blueprint through targets (WithTargetBlueprints) where the Field links
//     a Reference Spec, and none where that cannot be known.
//
// A Catalogue section's type holds what its TypeCode's Records say.
//
// A type holding none, or a value not of its type's shape, holds none: the
// walk reads what ValidateValue accepted and never reports.
func (c *Catalogue) heldRecords(f Field, settings map[string]any, value any, path string, targets func(string) string) []heldRecord {
	switch f.FieldType {
	case "group", "virtual_table":
		return rowRecords(value, path, func(map[string]any) []Field { return f.Children })
	case "blocks":
		types := blockTypes(settings)
		return rowRecords(value, path, func(block map[string]any) []Field {
			typ, ok := block["_type"].(string)
			if !ok {
				return nil
			}
			for _, bt := range types {
				if bt.typed && bt.typ == typ {
					return bt.fields
				}
			}
			return nil
		})
	case "fieldset":
		if record, ok := value.(map[string]any); ok && f.Children != nil {
			return []heldRecord{{fields: f.Children, record: record, path: path}}
		}
	case "reference", "single_reference":
		return referenceRecords(f, settings, value, path, targets)
	}
	if tc, ok := c.codeOf(f.FieldType); ok && tc.Records != nil {
		var records []heldRecord
		for _, r := range tc.Records(f, settings, value, TypeEnv{catalogue: c, targets: targets}) {
			records = append(records, heldRecord{fields: r.Fields, record: r.Record, path: path + r.Path})
		}
		return records
	}
	return nil
}

// rowRecords are the rows of a row array, each at its path segment
// (ADR-0023) and described by fieldsOf(row).
func rowRecords(value any, path string, fieldsOf func(map[string]any) []Field) []heldRecord {
	rows, ok := value.([]any)
	if !ok {
		return nil
	}
	segments := itemSegments(rows)
	records := make([]heldRecord, 0, len(rows))
	for i, row := range rows {
		obj, ok := row.(map[string]any)
		if !ok {
			continue
		}
		if fields := fieldsOf(obj); len(fields) > 0 {
			records = append(records, heldRecord{fields: fields, record: obj, path: joinPath(path, segments[i])})
		}
	}
	return records
}

// fieldVisit is called with each Field the walk reaches and its value —
// canonical and not Unset — at the value's path. settings are the Field's
// canonical settings ({} when Unset). hidden says the Field is hidden, or
// sits inside a hidden Field (#223 D4).
type fieldVisit func(f Field, settings map[string]any, value any, path string, hidden bool)

// walkFields visits every Field of a record that holds a value, in Spec
// order, and then — through heldRecords — every Field of what it holds, at
// every depth. Markers are skipped, as ValidateValue skips them: the walk
// reads exactly what validation checked, a hidden Field included (#223 D4).
// A Field whose value is absent is not visited. inHidden says the record sits
// inside a hidden Field.
func (c *Catalogue) walkFields(fields []Field, record map[string]any, path string, targets func(string) string, inHidden bool, visit fieldVisit) {
	for _, f := range fields {
		if markerTypes[f.FieldType] {
			continue
		}
		value, present := record[f.Config.APIAccessor]
		if !present {
			continue
		}
		settings, _ := canonicalSettings(f.Settings)
		settingsObj, _ := settings.(map[string]any)
		if settingsObj == nil {
			settingsObj = map[string]any{}
		}
		at := joinPath(path, f.Config.APIAccessor)
		hidden := inHidden || isHidden(f)
		visit(f, settingsObj, value, at, hidden)
		for _, held := range c.heldRecords(f, settingsObj, value, at, targets) {
			c.walkFields(held.fields, held.record, held.path, targets, hidden, visit)
		}
	}
}

// errDataNotObject is why a walker refuses data: it is not one JSON object.
var errDataNotObject = errors.New("data is not a JSON object") //nolint:gochecknoglobals

// walkData decodes a Content's stored data as ValidateValue reads it —
// numbers as JS reads them, Unset stripped at every depth — and walks it
// against a Resolved Spec's Fields. Empty data is {}. A nil Resolved Spec has
// no Fields.
func (c *Catalogue) walkData(resolved *ResolvedSpec, data json.RawMessage, opts []ValueOption, visit fieldVisit) error {
	var raw any = map[string]any{}
	if len(bytes.TrimSpace(data)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber()
		if err := dec.Decode(&raw); err != nil || dec.More() {
			return errDataNotObject
		}
		raw = toFloats(raw)
	}
	decoded, ok := raw.(map[string]any)
	if !ok {
		return errDataNotObject
	}
	if resolved == nil {
		return nil
	}
	targets := valueOptionsOf(opts).targetBlueprint
	obj, _ := stripUnsetAround(decoded, "", c.documentPaths(resolved.Fields, decoded, targets)).(map[string]any)
	c.walkFields(resolved.Fields, obj, "", targets, false, visit)
	return nil
}
