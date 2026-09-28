package fieldkit

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
)

// releases is an in-memory Fetcher over kind → Release id → JSON, counting
// every fetch.
type releases struct {
	byKind map[string]map[string]string
	calls  []string
}

func (r *releases) Fetch(_ context.Context, kind, release string) (json.RawMessage, error) {
	r.calls = append(r.calls, kind+":"+release)
	raw, ok := r.byKind[kind][release]
	if !ok {
		return nil, errors.New("no such release")
	}
	return json.RawMessage(raw), nil
}

func mustSpec(t *testing.T, s string) Spec {
	t.Helper()
	spec, err := DecodeSpec([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return spec
}

func field(fieldType, accessor, settings string) string {
	f := `{"field_type":"` + fieldType + `","config":{"name":"` + accessor + `","api_accessor":"` + accessor + `","required":false,"instructions":""},"system":false`
	if settings != "" {
		f += `,"settings":` + settings
	}
	return f + "}"
}

func fieldset(accessor, release string) string {
	return field("fieldset", accessor, `{"blueprint":"`+release+`"}`)
}

func list(fields ...string) string { return "[" + strings.Join(fields, ",") + "]" }

func resolveCode(t *testing.T, err error) (string, string) {
	t.Helper()
	var re *ResolveError
	if !errors.As(err, &re) {
		t.Fatalf("want a *ResolveError, got %v", err)
	}
	return re.Code, re.Pin.Path
}

func TestResolveInlinesABlueprintRelease(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"address@1": list(field("text", "street", ""))},
	}}
	resolved, err := Resolve(context.Background(), mustSpec(t, list(fieldset("address", "address@1"))), fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Catalogue != DefaultCatalogue().Version {
		t.Errorf("catalogue = %q, want %q", resolved.Catalogue, DefaultCatalogue().Version)
	}
	children := resolved.Fields[0].Children
	if len(children) != 1 || children[0].Config.APIAccessor != "street" {
		t.Errorf("children = %+v", children)
	}
	out, _ := json.Marshal(resolved)
	for _, want := range []string{`"vocabulary":""`, `"parts":{}`, `"blueprint":"address@1"`} {
		if !strings.Contains(string(out), want) {
			t.Errorf("envelope %s lacks %s", out, want)
		}
	}
}

func TestResolveFetchesEachReleaseOnce(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {
			"address@1": list(field("text", "street", "")),
			"person@1":  list(fieldset("home", "address@1")),
		},
	}}
	spec := mustSpec(t, list(fieldset("billing", "address@1"), fieldset("shipping", "address@1"), fieldset("owner", "person@1")))
	resolved, err := Resolve(context.Background(), spec, fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(fetcher.calls, []string{"blueprint:address@1", "blueprint:person@1"}) {
		t.Errorf("calls = %v", fetcher.calls)
	}
	if got := resolved.Fields[2].Children[0].Children[0].Config.APIAccessor; got != "street" {
		t.Errorf("nested fieldset not resolved: %q", got)
	}
}

func TestResolveLeavesResolvedFieldsAlone(t *testing.T) {
	fetcher := &releases{}
	spec := mustSpec(t, `[{"field_type":"fieldset","config":{"name":"a","api_accessor":"a","required":false,"instructions":""},"system":false,"settings":{"blueprint":"x@1"},"children":[]}]`)
	resolved, err := Resolve(context.Background(), spec, fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if len(fetcher.calls) != 0 {
		t.Errorf("fetched %v", fetcher.calls)
	}
	out, _ := json.Marshal(resolved.Fields)
	if !strings.Contains(string(out), `"children":[]`) {
		t.Errorf("an empty resolved children list was dropped: %s", out)
	}
}

func TestResolveRecursesIntoBlockTypes(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"address@1": list(field("text", "street", ""))},
	}}
	blocks := field("blocks", "content", `{"allowed_blocks":[{"type":"hero","name":"Hero","fields":`+list(fieldset("address", "address@1"))+`}]}`)
	spec := mustSpec(t, list(blocks))
	if got := Pins(spec); len(got) != 1 || got[0].Path != "/content/settings/allowed_blocks/0/fields/address/settings/blueprint" {
		t.Errorf("Pins = %+v", got)
	}
	resolved, err := Resolve(context.Background(), spec, fetcher)
	if err != nil {
		t.Fatal(err)
	}
	held, _ := blockTypeSpecs(resolved.Fields[0].Settings)
	if len(held) != 1 || len(held[0].fields[0].Children) != 1 {
		t.Fatalf("the Block Type's Fieldset was not resolved: %s", resolved.Fields[0].Settings)
	}
	if errs := ValidateResolvedSpec(resolved); len(errs) != 0 {
		t.Errorf("ValidateResolvedSpec = %v", errs)
	}
}

