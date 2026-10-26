package fieldkit

import (
	"encoding/json"
	"fmt"
	"maps"

	vocabulary "github.com/knkcms/knkeditor/go"
)

// Annotations (contenthub ADR 0014, amended 2026-10-26): the comment anchors
// and suggestions knkeditor's comment and suggestion extensions store in a
// rich_text document. The rich-text field type tells contenthub two things
// about its values — whether a change is Annotation-only, and whether a value
// holds an open suggestion — beside the Compare and Merge it already owns, and
// takes a value's comment anchors out at Publish, so contenthub never reads
// rich text itself. src/schema/annotations.ts is the
// same rule in TS; the conformance fixtures in conformance/*/annotations hold
// both to one answer.
//
// The names are knkeditor's (#766, knkeditor ADR 0006), which calls the same
// marks and node attributes review state: its module exports them
// (reviewstate.go), and these are they.
const (
	// MarkComment is knkeditor's comment-anchor mark.
	MarkComment = vocabulary.CommentMark
	// MarkSuggestionInsert marks text proposed for insertion: it is not yet
	// the text.
	MarkSuggestionInsert = vocabulary.SuggestionInsertMark
	// MarkSuggestionDelete marks text proposed for deletion: it still is the
	// text.
	MarkSuggestionDelete = vocabulary.SuggestionDeleteMark
	// MarkSuggestionFormatChange marks text whose marks a suggestion changed
	// — already applied, the change recorded in its addedMarks and
	// removedMarks.
	MarkSuggestionFormatChange = vocabulary.SuggestionFormatChangeMark
	// AttrCommentThreads is the node attribute anchoring comments on a
	// whole node.
	AttrCommentThreads = vocabulary.CommentThreadsAttribute
	// AttrSuggestion is the node attribute recording a suggestion on a whole
	// node — inserted, deleted, modified or moved.
	AttrSuggestion = vocabulary.SuggestionAttribute
)

// Annotator is the Type of a Field whose values hold Annotations: rich_text's,
// from SchemaFields. contenthub asks it, never the document; a Type that is
// no Annotator holds none, so any change to it is not Annotation-only.
//
// settings are the SchemaField's Settings, as for Compare; values are present
// values of the Field, as stored.
type Annotator interface {
	// AnnotationOnly reports whether next differs from base only in
	// Annotations — comment anchors and suggestion marks added, removed or
	// moved. Any change to the text, its nodes, their attributes or any
	// other mark is not Annotation-only; nor is a suggestion accepted, which
	// changes the text, nor a suggestion on a whole node, which proposes the
	// node itself. A suggestion rejected leaves the text as it was, and is.
	AnnotationOnly(settings, base, next json.RawMessage) (bool, error)
	// OpenSuggestion reports whether value holds any suggestion: a suggestion
	// mark, or a suggestion on a node.
	OpenSuggestion(settings, value json.RawMessage) (bool, error)
	// RemoveCommentAnchors is value with every comment anchor taken out —
	// each comment mark, and each node's commentThreadIds — and everything
	// else as it is, suggestions included: contenthub refuses Publish while a
	// value holds one, so what it publishes is a value without its comment
	// anchors (contenthub#358). Text the anchors had split is joined again,
	// as the editor would. AnnotationOnly(value, removed) holds, so whatever
	// was recorded on value still covers what is published.
	RemoveCommentAnchors(settings, value json.RawMessage) (json.RawMessage, error)
}

// richTextType is rich_text's Type: a finer Type that is also an Annotator.
type richTextType struct{ finerValueType }

// AnnotationOnly is RichTextAnnotationOnly; settings are not needed.
func (richTextType) AnnotationOnly(_, base, next json.RawMessage) (bool, error) {
	return RichTextAnnotationOnly(base, next)
}

// OpenSuggestion is RichTextOpenSuggestion; settings are not needed.
func (richTextType) OpenSuggestion(_, value json.RawMessage) (bool, error) {
	return RichTextOpenSuggestion(value)
}

// RemoveCommentAnchors is RichTextRemoveCommentAnchors; settings are not
// needed.
func (richTextType) RemoveCommentAnchors(_, value json.RawMessage) (json.RawMessage, error) {
	return RichTextRemoveCommentAnchors(value)
}

