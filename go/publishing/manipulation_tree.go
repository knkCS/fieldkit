package publishing

import (
	"encoding/json"
	"slices"
	"strings"
	"unicode"

	fieldkit "github.com/knkcs/fieldkit/go"
)

// manipulationTree is manipulation_tree: a Title's composition (contenthub
// ADRs 0007, 0009), a Reference Tree whose every node says what it does with
// the Content it names. A node is {_id, id, intent, pin?, values?, with?,
// children?}. It shares the Reference Tree's rules through fieldkit.TypeEnv —
// the tree-wide _ids and caps, the Reference Spec an include's values follow,
// Compare and Merge per node — so the two cannot drift. What an intent does to
// a Title is contenthub's manipulation engine, not this. TS's
// src/publishing/field-types/manipulation-tree.ts is the other half.
var manipulationTree = fieldkit.TypeCode{ //nolint:gochecknoglobals
	Settings:  fieldkit.ReferenceSettings,
	HeldSpecs: manipulationTreeSpecs,
	Value:     manipulationTreeValue,
	Edges:     manipulationTreeEdges,
	Records:   manipulationTreeRecords,
	Compare:   manipulationTreeCompare,
	Merge:     manipulationTreeMerge,
	MintIDs:   manipulationTreeMint,
}

// The intents a node may hold (TS's MANIPULATION_INTENTS), each also the kind
// of the edge it yields.
const (
	IntentInclude  = "include"
	IntentExclude  = "exclude"
	IntentReplace  = "replace"
	IntentAnnotate = "annotate"
)

// intents are the four, in TS's order.
var intents = []string{IntentInclude, IntentExclude, IntentReplace, IntentAnnotate} //nolint:gochecknoglobals

// annotationSpec is the setting holding the node-level Reference Spec an
// annotate node's values follow.
const annotationSpec = "annotation_spec"

// manipulationTreeSpecs are the Specs its settings hold, all in the
// reference_spec Position: a Reference Field's — the embedded spec, each
// linked one once resolved — and the node-level annotation_spec. A list that
// does not decode as Fields is CodeInvalidSetting at it.
func manipulationTreeSpecs(f fieldkit.Field) ([]fieldkit.HeldSpec, []fieldkit.Error) {
	held, errs := fieldkit.ReferenceSpecs(f)
	var settings map[string]json.RawMessage
	if json.Unmarshal(f.Settings, &settings) != nil {
		return held, errs
	}
	var items []json.RawMessage
	if json.Unmarshal(settings[annotationSpec], &items) != nil || len(items) == 0 {
		return held, errs
	}
	fields, ok := fieldkit.DecodeFieldList(items)
	if !ok {
		return held, append(errs, fieldkit.Error{Path: fieldkit.JoinPath("", "settings", annotationSpec), Code: fieldkit.CodeInvalidSetting})
	}
	return append(held, fieldkit.HeldSpec{At: []string{annotationSpec}, Fields: fields, Position: fieldkit.PositionReferenceSpec}), errs
}

// annotationFields are the node-level Reference Spec's Fields, read
// leniently from canonical settings: none when it is not a list of Fields.
func annotationFields(settings map[string]any) []fieldkit.Field {
	items, ok := settings[annotationSpec].([]any)
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
	fields, ok := fieldkit.DecodeFieldList(raw)
	if !ok {
		return nil
	}
	return fields
}

