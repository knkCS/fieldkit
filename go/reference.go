package fieldkit

import (
	"encoding/json"
	"strconv"
)

// The Reference types, reference and single_reference (ADR-0008, amended):
// the rules across their settings, the Reference Spec they hold, their
// values, edges and records, minting and — in compare.go's terms — their
// finer Compare and Merge. A node is {_id, id, pin?, values?, children?}: no
// label, no Blueprint id, and values keyed by Accessor. TS's
// src/schema/reference-plugin.ts is the other half.

// EdgeReference points at the Content a Reference names, narrowed by its Pin.
const EdgeReference = "reference"

// referenceSpecPosition is where every Reference Spec's Fields sit.
const referenceSpecPosition = PositionReferenceSpec

// referenceRules are the rules of both Reference types.
var referenceRules = typeRules{settings: referenceSettings, specs: referenceSpecs} //nolint:gochecknoglobals

// referenceSettings reports the rules across a Reference Field's settings its
// schema cannot state:
//
//   - two blueprints entries naming one Blueprint give its References two
//     Reference Specs: CodeDuplicateBlueprint at each repeat's blueprint;
//   - an entry's spec is the linked Reference Spec a Resolve inlined, so one
//     without a spec_blueprint links nothing: CodeInvalidSetting at it.
//
// Paths are relative to the settings.
func referenceSettings(settings any) []Error {
	obj, _ := settings.(map[string]any)
	entries, _ := obj["blueprints"].([]any)
	var errs []Error
	seen := map[string]bool{}
	for i, item := range entries {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		at := joinPath("", "blueprints", strconv.Itoa(i))
		if blueprint, ok := named(entry["blueprint"]); ok {
			if seen[blueprint] {
				errs = append(errs, Error{Path: joinPath(at, "blueprint"), Code: CodeDuplicateBlueprint})
			} else {
				seen[blueprint] = true
			}
		}
		// A spec that is not a list is the schema's to report.
		_, list := entry["spec"].([]any)
		if _, linked := named(entry["spec_blueprint"]); !linked && list {
			errs = append(errs, Error{Path: joinPath(at, "spec"), Code: CodeInvalidSetting})
		}
	}
	return errs
}

// named is a string that names something — not blank, as JS trims it.
func named(value any) (string, bool) {
	s, ok := value.(string)
	return s, ok && trimJS(s) != ""
}

// referenceSpecs are the Reference Specs a Reference Field holds in its
// settings: the embedded spec, and each blueprints entry's linked one once
// resolved — all in the reference_spec Position (ADR-0022). A list that does
// not decode as Fields is CodeInvalidSetting at it — for an entry without a
// spec_blueprint, referenceSettings has said so already.
func referenceSpecs(raw json.RawMessage) ([]heldSpec, []Error) {
	var settings map[string]json.RawMessage
	if json.Unmarshal(raw, &settings) != nil {
		return nil, nil
	}
	var held []heldSpec
	var errs []Error
	add := func(list json.RawMessage, at []string, report bool) {
		var items []json.RawMessage
		if json.Unmarshal(list, &items) != nil || len(items) == 0 {
			return
		}
		path := joinPath("", append([]string{"settings"}, at...)...)
		fields, ok := decodeFieldList(items)
		if !ok {
			if report {
				errs = append(errs, Error{Path: path, Code: CodeInvalidSetting})
			}
			return
		}
		held = append(held, heldSpec{path: path, at: at, fields: fields, position: referenceSpecPosition})
	}
	add(settings["spec"], []string{"spec"}, true)
	var entries []json.RawMessage
	if json.Unmarshal(settings["blueprints"], &entries) == nil {
		for i, item := range entries {
			var entry map[string]json.RawMessage
			if json.Unmarshal(item, &entry) != nil {
				continue
			}
			var link any
			_ = json.Unmarshal(entry["spec_blueprint"], &link)
			_, linked := named(link)
			add(entry["spec"], []string{"blueprints", strconv.Itoa(i), "spec"}, linked)
		}
	}
	return held, errs
}

// referenceSpecFor is the Reference Spec of a Reference whose target is of
// blueprint, read from canonical settings — exactly one (ADR-0008, amended):
//
//   - a Field that links no Reference Spec has its embedded spec, for every
//     target;
//   - otherwise the blueprints entry for the target's Blueprint, when it
//     links one, replaces the embedded spec — its resolved spec, never merged;
//   - a target of any other Blueprint has the embedded spec.
//
// known is false when it cannot be known: the Field links a Reference Spec and
// blueprint is "", or the linked Spec is not resolved. TS's referenceSpecFor.
func referenceSpecFor(settings map[string]any, blueprint string) (fields []Field, known bool) {
	embedded := fieldsIn(settings["spec"])
	entries, _ := settings["blueprints"].([]any)
	var linked []map[string]any
	for _, item := range entries {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if _, ok := named(entry["blueprint"]); !ok {
			continue
		}
		if _, ok := named(entry["spec_blueprint"]); ok {
			linked = append(linked, entry)
		}
	}
	if len(linked) == 0 {
		return embedded, true
	}
	if blueprint == "" {
		return nil, false
	}
	for _, entry := range linked {
		if entry["blueprint"] == blueprint {
			if _, ok := entry["spec"].([]any); !ok {
				return nil, false
			}
			return fieldsIn(entry["spec"]), true
		}
	}
	return embedded, true
}

