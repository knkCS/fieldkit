package fieldkit

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"

	vocabulary "github.com/knkcms/knkeditor/go"
)

// rich_text delegates to knkeditor's Go module (fieldkit#216): its value is a
// ProseMirror document in knkeditor's vocabulary, narrowed by the Text Type
// its text_type setting pins, and knkeditor is the one reading of it —
// validation, edges, text, Compare and Merge. fieldkit only finds the Text
// Type in the Resolved Spec's parts (ADR-0020) and maps the answers into its
// own shapes.

// pinKindTextType is the kind of a Pin naming a Text Type Release: an opaque
// part, stored in the Resolved Spec's parts and read only by knkeditor.
const pinKindTextType = "text_type"

// packagedVocabulary is the vocabulary knkeditor's module embeds, parsed once.
var packagedVocabulary = sync.OnceValue(vocabulary.Packaged) //nolint:gochecknoglobals

// parseTextTypePart reads a text_type part as knkeditor reads it, and checks
// that its minimum vocabulary version, when it states one, is a semantic
// version — Resolve compares them to fill the Resolved Spec's vocabulary.
//
// It is memoised by the part's JSON text (parsedTextTypes): Texts reads a
// rich_text value's Text Type once per value, so without it a table of
// thousands of rich-text rows parses the same Text Type thousands of times
// (fieldkit#222). The Text Type it returns is shared: never modify it.
func parseTextTypePart(raw json.RawMessage) (*vocabulary.TextType, error) {
	parsed := parsedTextTypes.get(raw)
	return parsed.textType, parsed.err
}

// parsedTextType is one memoised parseTextTypePart: the Text Type and its
// Symbol Set, or why it cannot be read.
type parsedTextType struct {
	textType *vocabulary.TextType
	symbols  vocabulary.SymbolSet
	err      error
}

func parseTextTypeUncached(raw json.RawMessage) parsedTextType {
	textType, err := vocabulary.ParseTextType(raw)
	if err != nil {
		return parsedTextType{err: err}
	}
	if v := textType.MinimumVocabularyVersion; v != nil {
		if _, err := vocabulary.CompareVersions(*v, *v); err != nil {
			return parsedTextType{err: fmt.Errorf("minimumVocabularyVersion: %w", err)}
		}
	}
	// A Symbol Set knkeditor cannot read is none: its custom symbols read as
	// nothing, as without a Text Type.
	symbols, _ := textType.SymbolSet()
	return parsedTextType{textType: textType, symbols: symbols}
}

// textTypeMemo memoises parseTextTypeUncached by the part's JSON text, for
// every goroutine. A service reads a handful of Text Type Releases, but the
// parts come from outside, so it holds at most maxParsedTextTypes and starts
// over when full rather than grow without bound.
type textTypeMemo struct {
	mu     sync.Mutex
	parsed map[string]parsedTextType
}

const maxParsedTextTypes = 256

var parsedTextTypes = &textTypeMemo{} //nolint:gochecknoglobals

func (m *textTypeMemo) get(raw json.RawMessage) parsedTextType {
	m.mu.Lock()
	parsed, ok := m.parsed[string(raw)]
	m.mu.Unlock()
	if ok {
		return parsed
	}
	parsed = parseTextTypeUncached(raw)
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.parsed == nil || len(m.parsed) >= maxParsedTextTypes {
		m.parsed = map[string]parsedTextType{}
	}
	m.parsed[string(raw)] = parsed
	return parsed
}

// higherVocabulary is the higher of two vocabulary versions, "" being none.
// Both are semantic versions parseTextTypePart accepted.
func higherVocabulary(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	if c, _ := vocabulary.CompareVersions(b, a); c > 0 {
		return b
	}
	return a
}

// richTextContext finds a rich_text Field's Text Type in parts, and builds
// knkeditor's validators and mergers once per Text Type.
type richTextContext struct {
	parts map[string]map[string]json.RawMessage
	// strict says the parts are a Resolved Spec's: a Text Type a Field pins
	// and they do not hold is an error. Without a Resolved Spec (ValidateValue
	// on an authored Spec) there are no parts, and a Field is validated
	// against the vocabulary alone.
	strict     bool
	validators map[string]*vocabulary.Validator
	mergers    map[string]*vocabulary.Merger
}

// textTypeRelease is the Text Type Release a Field pins, "" for none.
func textTypeRelease(f Field) string {
	settings, _ := canonicalSettings(f.Settings)
	return pinRelease(settings, pinKindTextType)
}

// textType is the Text Type a Field pins, or nil for the vocabulary alone:
// the Field pins none, or there is no Resolved Spec to read it from. release
// is the cache key: "" for the vocabulary alone.
func (r *richTextContext) textType(f Field) (release string, textType *vocabulary.TextType, err error) {
	release = textTypeRelease(f)
	if release == "" {
		return "", nil, nil
	}
	raw, ok := r.parts[pinKindTextType][release]
	if !ok {
		if r.strict {
			return "", nil, fmt.Errorf("the Text Type Release %q is not in the Resolved Spec's parts", release)
		}
		return "", nil, nil
	}
	textType, err = parseTextTypePart(raw)
	if err != nil {
		return "", nil, fmt.Errorf("the Text Type Release %q: %w", release, err)
	}
	return release, textType, nil
}