// RichTextRemoveCommentAnchors is the rich_text value with its comment anchors
// taken out (Annotator.RemoveCommentAnchors), at any depth a node's content
// reaches. A value that is not JSON is an error; one holding no comment anchor
// comes back as it is, re-encoded.
func RichTextRemoveCommentAnchors(value json.RawMessage) (json.RawMessage, error) {
	v, err := decodeJSON(value)
	if err != nil {
		return nil, fmt.Errorf("fieldkit: annotations: %w", err)
	}
	removed, _ := withoutCommentAnchors(v)
	out, err := encodeValue(removed)
	if err != nil {
		return nil, fmt.Errorf("fieldkit: annotations: %w", err)
	}
	return out, nil
}

// withoutCommentAnchors is a node without its comment marks and
// commentThreadIds, its content's too; removed says whether it held any
// itself. Marks or attrs left empty are absent. Only a node's content is
// entered, as settled enters it: a suggestion's snapshot of a node is the
// suggestion's, and stays as it is.
func withoutCommentAnchors(value any) (_ any, removed bool) {
	node, ok := value.(map[string]any)
	if !ok {
		return value, false
	}
	out := maps.Clone(node)
	if marks, ok := node["marks"].([]any); ok {
		kept := make([]any, 0, len(marks))
		for _, m := range marks {
			if mark, ok := m.(map[string]any); ok && mark["type"] == MarkComment {
				removed = true
				continue
			}
			kept = append(kept, m)
		}
		switch {
		case !removed:
		case len(kept) == 0:
			delete(out, "marks")
		default:
			out["marks"] = kept
		}
	}
	if attrs, ok := node["attrs"].(map[string]any); ok {
		if _, anchored := attrs[AttrCommentThreads]; anchored {
			removed = true
			kept := maps.Clone(attrs)
			delete(kept, AttrCommentThreads)
			if len(kept) == 0 {
				delete(out, "attrs")
			} else {
				out["attrs"] = kept
			}
		}
	}
	if content, ok := node["content"].([]any); ok {
		out["content"] = contentWithoutCommentAnchors(content)
	}
	return out, removed
}

// contentWithoutCommentAnchors is a node's children without their comment
// anchors, and two adjacent text nodes joined where a comment mark taken out
// of either leaves them with the same marks: the anchor was what split them.
func contentWithoutCommentAnchors(content []any) []any {
	out := make([]any, 0, len(content))
	var prevRemoved bool
	for _, child := range content {
		node, removed := withoutCommentAnchors(child)
		if len(out) > 0 && (removed || prevRemoved) {
			prev, okPrev := out[len(out)-1].(map[string]any)
			next, okNext := node.(map[string]any)
			if okPrev && okNext && joinable(prev, next) {
				joined := maps.Clone(prev)
				joined["text"] = prev["text"].(string) + next["text"].(string)
				out[len(out)-1] = joined
				// The joined node ends with this one: only an anchor taken out
				// of it lets the next join it too.
				prevRemoved = removed
				continue
			}
		}
		out = append(out, node)
		prevRemoved = removed
	}
	return out
}

// RichTextAnnotationOnly reports whether the rich_text value next differs
// from base only in Annotations (Annotator.AnnotationOnly). Both are read as
// they would stand with every Annotation taken out and every suggestion
// rejected — the text an Annotation does not touch — and compared as JSON
// values, marks as a set and adjacent text with the same marks as one.
func RichTextAnnotationOnly(base, next json.RawMessage) (bool, error) {
	a, err := decodeJSON(base)
	if err != nil {
		return false, fmt.Errorf("fieldkit: annotations: %w", err)
	}
	b, err := decodeJSON(next)
	if err != nil {
		return false, fmt.Errorf("fieldkit: annotations: %w", err)
	}
	sa, droppedA := settled(a)
	sb, droppedB := settled(b)
	if droppedA || droppedB {
		return droppedA == droppedB, nil
	}
	return sameSettled(sa, sb), nil
}