// linksReferenceSpec reports whether a Field links a Reference Spec for any
// Blueprint — whether a Reference's Spec depends on its target.
func linksReferenceSpec(settings map[string]any) bool {
	_, known := referenceSpecFor(settings, "")
	return !known
}

// fieldsIn decodes a canonical list of Fields leniently: nil when it is not
// one.
func fieldsIn(value any) []Field {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	raw := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		b, err := json.Marshal(item)
		if err != nil {
			return nil
		}
		raw = append(raw, b)
	}
	fields, ok := decodeFieldList(raw)
	if !ok {
		return nil
	}
	return fields
}

// referenceTreeValue is the reference type's toZodType: an array of nodes,
// each with its branch in children, at every level, checked by treeValue —
// the rules every tree type shares — and each node's own keys by
// referenceNode.
func referenceTreeValue(_ Field, settings map[string]any, value any, path string, errs *valueErrors) {
	treeValue(settings, value, path, errs, func(node map[string]any, at string, errs *valueErrors) {
		referenceNode(settings, node, at, errs)
	})
}

// treeValue checks a tree value — a Reference Tree, and every tree type a
// Catalogue section defines alike (ValidateTree): an array of nodes, each an
// object with an _id (as a row's) and its branch, if any, a list in children.
// Across the whole tree, whatever else a node gets wrong:
//
//   - every _id is unique at every level (ADR-0023): CodeDuplicateID at each
//     repeat, in document order;
//   - settings.max_items caps every node at every level: CodeTooManyItems at
//     the tree;
//   - settings.max_depth caps the levels: CodeInvalidValue at each shallowest
//     node past it.
//
// node checks one node's own keys, at the node's path.
func treeValue(settings map[string]any, value any, path string, errs *valueErrors, node func(node map[string]any, at string, errs *valueErrors)) {
	nodes, ok := value.([]any)
	if !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	// A depth index, roots being 0: max_depth counts levels (TS's
	// referenceDepthCeiling).
	ceiling := 0.0
	hasCeiling := false
	if levels, ok := settings["max_depth"].(float64); ok {
		ceiling, hasCeiling = levels-1, true
	}
	seen := map[string]bool{}
	count := 0
	var walk func(nodes []any, depth int, at string, reportDepth bool)
	walk = func(nodes []any, depth int, at string, reportDepth bool) {
		segments := itemSegments(nodes)
		for i, node := range nodes {
			count++
			nodePath := joinPath(at, segments[i])
			deeper := reportDepth
			if reportDepth && hasCeiling && float64(depth) > ceiling {
				errs.add(nodePath, CodeInvalidValue, map[string]any{"maximum": ceiling + 1})
				deeper = false
			}
			obj, ok := node.(map[string]any)
			if !ok {
				continue
			}
			if id, ok := obj["_id"].(string); ok && isRowID(id) {
				if seen[id] {
					errs.add(nodePath, CodeDuplicateID, nil)
				} else {
					seen[id] = true
				}
			}
			if children, ok := obj["children"].([]any); ok {
				walk(children, depth+1, joinPath(nodePath, "children"), deeper)
			}
		}
	}
	walk(nodes, 0, path, true)
	if hi, ok := settings["max_items"].(float64); ok && float64(count) > hi {
		errs.add(path, CodeTooManyItems, map[string]any{"maximum": hi})
	}

	var check func(nodes []any, at string)
	check = func(nodes []any, at string) {
		segments := itemSegments(nodes)
		for i, item := range nodes {
			nodePath := joinPath(at, segments[i])
			obj, ok := item.(map[string]any)
			if !ok {
				errs.add(nodePath, CodeInvalidType, nil)
				continue
			}
			rowID(obj, nodePath, errs)
			node(obj, nodePath, errs)
			if children, present := obj["children"]; present {
				list, ok := children.([]any)
				if !ok {
					errs.add(joinPath(nodePath, "children"), CodeInvalidType, nil)
					continue
				}
				check(list, joinPath(nodePath, "children"))
			}
		}
	}
	check(nodes, path)
}

// singleReferenceValue is the single_reference type's toZodType: one node,
// without a branch.
func singleReferenceValue(_ Field, settings map[string]any, value any, path string, errs *valueErrors) {
	obj, ok := value.(map[string]any)
	if !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	rowID(obj, path, errs)
	referenceNode(settings, obj, path, errs)
}