// validator and merger are built once per Text Type, and found again by the
// release a Field pins before anything is read: a table of thousands of
// rich-text rows asks for one per row (fieldkit#222). A pin the parts do not
// hold, outside strict, is the vocabulary alone, found under "" too.
func (r *richTextContext) validator(f Field) (*vocabulary.Validator, error) {
	return built(r, f, &r.validators, func(textType *vocabulary.TextType) (*vocabulary.Validator, error) {
		if textType == nil {
			return vocabulary.NewValidator(packagedVocabulary())
		}
		return vocabulary.NewTextTypeValidator(packagedVocabulary(), textType)
	})
}

func (r *richTextContext) merger(f Field) (*vocabulary.Merger, error) {
	return built(r, f, &r.mergers, func(textType *vocabulary.TextType) (*vocabulary.Merger, error) {
		return vocabulary.NewMerger(packagedVocabulary(), textType)
	})
}

// built is the validator or merger for f's Text Type from cache, building it
// with build on a miss.
func built[T any](r *richTextContext, f Field, cache *map[string]T, build func(*vocabulary.TextType) (T, error)) (T, error) {
	pinned := textTypeRelease(f)
	if v, ok := (*cache)[pinned]; ok {
		return v, nil
	}
	var zero T
	release, textType, err := r.textType(f)
	if err != nil {
		return zero, err
	}
	v, ok := (*cache)[release]
	if !ok {
		if v, err = build(textType); err != nil {
			return zero, err
		}
	}
	if *cache == nil {
		*cache = map[string]T{}
	}
	(*cache)[release] = v
	(*cache)[pinned] = v
	return v, nil
}

// richTextValue is the rich_text value rule: an object — as TS's
// z.record(z.unknown()) requires, CodeInvalidType otherwise — that knkeditor's
// Validate accepts under the Field's Text Type. Each error knkeditor reports is
// CodeInvalidRichText at the Field's path followed by knkeditor's JSON Pointer,
// with knkeditor's own code as params.code.
//
// knkeditor finds the values that do not survive a JSON round trip
// (invalid-json-value) only in the stored JSON text: decoding replaces a lone
// surrogate. So the whole data is scanned as JSON text once, and a document
// holding such a value is reported with those alone, as knkeditor reports it.
//
// Not a container: it takes the container rules' signature for its absolute
// path, which is where the scanned values are found.
func richTextValue(f Field, _ map[string]any, value any, path string, errs *valueErrors) {
	if _, ok := value.(map[string]any); !ok {
		errs.add(path, CodeInvalidType, nil)
		return
	}
	ctx := errs.ctx
	if invalid := ctx.invalidJSONWithin(path); len(invalid) > 0 {
		for _, at := range invalid {
			errs.add(at, CodeInvalidRichText, map[string]any{"code": string(vocabulary.InvalidJSONValue)})
		}
		return
	}
	v, err := ctx.richText.validator(f)
	if err != nil {
		errs.add(path, CodeInvalidRichText, map[string]any{"code": "text-type", "message": err.Error()})
		return
	}
	for _, e := range v.Validate(value) {
		errs.add(path+e.Path, CodeInvalidRichText, map[string]any{"code": string(e.Code)})
	}
}

// valueContext is what one ValidateValue run shares with every rule: the
// stored JSON text, scanned for invalid JSON values only when a rich_text
// value asks, and the rich-text Text Types.
type valueContext struct {
	data json.RawMessage
	// decoded is data as ValidateValue decoded it, before Unset was
	// stripped: the tree the scanned JSON Pointers are mapped through.
	decoded  any
	scanned  bool
	invalid  []string
	richText *richTextContext
	// targetBlueprint is WithTargetBlueprints', nil when not given: which
	// Reference Spec a Reference's values follow (reference.go).
	targetBlueprint func(contentID string) string
}

// invalidJSONWithin are the paths, /-separated with each row as its _id, of
// the values in the stored JSON text that do not survive a JSON round trip,
// at or below path.
func (c *valueContext) invalidJSONWithin(path string) []string {
	if c == nil {
		return nil
	}
	if !c.scanned {
		c.scanned = true
		if len(c.data) > 0 {
			_, found, err := vocabulary.DecodeDocument(c.data)
			if err == nil {
				for _, e := range found {
					c.invalid = append(c.invalid, idPath(c.decoded, e.Path))
				}
			}
		}
	}
	var within []string
	for _, at := range c.invalid {
		if at == path || strings.HasPrefix(at, path+"/") {
			within = append(within, at)
		}
	}
	return within
}

