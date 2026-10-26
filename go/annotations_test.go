package fieldkit

import (
	"encoding/json"
	"testing"
)

// The shared fixtures (conformance/*/annotations) are the Annotation rule's
// cases; these are what only Go has: which Types are Annotators, and failures.

func TestOnlyRichTextIsAnAnnotator(t *testing.T) {
	c := DefaultCatalogue()
	for _, fieldType := range []string{"text", "group", "blocks", "fieldset", "reference"} {
		if _, ok := c.typeFor(fieldType).(Annotator); ok {
			t.Errorf("%s is an Annotator", fieldType)
		}
	}
	typ := c.typeFor("rich_text")
	if _, ok := typ.(Annotator); !ok {
		t.Fatal("rich_text is no Annotator")
	}
	if _, ok := typ.(Merger); !ok {
		t.Error("rich_text is no longer a Merger")
	}
}

func TestAnnotationsRefuseWhatIsNotJSON(t *testing.T) {
	doc := json.RawMessage(`{"type":"doc","content":[]}`)
	for _, raw := range []json.RawMessage{nil, json.RawMessage(`{`), json.RawMessage(`{} {}`)} {
		if _, err := RichTextAnnotationOnly(doc, raw); err == nil {
			t.Errorf("AnnotationOnly(%q): no error", raw)
		}
		if _, err := RichTextAnnotationOnly(raw, doc); err == nil {
			t.Errorf("AnnotationOnly(%q, doc): no error", raw)
		}
		if _, err := RichTextOpenSuggestion(raw); err == nil {
			t.Errorf("OpenSuggestion(%q): no error", raw)
		}
	}
}