// RichTextOpenSuggestion reports whether the rich_text value holds any
// suggestion (Annotator.OpenSuggestion), at any depth.
func RichTextOpenSuggestion(value json.RawMessage) (bool, error) {
	v, err := decodeJSON(value)
	if err != nil {
		return false, fmt.Errorf("fieldkit: annotations: %w", err)
	}
	return holdsSuggestion(v), nil
}

func isSuggestionMark(name any) bool {
	return name == MarkSuggestionInsert || name == MarkSuggestionDelete || name == MarkSuggestionFormatChange
}

func holdsSuggestion(value any) bool {
	switch x := value.(type) {
	case []any:
		for _, item := range x {
			if holdsSuggestion(item) {
				return true
			}
		}
	case map[string]any:
		if marks, ok := x["marks"].([]any); ok {
			for _, m := range marks {
				if mark, ok := m.(map[string]any); ok && isSuggestionMark(mark["type"]) {
					return true
				}
			}
		}
		if attrs, ok := x["attrs"].(map[string]any); ok && attrs[AttrSuggestion] != nil {
			return true
		}
		for _, v := range x {
			if holdsSuggestion(v) {
				return true
			}
		}
	}
	return false
}

// settled is a node as it stands with its Annotations taken out and its
// suggestions rejected; dropped for a node a proposed insertion holds — it
// is not yet the text. Only a node's content is entered: a change anywhere else
// is no Annotation's.
//
//   - Comment marks, and a node's commentThreadIds, are dropped.
//   - Text (or an inline node) marked suggestionInsert is dropped.
//   - suggestionDelete is dropped, its text kept.
//   - suggestionFormatChange is dropped, and its change undone: the marks
//     in addedMarks removed, those in removedMarks restored.
//   - A node's suggestion attribute is kept when set — never Annotation-only
//     — and dropped when null, its default.
//   - attrs and marks that end up empty, or null, are absent.
func settled(value any) (_ any, dropped bool) {
	node, ok := value.(map[string]any)
	if !ok {
		return value, false
	}
	out := make(map[string]any, len(node))
	for key, v := range node {
		out[key] = v
	}
	if raw, present := node["marks"]; present {
		marks, inserted := settledMarks(raw)
		if inserted {
			return nil, true
		}
		if marks == nil {
			delete(out, "marks")
		} else {
			out["marks"] = marks
		}
	}
	if raw, present := node["attrs"]; present {
		if attrs := settledAttrs(raw); attrs == nil {
			delete(out, "attrs")
		} else {
			out["attrs"] = attrs
		}
	}
	if content, ok := node["content"].([]any); ok {
		out["content"] = settledContent(content)
	}
	return out, false
}

// settledMarks are a node's marks with the Annotations taken out, nil for
// none; inserted says the node is a proposed insertion. Marks that are not
// a list are left as they are.
func settledMarks(raw any) (marks any, inserted bool) {
	list, ok := raw.([]any)
	if !ok {
		if raw == nil {
			return nil, false
		}
		return raw, false
	}
	var kept []any
	var added []string
	var restored []any
	for _, m := range list {
		mark, ok := m.(map[string]any)
		if !ok {
			kept = append(kept, m)
			continue
		}
		switch mark["type"] {
		case MarkSuggestionInsert:
			return nil, true
		case MarkComment, MarkSuggestionDelete:
		case MarkSuggestionFormatChange:
			attrs, _ := mark["attrs"].(map[string]any)
			for _, spec := range markSpecs(attrs["addedMarks"]) {
				if name, ok := spec["name"].(string); ok {
					added = append(added, name)
				}
			}
			for _, spec := range markSpecs(attrs["removedMarks"]) {
				if name, ok := spec["name"].(string); ok {
					restoredMark := map[string]any{"type": name}
					if attrs, ok := spec["attrs"]; ok {
						restoredMark["attrs"] = attrs
					}
					restored = append(restored, restoredMark)
				}
			}
		default:
			kept = append(kept, settledMark(mark))
		}
	}
	var out []any
	for _, m := range kept {
		if mark, ok := m.(map[string]any); ok && containsName(added, mark["type"]) {
			continue
		}
		out = append(out, m)
	}
	for _, m := range restored {
		out = append(out, settledMark(m.(map[string]any)))
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, false
}

// markSpecs are a format change's addedMarks or removedMarks: {name, attrs?}
// entries, anything else skipped.
func markSpecs(raw any) []map[string]any {
	list, _ := raw.([]any)
	specs := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if spec, ok := item.(map[string]any); ok {
			specs = append(specs, spec)
		}
	}
	return specs
}