// manipulationTreeValue is the Go reading of its toZodType: a tree by the
// Reference Tree's rules (TypeEnv.ValidateTree), each node checked by
// manipulationNode.
func manipulationTreeValue(_ fieldkit.Field, settings map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.Error {
	return env.ValidateTree(settings, value, func(node map[string]any, path string) []fieldkit.Error {
		return manipulationNode(settings, node, path, env)
	})
}

// manipulationNode checks one node's own keys, at path:
//
//   - id, a Content's, required; pin a string;
//   - intent required, a string, one of the four (CodeInvalidValue);
//   - with, when present, {id, pin?} as a Reference names a Content;
//     a replace node without one is CodeRequired at it, any other node with
//     one CodeInvalidValue;
//   - values: an include's against its Reference Spec, as a Reference's
//     (TypeEnv.ReferenceValues); an annotate's against annotation_spec; an
//     exclude or replace holding any is CodeInvalidValue at them.
//
// A node whose intent is none of the four is checked no further by intent.
func manipulationNode(settings map[string]any, node map[string]any, path string, env fieldkit.TypeEnv) []fieldkit.Error {
	var errs []fieldkit.Error
	add := func(code string, segments ...string) {
		errs = append(errs, fieldkit.Error{Path: fieldkit.JoinPath(path, segments...), Code: code})
	}
	requiredString := func(obj map[string]any, key string, at ...string) {
		value, present := obj[key]
		if _, ok := value.(string); !present {
			add(fieldkit.CodeRequired, append(at, key)...)
		} else if !ok {
			add(fieldkit.CodeInvalidType, append(at, key)...)
		}
	}
	optionalString := func(obj map[string]any, key string, at ...string) {
		if value, present := obj[key]; present {
			if _, ok := value.(string); !ok {
				add(fieldkit.CodeInvalidType, append(at, key)...)
			}
		}
	}
	requiredString(node, "id")
	optionalString(node, "pin")
	with, hasWith := node["with"]
	if hasWith {
		if replacement, ok := with.(map[string]any); ok {
			requiredString(replacement, "id", "with")
			optionalString(replacement, "pin", "with")
		} else {
			add(fieldkit.CodeInvalidType, "with")
		}
	}
	value, hasIntent := node["intent"]
	intent, isString := value.(string)
	switch {
	case !hasIntent:
		add(fieldkit.CodeRequired, "intent")
	case !isString:
		add(fieldkit.CodeInvalidType, "intent")
	case !slices.Contains(intents, intent):
		add(fieldkit.CodeInvalidValue, "intent")
	}
	if !slices.Contains(intents, intent) {
		return errs
	}
	switch {
	case intent == IntentReplace && !hasWith:
		add(fieldkit.CodeRequired, "with")
	case intent != IntentReplace && hasWith:
		add(fieldkit.CodeInvalidValue, "with")
	}
	switch intent {
	case IntentInclude:
		errs = append(errs, env.ReferenceValues(settings, node, path)...)
	case IntentAnnotate:
		errs = append(errs, env.RecordValues(annotationFields(settings), node, path)...)
	default:
		if _, present := node["values"]; present {
			add(fieldkit.CodeInvalidValue, "values")
		}
	}
	return errs
}

// edgeTo is the edge a Content and its Pin make, of a kind; false when id
// names nothing.
func edgeTo(kind string, id, pin any, path string) (fieldkit.Edge, bool) {
	content, ok := named(id)
	if !ok {
		return fieldkit.Edge{}, false
	}
	target := fieldkit.Target{Content: content}
	if p, ok := named(pin); ok {
		target.Pin = p
	}
	return fieldkit.Edge{Path: path, Kind: kind, Target: target}, true
}

// named is a string that names something — not blank, as JS trims it.
func named(value any) (string, bool) {
	s, ok := value.(string)
	blank := strings.TrimFunc(s, func(r rune) bool {
		switch r {
		case '\t', '\n', '\v', '\f', '\r', '\u2028', '\u2029', '\ufeff':
			return true
		}
		return unicode.Is(unicode.Zs, r)
	}) == ""
	return s, ok && !blank
}

// manipulationTreeEdges are one edge per node, of its intent's kind, at the
// node's path, carrying its target and Pin; and a replace node's with — what
// the Title holds in its target's place — as an include edge at the node's
// path plus "with". A node whose intent is none of the four yields none.
// TS's manipulationTreeEdges.
func manipulationTreeEdges(_ fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.Edge {
	var edges []fieldkit.Edge
	fieldkit.EachTreeNode(value, func(node map[string]any, path string) {
		intent, _ := node["intent"].(string)
		if !slices.Contains(intents, intent) {
			return
		}
		if e, ok := edgeTo(intent, node["id"], node["pin"], path); ok {
			edges = append(edges, e)
		}
		if replacement, ok := node["with"].(map[string]any); ok && intent == IntentReplace {
			if e, ok := edgeTo(IntentInclude, replacement["id"], replacement["pin"], fieldkit.JoinPath(path, "with")); ok {
				edges = append(edges, e)
			}
		}
	})
	return edges
}

// nodeValuesSpec are the Fields a node's values follow, and whether they are
// known: an include's Reference Spec, chosen by its target's Blueprint where
// the Field links one; an annotate's the node-level Reference Spec.
func nodeValuesSpec(settings map[string]any, node map[string]any, env fieldkit.TypeEnv) ([]fieldkit.Field, bool) {
	switch node["intent"] {
	case IntentAnnotate:
		return annotationFields(settings), true
	case IntentInclude:
		blueprint := ""
		if id, ok := node["id"].(string); ok {
			blueprint = env.TargetBlueprint(id)
		}
		return fieldkit.ReferenceSpecFor(settings, blueprint)
	}
	return nil, false
}

// manipulationTreeRecords are each include node's values against its
// Reference Spec and each annotate node's against the node-level one, for the
// walkers. TS's manipulationTreeRecords.
func manipulationTreeRecords(_ fieldkit.Field, settings map[string]any, value any, env fieldkit.TypeEnv) []fieldkit.HeldRecord {
	var records []fieldkit.HeldRecord
	fieldkit.EachTreeNode(value, func(node map[string]any, path string) {
		values, ok := node["values"].(map[string]any)
		if !ok {
			return
		}
		fields, known := nodeValuesSpec(settings, node, env)
		if known && len(fields) > 0 {
			records = append(records, fieldkit.HeldRecord{Fields: fields, Record: values, Path: fieldkit.JoinPath(path, "values")})
		}
	})
	return records
}

// nodeFields describe a node's record for Compare and Merge, given the node
// as each side holds it: its values as a record of the Spec they follow — the
// embedded Reference Spec for an include, where the Field links none, and
// annotation_spec for an annotate — when every side agrees on the intent;
// otherwise, key by key as whole values. id, pin, intent and with are whole
// values; the parent and position are the tree's.
func nodeFields(f fieldkit.Field) func(nodes ...map[string]any) []fieldkit.Field {
	settings := canonicalSettings(f.Settings)
	return func(nodes ...map[string]any) []fieldkit.Field {
		values := fieldkit.Field{FieldType: "fieldset", Config: fieldkit.Config{APIAccessor: "values"}}
		intent := nodes[0]["intent"]
		for _, node := range nodes[1:] {
			if node["intent"] != intent {
				return []fieldkit.Field{values}
			}
		}
		switch intent {
		case IntentAnnotate:
			values.Children = annotationFields(settings)
		case IntentInclude:
			if fields, known := fieldkit.ReferenceSpecFor(settings, ""); known {
				values.Children = fields
			}
		}
		return []fieldkit.Field{values}
	}
}

// canonicalSettings are a Field's settings decoded as the hooks receive them,
// {} when they are not an object. Only what nodeFields reads matters here —
// Specs and blueprints entries — and none of it holds a number.
func canonicalSettings(raw json.RawMessage) map[string]any {
	var settings map[string]any
	if json.Unmarshal(raw, &settings) != nil || settings == nil {
		return map[string]any{}
	}
	return settings
}

// manipulationTreeCompare compares per node by _id, as a Reference Tree does.
func manipulationTreeCompare(f fieldkit.Field, a, b any, env fieldkit.TypeEnv) (bool, *fieldkit.CompareDetail, error) {
	return env.CompareTree(f, a, b, nodeFields(f))
}

// manipulationTreeMerge merges per node by _id, as a Reference Tree does: a
// node's intent, target, Pin, with and parent each a field of it, its values
// per Field of the Spec they follow.
func manipulationTreeMerge(f fieldkit.Field, base, ours, theirs any, env fieldkit.TypeEnv) (any, []string, error) {
	return env.MergeTree(f, base, ours, theirs, nodeFields(f))
}

// manipulationTreeMint gives every node an _id where it has none. A node's
// values hold no rows — the reference_spec Position admits none — so nothing
// inside them needs one.
func manipulationTreeMint(_ fieldkit.Field, value any, env fieldkit.TypeEnv) any {
	env.MintTree(value)
	return value
}