func TestResolveStoresOpaquePartsOnce(t *testing.T) {
	c, err := ParseCatalogue([]byte(`{"version":"9.9.9","types":[
		{"id":"prose","since":"9.9.9","positions":["root"],"consumers":[],"has_text":true,
		 "pins":[{"key":"text_type","kind":"text_type"}],
		 "settings_schema":{"type":"object","properties":{"text_type":{"type":"string"}},"additionalProperties":false}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	fetcher := &releases{byKind: map[string]map[string]string{
		"text_type": {"article@3": `{"nodes":["paragraph"]}`},
	}}
	spec := mustSpec(t, list(field("prose", "intro", `{"text_type":"article@3"}`), field("prose", "body", `{"text_type":"article@3"}`)))
	if got := c.Pins(spec); len(got) != 2 || got[0].Kind != "text_type" || got[0].Release != "article@3" {
		t.Errorf("Pins = %+v", got)
	}
	resolved, err := c.Resolve(context.Background(), spec, fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Catalogue != "9.9.9" {
		t.Errorf("catalogue = %q", resolved.Catalogue)
	}
	if len(fetcher.calls) != 1 {
		t.Errorf("calls = %v", fetcher.calls)
	}
	if string(resolved.Part("text_type", "article@3")) != `{"nodes":["paragraph"]}` {
		t.Errorf("parts = %v", resolved.Parts)
	}
	if resolved.Fields[0].Children != nil {
		t.Error("an opaque part was inlined")
	}
}

func TestResolveRefusesCycles(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {
			"a@1": list(fieldset("b", "b@1")),
			"b@1": list(fieldset("a", "a@1")),
		},
	}}
	_, err := Resolve(context.Background(), mustSpec(t, list(fieldset("root", "a@1"))), fetcher)
	code, path := resolveCode(t, err)
	if code != CodeResolveCycle || path != "/root/children/b/children/a/settings/blueprint" {
		t.Errorf("got %s at %s", code, path)
	}
}

func TestResolveCapsDepth(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {
			"a@1": list(fieldset("b", "b@1")),
			"b@1": list(fieldset("c", "c@1")),
			"c@1": list(field("text", "t", "")),
		},
	}}
	spec := mustSpec(t, list(fieldset("root", "a@1")))
	if _, err := Resolve(context.Background(), spec, fetcher, WithMaxDepth(3)); err != nil {
		t.Errorf("depth 3 within a cap of 3: %v", err)
	}
	_, err := Resolve(context.Background(), spec, fetcher, WithMaxDepth(2))
	code, path := resolveCode(t, err)
	if code != CodeResolveTooDeep || path != "/root/children/b/children/c/settings/blueprint" {
		t.Errorf("got %s at %s", code, path)
	}
}

func TestResolveCapsFetches(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"a@1": "[]", "b@1": "[]", "c@1": "[]"},
	}}
	spec := mustSpec(t, list(fieldset("a", "a@1"), fieldset("b", "b@1"), fieldset("again", "a@1"), fieldset("c", "c@1")))
	if _, err := Resolve(context.Background(), spec, fetcher, WithMaxFetches(3)); err != nil {
		t.Errorf("three Releases within a cap of 3: %v", err)
	}
	_, err := Resolve(context.Background(), spec, fetcher, WithMaxFetches(2))
	code, path := resolveCode(t, err)
	if code != CodeResolveTooManyFetches || path != "/c/settings/blueprint" {
		t.Errorf("got %s at %s", code, path)
	}
}

func TestResolveReportsFetchFailuresAndBadReleases(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"bad@1": `{"not":"a spec"}`},
	}}
	_, err := Resolve(context.Background(), mustSpec(t, list(fieldset("x", "missing@1"))), fetcher)
	if code, _ := resolveCode(t, err); code != CodeResolveFetchFailed {
		t.Errorf("got %s", code)
	}
	if !strings.Contains(err.Error(), "no such release") {
		t.Errorf("the fetcher's error is not wrapped: %v", err)
	}
	_, err = Resolve(context.Background(), mustSpec(t, list(fieldset("x", "bad@1"))), fetcher)
	if code, _ := resolveCode(t, err); code != CodeResolveInvalidRelease {
		t.Errorf("got %s", code)
	}
}

func TestPinsSkipsBlankAndUnknown(t *testing.T) {
	spec := mustSpec(t, list(
		field("fieldset", "blank", `{"blueprint":"  "}`),
		field("mystery", "m", `{"blueprint":"x@1"}`),
		field("group", "g", ""),
	))
	if got := Pins(spec); len(got) != 0 {
		t.Errorf("Pins = %+v", got)
	}
}

func TestValidateResolvedSpecChecksLinkedPositions(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"row@1": list(field("text", "sku", ""), field("group", "nested", ""))},
	}}
	spec := mustSpec(t, list(field("virtual_table", "lines", `{"blueprint":"row@1"}`)))
	if errs := ValidateSpec(spec); len(errs) != 0 {
		t.Fatalf("the authored Spec is valid: %v", errs)
	}
	resolved, err := Resolve(context.Background(), spec, fetcher)
	if err != nil {
		t.Fatal(err)
	}
	errs := ValidateResolvedSpec(resolved)
	if len(errs) != 1 || errs[0].Path != "/lines/children/nested" || errs[0].Code != CodePosition {
		t.Errorf("ValidateResolvedSpec = %v", errs)
	}
	// The authored rule still holds for the authored Spec.
	if errs := ValidateSpec(resolved.Fields); len(errs) == 0 || errs[0].Code != CodeVirtualTableRowSpecAmbiguous {
		t.Errorf("ValidateSpec on a Resolved Spec's Fields = %v", errs)
	}
}

func TestDecodeResolvedSpecRoundTrips(t *testing.T) {
	fetcher := &releases{byKind: map[string]map[string]string{
		"blueprint": {"address@1": "[]"},
	}}
	resolved, err := Resolve(context.Background(), mustSpec(t, list(fieldset("a", "address@1"))), fetcher)
	if err != nil {
		t.Fatal(err)
	}
	out, _ := json.Marshal(resolved)
	back, err := DecodeResolvedSpec(out)
	if err != nil {
		t.Fatal(err)
	}
	again, _ := json.Marshal(back)
	if string(out) != string(again) {
		t.Errorf("round trip:\n%s\n%s", out, again)
	}
	if _, err := DecodeResolvedSpec([]byte(`{"fields":[],"extra":1}`)); err == nil {
		t.Error("an unknown property was accepted")
	}
}