// referenceNode checks one node's own keys at path — its _id and its branch
// are the tree's: its id — a Content's, required — its Pin, and its values
// against its Reference Spec (referenceValues).
func referenceNode(settings map[string]any, obj map[string]any, path string, errs *valueErrors) {
	id, present := obj["id"]
	_, idOK := id.(string)
	switch {
	case !present:
		errs.add(joinPath(path, "id"), CodeRequired, nil)
	case !idOK:
		errs.add(joinPath(path, "id"), CodeInvalidType, nil)
	}
	if pin, present := obj["pin"]; present {
		if _, ok := pin.(string); !ok {
			errs.add(joinPath(path, "pin"), CodeInvalidType, nil)
		}
	}
	referenceValues(settings, obj, path, errs)
}

// referenceValues checks a node's values, at path plus "values", against its
// Reference Spec (referenceSpecFor). A Field that links a Reference Spec
// chooses by the target's Blueprint, which only WithTargetBlueprints can say:
// without it such a Field's values are an opaque record, and with it a node
// whose id is not a string has no target to choose by and its values are not
// checked — TS's answers.
func referenceValues(settings map[string]any, obj map[string]any, path string, errs *valueErrors) {
	target, idOK := obj["id"].(string)
	var fields []Field
	known := false
	var lookup func(string) string
	if errs.ctx != nil {
		lookup = errs.ctx.targetBlueprint
	}
	if lookup != nil && linksReferenceSpec(settings) {
		if !idOK {
			return
		}
		fields, known = referenceSpecFor(settings, lookup(target))
	} else {
		fields, known = referenceSpecFor(settings, "")
	}
	recordValues(fields, known, obj, path, errs)
}

// recordValues checks a node's values, at path plus "values": a record, and —
// when its Fields are known — the record they describe. A missing record is
// an empty one: its required Fields are missing, as TS seeds it with {}.
func recordValues(fields []Field, known bool, obj map[string]any, path string, errs *valueErrors) {
	at := joinPath(path, "values")
	values, present := obj["values"]
	if !present {
		if known {
			validateFields(fields, map[string]any{}, at, errs)
		}
		return
	}
	record, ok := values.(map[string]any)
	if !ok {
		errs.add(at, CodeInvalidType, nil)
		return
	}
	if known {
		validateFields(fields, record, at, errs)
	}
}

// referenceTreeEdges are a Reference Field's edges: one EdgeReference per
// node, at the node's path below the Field, carrying its target and Pin.
func referenceTreeEdges(_ Field, _ map[string]any, value any) []Edge {
	var edges []Edge
	eachReferenceNode(value, "", func(node map[string]any, path string) {
		if e, ok := referenceEdge(node); ok {
			e.Path = path
			edges = append(edges, e)
		}
	})
	return edges
}

// singleReferenceEdges are a Single Reference's one edge, at the Field.
func singleReferenceEdges(_ Field, _ map[string]any, value any) []Edge {
	node, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	if e, ok := referenceEdge(node); ok {
		return []Edge{e}
	}
	return nil
}

func referenceEdge(node map[string]any) (Edge, bool) {
	id, ok := named(node["id"])
	if !ok {
		return Edge{}, false
	}
	target := Target{Content: id}
	if pin, ok := named(node["pin"]); ok {
		target.Pin = pin
	}
	return Edge{Kind: EdgeReference, Target: target}, true
}

// eachReferenceNode visits every node of a tree value that is an object, in
// document order, at its path below path: its _id segment (ADR-0023),
// through children.
func eachReferenceNode(value any, path string, visit func(node map[string]any, path string)) {
	nodes, ok := value.([]any)
	if !ok {
		return
	}
	segments := itemSegments(nodes)
	for i, item := range nodes {
		node, ok := item.(map[string]any)
		if !ok {
			continue
		}
		at := joinPath(path, segments[i])
		visit(node, at)
		eachReferenceNode(node["children"], joinPath(at, "children"), visit)
	}
}

// referenceRecords are the records a Reference Field's value holds for the
// walkers: each node's values, against its Reference Spec — none where that
// is not known or empty.
func referenceRecords(f Field, settings map[string]any, value any, path string, targets func(string) string) []heldRecord {
	var records []heldRecord
	add := func(node map[string]any, at string) {
		values, ok := node["values"].(map[string]any)
		if !ok {
			return
		}
		blueprint := ""
		if id, ok := node["id"].(string); ok && targets != nil {
			blueprint = targets(id)
		}
		fields, known := referenceSpecFor(settings, blueprint)
		if known && len(fields) > 0 {
			records = append(records, heldRecord{fields: fields, record: values, path: joinPath(at, "values")})
		}
	}
	if f.FieldType == "single_reference" {
		if node, ok := value.(map[string]any); ok {
			add(node, path)
		}
		return records
	}
	eachReferenceNode(value, path, add)
	return records
}