// idPath turns a JSON Pointer into data, each array item by its index, into
// fieldkit's path grammar, each item by its _id where it holds a usable one
// (ADR-0023): the same place, named as ValidateValue names it.
func idPath(decoded any, pointer string) string {
	if pointer == "" {
		return ""
	}
	node := decoded
	out := ""
	for _, token := range strings.Split(pointer[1:], "/") {
		segment := strings.ReplaceAll(strings.ReplaceAll(token, "~1", "/"), "~0", "~")
		switch x := node.(type) {
		case []any:
			if i, err := strconv.Atoi(segment); err == nil && i >= 0 && i < len(x) {
				segment = itemSegments(x)[i]
				node = x[i]
				break
			}
			node = nil
		case map[string]any:
			node = x[segment]
		default:
			node = nil
		}
		out = joinPath(out, segment)
	}
	return out
}

// richTextEdges are knkeditor's Edges of the document (contenthub ADR 0009):
// a link to each Content a content link names, with its Anchor; a footnote
// to each footnote's Content; a media edge to each image's Asset — each at
// the Field, since knkeditor lists each edge once for the whole document. A
// document knkeditor cannot read yields none: the walk reads validated data.
func richTextEdges(_ Field, _ map[string]any, value any) []Edge {
	found, err := vocabulary.Edges(value)
	if err != nil {
		return nil
	}
	edges := make([]Edge, 0, len(found))
	for _, e := range found {
		switch e.Kind {
		case vocabulary.LinkEdge:
			edges = append(edges, Edge{Kind: EdgeLink, Target: Target{Content: e.Content, Anchor: e.Anchor}})
		case vocabulary.FootnoteEdge:
			edges = append(edges, Edge{Kind: EdgeFootnote, Target: Target{Content: e.Content}})
		case vocabulary.MediaEdge:
			edges = append(edges, Edge{Kind: EdgeMedia, Target: Target{Asset: e.Asset}})
		}
	}
	return edges
}

// richTextText is knkeditor's reading text of the document, custom symbols
// read through the Symbol Set of the Text Type in parts — without one, they
// read as nothing. A document knkeditor cannot read yields none.
func richTextText(f Field, _ map[string]any, value any, parts map[string]map[string]json.RawMessage) string {
	var symbols vocabulary.SymbolSet
	ctx := richTextContext{parts: parts}
	if release, textType, err := ctx.textType(f); err == nil && textType != nil {
		symbols = parsedTextTypes.get(parts[pinKindTextType][release]).symbols
	}
	text, err := vocabulary.Text(value, symbols)
	if err != nil {
		return ""
	}
	return text
}

// richTextRule is rich_text's Compare and Merge: knkeditor's, whose Compare
// detail is nested as it comes.
var richTextRule = finerRule{compare: compareRichText, merge: mergeRichText} //nolint:gochecknoglobals

// compareRichText is knkeditor's Compare: equal when it finds the documents
// unchanged — nodes matched by node id, attributes read with their defaults,
// marks in any order — and otherwise its Comparison as the detail,
// {status, nodes}, unchanged.
func compareRichText(_ *composer, f *Field, a, b any) (bool, *CompareDetail, error) {
	comparison, err := vocabulary.Compare(a, b)
	if err != nil {
		return false, nil, fmt.Errorf("fieldkit: %s: %w", f.Config.APIAccessor, err)
	}
	if comparison.Status == vocabulary.Unchanged {
		return true, nil, nil
	}
	nodes, err := json.Marshal(comparison.Nodes)
	if err != nil {
		return false, nil, fmt.Errorf("fieldkit: %s: %w", f.Config.APIAccessor, err)
	}
	return false, &CompareDetail{Status: string(comparison.Status), Nodes: nodes}, nil
}

// mergeRichText is knkeditor's Merger under the Field's Text Type, which the
// Settings' parts must hold. Its Conflicts are top-level node ids — or, for a
// merged document the Text Type refuses outside such a node, a JSON Pointer
// into it; "" is the whole value — each placed below path.
func mergeRichText(c *composer, f *Field, base, ours, theirs any, path string) (any, error) {
	if c.richText == nil {
		c.richText = &richTextContext{parts: c.parts, strict: true}
	}
	merger, err := c.richText.merger(*f)
	if err != nil {
		return nil, fmt.Errorf("fieldkit: %s: %w", f.Config.APIAccessor, err)
	}
	raws := make([]json.RawMessage, 3)
	for i, value := range []any{base, ours, theirs} {
		if raws[i], err = encodeValue(value); err != nil {
			return nil, fmt.Errorf("fieldkit: %s: %w", f.Config.APIAccessor, err)
		}
	}
	merged, conflicts, err := merger.MergeJSON(raws[0], raws[1], raws[2])
	if err != nil {
		return nil, fmt.Errorf("fieldkit: %s: %w", f.Config.APIAccessor, err)
	}
	if len(conflicts) > 0 {
		for _, conflict := range conflicts {
			switch {
			case conflict == "":
				c.conflict(path)
			case strings.HasPrefix(conflict, "/"):
				c.conflict(path + conflict)
			default:
				c.conflict(joinPath(path, conflict))
			}
		}
		return nil, nil
	}
	return decodeStored(merged)
}
