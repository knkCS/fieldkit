package fieldkit

import (
	"context"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// rich_text's delegation to knkeditor (fieldkit#216), on the shapes of
// knkeditor's Example_fieldkitRichText. The cases both languages answer alike,
// and the Go-only ones the fixtures can hold, are in conformance/unreleased/;
// these are the ones they cannot — a Text Type knkeditor cannot use, a Merge
// without its Text Type — and the plumbing around them.

// textTypeArticle is a resolved Text Type as blueprinthub stores it:
// Example_fieldkitRichText's, with links, footnotes and inline images.
const textTypeArticle = `{"minimumVocabularyVersion":"0.1.0","nodes":{"doc":{"options":{}},"textWrapper":{"options":{}},"text":{"options":{}},"footnote":{"options":{}},"inlineImage":{"options":{}}},"marks":{"contentLink":{"options":{}}}}`

// textTypeMinimal is Example_fieldkitRichText's own Text Type.
const textTypeMinimal = `{"minimumVocabularyVersion":"0.1.0","nodes":{"doc":{"options":{}},"textWrapper":{"options":{}},"text":{"options":{}}},"marks":{}}`

func richText(accessor, textType string) string {
	if textType == "" {
		return field("rich_text", accessor, "")
	}
	return field("rich_text", accessor, `{"text_type":"`+textType+`"}`)
}

func pmDoc(paragraphs ...string) string {
	return `{"type":"doc","content":[` + strings.Join(paragraphs, ",") + `]}`
}

func pmWrapper(id string, content ...string) string {
	return `{"type":"textWrapper","attrs":{"id":"` + id + `"},"content":[` + strings.Join(content, ",") + `]}`
}

func pmText(s string) string { return `{"type":"text","text":` + quoted(s) + `}` }

func quoted(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func resolveWith(t *testing.T, spec string, textTypes map[string]string) *ResolvedSpec {
	t.Helper()
	resolved, err := Resolve(context.Background(), mustSpec(t, spec), &releases{byKind: map[string]map[string]string{"text_type": textTypes}})
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func TestRichTextValidatesAgainstItsTextType(t *testing.T) {
	resolved := resolveWith(t, list(richText("body", "minimal@1")), map[string]string{"minimal@1": textTypeMinimal})
	valid := `{"body":` + pmDoc(pmWrapper("a", pmText("Eins.")), pmWrapper("b", pmText("Zwei."))) + `}`
	if errs := ValidateResolvedValue(resolved, json.RawMessage(valid)); errs != nil {
		t.Errorf("a valid document: %v", errs)
	}

	// The vocabulary has a paragraph; the Text Type does not enable it.
	narrowed := `{"body":` + pmDoc(pmWrapper("a", pmText("Eins.")), `{"type":"paragraph"}`) + `}`
	got := ValidateResolvedValue(resolved, json.RawMessage(narrowed))
	if len(got) != 1 || got[0].Path != "/body/content/1" || got[0].Code != CodeInvalidRichText || got[0].Params["code"] != "node-not-enabled" {
		t.Errorf("a node the Text Type does not enable: %+v", got)
	}
	// Without a Resolved Spec there is no Text Type: the vocabulary alone
	// knows a paragraph.
	spec := resolved.Fields
	paragraph := `{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"paragraphContent","attrs":{"id":"q"},"content":[` + pmWrapper("r", pmText("Drei.")) + `]}]}`
	if errs := ValidateValue(spec, json.RawMessage(`{"body":`+pmDoc(paragraph)+`}`)); errs != nil {
		t.Errorf("the vocabulary alone: %v", errs)
	}
}

func TestRichTextTextTypeNotUsable(t *testing.T) {
	data := json.RawMessage(`{"body":` + pmDoc(pmWrapper("a", pmText("x"))) + `}`)
	// Pinned, but the Resolved Spec's parts do not hold it.
	resolved := &ResolvedSpec{Fields: mustSpec(t, list(richText("body", "gone@1")))}
	got := ValidateResolvedValue(resolved, data)
	if len(got) != 1 || got[0].Path != "/body" || got[0].Code != CodeInvalidRichText || got[0].Params["code"] != "text-type" {
		t.Errorf("a Text Type the parts do not hold: %+v", got)
	}
	// Held, but naming a node the vocabulary does not have.
	resolved.Parts = map[string]map[string]json.RawMessage{"text_type": {"gone@1": json.RawMessage(`{"minimumVocabularyVersion":null,"nodes":{"doc":{"options":{}},"nope":{"options":{}}},"marks":{}}`)}}
	got = ValidateResolvedValue(resolved, data)
	if len(got) != 1 || got[0].Params["code"] != "text-type" {
		t.Errorf("a Text Type knkeditor cannot use: %+v", got)
	}
}

func TestRichTextInvalidJSONValues(t *testing.T) {
	// Decoding would replace the lone surrogate; knkeditor finds it in the
	// stored JSON text, at its place in the row named by the row's _id.
	spec := mustSpec(t, list(field("group", "sections", "")))
	spec[0].Children = mustSpec(t, list(richText("body", "")))
	data := `{"sections":[{"_id":"s1","body":` + pmDoc(pmWrapper("a", `{"type":"text","text":"x\ud800"}`)) + `}],"note":"\ud800"}`
	got := codesOf(ValidateValue(spec, json.RawMessage(data)))
	want := []string{"/sections/s1/body/content/0/content/0/text invalid_rich_text"}
	if !slices.Equal(got, want) {
		t.Errorf("a lone surrogate: got %v, want %v", got, want)
	}

	// A number beyond float64 survives decoding as ±Inf, and is found either way.
	data = `{"body":{"type":"doc","content":[{"type":"textWrapper","attrs":{"id":1e400},"content":[{"type":"text","text":"x"}]}]}}`
	got = codesOf(ValidateValue(mustSpec(t, list(richText("body", ""))), json.RawMessage(data)))
	want = []string{"/body/content/0/attrs/id invalid_rich_text"}
	if !slices.Equal(got, want) {
		t.Errorf("a number beyond float64: got %v, want %v", got, want)
	}
}

func TestResolveFillsVocabulary(t *testing.T) {
	newer := strings.Replace(textTypeMinimal, `"0.1.0"`, `"0.2.0-rc.1"`, 1)
	unstated := strings.Replace(textTypeMinimal, `"0.1.0"`, `null`, 1)
	spec := list(richText("a", "a@1"), richText("b", "b@1"), richText("c", "c@1"), richText("d", ""))
	resolved := resolveWith(t, spec, map[string]string{"a@1": textTypeMinimal, "b@1": newer, "c@1": unstated})
	if resolved.Vocabulary != "0.2.0-rc.1" {
		t.Errorf("vocabulary = %q, want the highest minimum", resolved.Vocabulary)
	}
	if resolved := resolveWith(t, list(richText("c", "c@1")), map[string]string{"c@1": unstated}); resolved.Vocabulary != "" {
		t.Errorf("a Text Type stating no minimum: vocabulary = %q", resolved.Vocabulary)
	}

	for name, part := range map[string]string{
		"not a Text Type":        `{"nodes":["paragraph"]}`,
		"not a semantic version": strings.Replace(textTypeMinimal, `"0.1.0"`, `"latest"`, 1),
	} {
		_, err := Resolve(context.Background(), mustSpec(t, list(richText("a", "a@1"))), &releases{byKind: map[string]map[string]string{"text_type": {"a@1": part}}})
		if code, path := resolveCode(t, err); code != CodeResolveInvalidRelease || path != "/a/settings/text_type" {
			t.Errorf("%s: got %s at %s", name, code, path)
		}
	}
}

func TestRichTextTexts(t *testing.T) {
	// A Symbol Set comes from the Text Type in the parts: without the
	// Resolved Spec, ValueText reads the custom symbol as nothing.
	withSymbols := `{"minimumVocabularyVersion":"0.1.0","nodes":{"doc":{"options":{}},"textWrapper":{"options":{}},"text":{"options":{}},"customSymbol":{"options":{"custom_symbols":[{"name":"para","unicode":"§"}]}}},"marks":{}}`
	resolved := resolveWith(t, list(richText("body", "s@1")), map[string]string{"s@1": withSymbols})
	value := pmDoc(pmWrapper("a", `{"type":"customSymbol","attrs":{"name":"para"}}`, pmText(" 3")))
	if errs := ValidateResolvedValue(resolved, json.RawMessage(`{"body":`+value+`}`)); errs != nil {
		t.Fatalf("the document is not valid: %v", errs)
	}
	texts, err := Texts(resolved, json.RawMessage(`{"body":`+value+`}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(texts) != 1 || texts[0].Text != "§ 3" || texts[0].Weight != SearchD {
		t.Errorf("Texts = %+v", texts)
	}
	if got := ValueText(resolved.Fields[0], json.RawMessage(value)); got != " 3" {
		t.Errorf("ValueText = %q", got)
	}
}

func TestRichTextCompareAndMerge(t *testing.T) {
	resolved := resolveWith(t, list(richText("body", "minimal@1")), map[string]string{"minimal@1": textTypeMinimal})
	fields, err := SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	f := fields[0]
	base := pmDoc(pmWrapper("a", pmText("Eins.")), pmWrapper("b", pmText("Zwei.")))
	ours := pmDoc(pmWrapper("a", pmText("Eins, geändert.")), pmWrapper("b", pmText("Zwei.")))
	theirs := pmDoc(pmWrapper("a", pmText("Eins.")), pmWrapper("b", pmText("Zwei, geändert.")))

	// Marks aside, the same document spelled differently is equal.
	equal, detail, err := f.Type.Compare(f.Settings, json.RawMessage(base), json.RawMessage(strings.ReplaceAll(base, `"type":"doc",`, `"type":"doc" ,`)))
	if err != nil || !equal || detail != nil {
		t.Errorf("the same document: %v %s %v", equal, detail, err)
	}

	merged, conflicts := merge(t, f, base, ours, theirs)
	var got, want any
	_ = json.Unmarshal([]byte(merged), &got)
	_ = json.Unmarshal([]byte(pmDoc(pmWrapper("a", pmText("Eins, geändert.")), pmWrapper("b", pmText("Zwei, geändert.")))), &want)
	if conflicts != nil || !jsonEqual(got, want) {
		t.Errorf("a clean merge: %s %v", merged, conflicts)
	}
	_, conflicts = merge(t, f, base, ours, pmDoc(pmWrapper("a", pmText("Eins, anders.")), pmWrapper("b", pmText("Zwei."))))
	if !slices.Equal(conflicts, []string{"a"}) {
		t.Errorf("a node both sides changed: %v", conflicts)
	}

	// Its Text Type is not in the Settings' parts: Merge cannot check what it
	// merges, and fails rather than widen to the vocabulary.
	bare := schemaField(t, richText("body", "minimal@1"))
	if _, _, err := bare.Type.(Merger).Merge(bare.Settings, json.RawMessage(base), json.RawMessage(ours), json.RawMessage(theirs)); err == nil {
		t.Error("a Merge without its Text Type did not fail")
	}
}

// Merge keeps a document as it was stored (ADR-0025): the canonical strip
// around a merged row stops at it, so an untouched document keeps its
// attrs: null and "attributes": {}.
func TestMergeKeepsTheDocumentAsStored(t *testing.T) {
	f := schemaField(t, `{"field_type":"group","config":{"name":"rows","api_accessor":"rows"},"children":[`+
		field("text", "heading", "")+","+richText("body", "")+`]}`)
	doc := `{"type":"doc","content":[{"type":"textWrapper","attrs":{"id":"a","textAlign":null,"attributes":{}},"content":[{"type":"text","text":"x"}]}]}`
	row := func(heading string) string { return `[{"_id":"r1","heading":"` + heading + `","body":` + doc + `}]` }
	merged, conflicts := merge(t, f, row("A"), row("B"), row("A"))
	var got, want any
	_ = json.Unmarshal([]byte(merged), &got)
	_ = json.Unmarshal([]byte(row("B")), &want)
	if conflicts != nil || !jsonEqual(got, want) {
		t.Errorf("got %s %v, want %s", merged, conflicts, row("B"))
	}
}

// A Text Type is parsed once per JSON text, from any goroutine, a failure
// included, and the memo starts over rather than grow past its bound
// (fieldkit#222).
func TestTextTypeMemo(t *testing.T) {
	m := &textTypeMemo{}
	var wg sync.WaitGroup
	got := make([]parsedTextType, 8)
	for i := range got {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got[i] = m.get(json.RawMessage(textTypeMinimal))
		}()
	}
	wg.Wait()
	for _, p := range got {
		if p.err != nil || p.textType == nil {
			t.Fatalf("a valid Text Type: %+v", p)
		}
	}
	first := m.get(json.RawMessage(textTypeMinimal))
	if again := m.get(json.RawMessage(textTypeMinimal)); again.textType != first.textType {
		t.Error("the same JSON text parsed twice")
	}
	if bad := m.get(json.RawMessage(`{}`)); bad.err == nil {
		t.Error("an unreadable Text Type: no error")
	}
	for i := range maxParsedTextTypes + 1 {
		m.get(json.RawMessage(`{"n":` + strconv.Itoa(i) + `}`))
	}
	if n := len(m.parsed); n > maxParsedTextTypes {
		t.Errorf("the memo holds %d, past its bound of %d", n, maxParsedTextTypes)
	}
}