func containsName(names []string, name any) bool {
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}

// settledMark is a mark with attrs that are null or empty absent.
func settledMark(mark map[string]any) map[string]any {
	attrs, present := mark["attrs"]
	if !present {
		return mark
	}
	if obj, ok := attrs.(map[string]any); attrs != nil && (!ok || len(obj) > 0) {
		return mark
	}
	out := make(map[string]any, len(mark))
	for key, v := range mark {
		if key != "attrs" {
			out[key] = v
		}
	}
	return out
}

// settledAttrs are a node's attrs without commentThreadIds and a null
// suggestion, nil when nothing is left. attrs that are not an object are
// left as they are.
func settledAttrs(raw any) any {
	attrs, ok := raw.(map[string]any)
	if !ok {
		return raw
	}
	out := make(map[string]any, len(attrs))
	for key, v := range attrs {
		if key == AttrCommentThreads || (key == AttrSuggestion && v == nil) {
			continue
		}
		out[key] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// settledContent is a node's children settled, the dropped ones left out and
// adjacent text nodes with the same marks joined: where an Annotation started
// or ended, the editor split the text.
func settledContent(content []any) []any {
	out := make([]any, 0, len(content))
	for _, child := range content {
		s, dropped := settled(child)
		if dropped {
			continue
		}
		if node, ok := s.(map[string]any); ok && len(out) > 0 {
			if prev, ok := out[len(out)-1].(map[string]any); ok && joinable(prev, node) {
				joined := make(map[string]any, len(prev))
				for key, v := range prev {
					joined[key] = v
				}
				joined["text"] = prev["text"].(string) + node["text"].(string)
				out[len(out)-1] = joined
				continue
			}
		}
		out = append(out, s)
	}
	return out
}

// joinable reports whether two settled nodes are text nodes holding nothing
// but their text and the same marks.
func joinable(a, b map[string]any) bool {
	for _, node := range []map[string]any{a, b} {
		if node["type"] != "text" {
			return false
		}
		if _, ok := node["text"].(string); !ok {
			return false
		}
		for key := range node {
			if key != "type" && key != "text" && key != "marks" {
				return false
			}
		}
	}
	return sameMarks(a["marks"], b["marks"])
}

// sameSettled reports whether two settled values are the same, as sameValue
// does, with every node's marks compared as a set.
func sameSettled(a, b any) bool {
	x, okA := a.(map[string]any)
	y, okB := b.(map[string]any)
	if !okA || !okB {
		xs, okA := a.([]any)
		ys, okB := b.([]any)
		if !okA || !okB {
			return sameValue(a, b)
		}
		if len(xs) != len(ys) {
			return false
		}
		for i := range xs {
			if !sameSettled(xs[i], ys[i]) {
				return false
			}
		}
		return true
	}
	if len(x) != len(y) {
		return false
	}
	for key, v := range x {
		w, ok := y[key]
		if !ok {
			return false
		}
		switch key {
		case "marks":
			if !sameMarks(v, w) {
				return false
			}
		case "content":
			if !sameSettled(v, w) {
				return false
			}
		default:
			if !sameValue(v, w) {
				return false
			}
		}
	}
	return true
}

// sameMarks reports whether two mark lists hold the same marks in any order,
// each as often; marks that are not lists compare as values.
func sameMarks(a, b any) bool {
	xs, okA := a.([]any)
	ys, okB := b.([]any)
	if !okA || !okB {
		return sameValue(a, b)
	}
	if len(xs) != len(ys) {
		return false
	}
	used := make([]bool, len(ys))
	for _, m := range xs {
		found := false
		for j, n := range ys {
			if !used[j] && sameValue(m, n) {
				used[j], found = true, true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
