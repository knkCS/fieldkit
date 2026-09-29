package publishing_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	fieldkit "github.com/knkcs/fieldkit/go"
	"github.com/knkcs/fieldkit/go/publishing"
)

const overlaySpec = `[
	{"field_type":"ti_overlay","config":{"name":"TI","api_accessor":"ti","required":false,"instructions":""},"settings":{"ti_set":"tis-1"},"system":false}
]`

const entry = `{"_id":"e1","content":"law1","anchor":{"node":"12","offset":3,"before":"abc","after":"def"},"command":"np","params":{"lines":"2"},"source":"editor","notes":"keep"}`

func resolveOverlay(t *testing.T, set string) *fieldkit.ResolvedSpec {
	t.Helper()
	fetcher := fieldkit.FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		if kind != publishing.TISetKind || release != "tis-1" {
			t.Fatalf("fetched %s %s", kind, release)
		}
		return json.RawMessage(set), nil
	})
	resolved, err := publishing.DefaultCatalogue().Resolve(context.Background(), decode(t, overlaySpec), fetcher)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func TestTIOverlayPinsATISetIntoParts(t *testing.T) {
	c := publishing.DefaultCatalogue()
	pins := c.Pins(decode(t, overlaySpec))
	if want := []fieldkit.Pin{{Path: "/ti/settings/ti_set", Kind: publishing.TISetKind, Release: "tis-1"}}; !reflect.DeepEqual(pins, want) {
		t.Errorf("Pins = %+v", pins)
	}
	set := `{"instructions":[{"code":"np"}]}`
	resolved := resolveOverlay(t, set)
	if got := string(resolved.Part(publishing.TISetKind, "tis-1")); got != set {
		t.Errorf("part = %s", got)
	}
}

func TestTIOverlayValues(t *testing.T) {
	spec := decode(t, overlaySpec)
	c := publishing.DefaultCatalogue()
	with := func(mutate string) string { return `{"ti":{"entries":[` + mutate + `]}}` }
	cases := map[string]struct {
		data string
		want map[string]string
	}{
		"an entry":  {with(entry), map[string]string{}},
		"no before": {with(`{"_id":"e1","content":"law1","anchor":{"node":"12","offset":0,"after":"d"},"command":"np","source":"oasys"}`), map[string]string{}},
		"core's published and drafts": {
			`{"ti":{"entries":[` + entry + `],"published":{"label":"x"},"drafts":[1]}}`,
			map[string]string{"/ti": fieldkit.CodeInvalidValue},
		},
		"an entry's status": {
			with(strings.Replace(entry, `"notes"`, `"status":"active","notes"`, 1)),
			map[string]string{"/ti/entries/e1": fieldkit.CodeInvalidValue},
		},
		"the old anchor": {
			with(`{"_id":"e1","content":"law1","anchor":{"blockId":"b","charOffsetInBlock":1},"command":"np","source":"editor"}`),
			map[string]string{"/ti/entries/e1/anchor": fieldkit.CodeInvalidValue, "/ti/entries/e1/anchor/node": fieldkit.CodeRequired, "/ti/entries/e1/anchor/offset": fieldkit.CodeRequired},
		},
		"20 code points, 40 UTF-16 units": {
			with(`{"_id":"e1","content":"law1","anchor":{"node":"1","offset":0,"after":"` + strings.Repeat("𝄞", 20) + `"},"command":"np","source":"editor"}`),
			map[string]string{},
		},
		"21 code points": {
			with(`{"_id":"e1","content":"law1","anchor":{"node":"1","offset":0,"before":"` + strings.Repeat("x", 21) + `"},"command":"np","source":"editor"}`),
			map[string]string{"/ti/entries/e1/anchor/before": fieldkit.CodeTooBig},
		},
		"a fractional offset": {
			with(`{"_id":"e1","content":"law1","anchor":{"node":"1","offset":1.5},"command":"np","source":"editor"}`),
			map[string]string{"/ti/entries/e1/anchor/offset": fieldkit.CodeInvalidType},
		},
		"a negative offset": {
			with(`{"_id":"e1","content":"law1","anchor":{"node":"1","offset":-1},"command":"np","source":"editor"}`),
			map[string]string{"/ti/entries/e1/anchor/offset": fieldkit.CodeTooSmall},
		},
		"rows": {
			with(`{"content":"law1","anchor":{"node":"1","offset":0},"command":"np","source":"editor"},` + entry + `,` + entry),
			map[string]string{"/ti/entries/0": fieldkit.CodeMissingID, "/ti/entries/2": fieldkit.CodeDuplicateID},
		},
		"a source, a param, notes": {
			with(`{"_id":"e1","content":"law1","anchor":{"node":"1","offset":0},"command":"np","params":{"lines":2},"source":"import","notes":3}`),
			map[string]string{"/ti/entries/e1/source": fieldkit.CodeInvalidValue, "/ti/entries/e1/params/lines": fieldkit.CodeInvalidType, "/ti/entries/e1/notes": fieldkit.CodeInvalidType},
		},
		"no content": {
			with(strings.Replace(entry, `"content":"law1",`, ``, 1)),
			map[string]string{"/ti/entries/e1/content": fieldkit.CodeRequired},
		},
		"a pin": {with(strings.Replace(entry, `"content":"law1",`, `"content":"law1","pin":"r1",`, 1)), map[string]string{}},
		"a content, a pin not strings": {
			with(strings.Replace(entry, `"content":"law1",`, `"content":5,"pin":7,`, 1)),
			map[string]string{"/ti/entries/e1/content": fieldkit.CodeInvalidType, "/ti/entries/e1/pin": fieldkit.CodeInvalidType},
		},
		"no entries":      {`{"ti":{"published":{"label":"x"}}}`, map[string]string{"/ti": fieldkit.CodeInvalidValue, "/ti/entries": fieldkit.CodeRequired}},
		"not an object":   {`{"ti":[1]}`, map[string]string{"/ti": fieldkit.CodeInvalidType}},
		"unknown command": {with(strings.Replace(entry, `"np"`, `"zz"`, 1)), map[string]string{}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := codes(c.ValidateValue(spec, json.RawMessage(tc.data))); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ValidateValue = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestTIOverlayCommandsAgainstTheTISet(t *testing.T) {
	c := publishing.DefaultCatalogue()
	data := json.RawMessage(`{"ti":{"entries":[` + entry + `,` + strings.Replace(strings.Replace(entry, `"np"`, `"zz"`, 1), `"e1"`, `"e2"`, 1) + `]}}`)

	resolved := resolveOverlay(t, `{"name":"House","instructions":[{"code":"np","directive":"x"},{"code":"bn"}]}`)
	want := map[string]string{"/ti/entries/e2/command": publishing.CodeUnknownCommand}
	if got := codes(c.ValidateResolvedValue(resolved, data)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateResolvedValue = %v, want %v", got, want)
	}

	for name, set := range map[string]string{
		"no instructions": `{"codes":["np"]}`,
		"a code missing":  `{"instructions":[{"code":"np"},{"label":"x"}]}`,
		"not an object":   `["np"]`,
	} {
		t.Run(name, func(t *testing.T) {
			want := map[string]string{"/ti": publishing.CodeInvalidTISet}
			if got := codes(c.ValidateResolvedValue(resolveOverlay(t, set), data)); !reflect.DeepEqual(got, want) {
				t.Errorf("ValidateResolvedValue = %v, want %v", got, want)
			}
		})
	}

	t.Run("a Resolved Spec without the part", func(t *testing.T) {
		bare := &fieldkit.ResolvedSpec{Fields: decode(t, overlaySpec)}
		want := map[string]string{"/ti": publishing.CodeInvalidTISet}
		if got := codes(c.ValidateResolvedValue(bare, data)); !reflect.DeepEqual(got, want) {
			t.Errorf("ValidateResolvedValue = %v, want %v", got, want)
		}
	})

	t.Run("a Field pinning no TI Set", func(t *testing.T) {
		spec := decode(t, strings.Replace(overlaySpec, `"settings":{"ti_set":"tis-1"},`, "", 1))
		resolved := &fieldkit.ResolvedSpec{Fields: spec}
		if got := codes(c.ValidateResolvedValue(resolved, data)); len(got) != 0 {
			t.Errorf("ValidateResolvedValue = %v", got)
		}
	})
}

func TestTIOverlaySitsAtTheRootAndYieldsAnAnchorEdgePerEntry(t *testing.T) {
	c := publishing.DefaultCatalogue()
	inReference := decode(t, `[{"field_type":"reference","config":{"name":"R","api_accessor":"r","required":false,"instructions":""},
		"settings":{"spec":[{"field_type":"ti_overlay","config":{"name":"TI","api_accessor":"ti","required":false,"instructions":""},"system":false}]},"system":false}]`)
	want := map[string]string{"/r/settings/spec/ti": fieldkit.CodeInvalidPosition}
	if got := codes(c.ValidateSpec(inReference)); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSpec = %v, want %v", got, want)
	}
	want = map[string]string{"/label": fieldkit.CodeUnknownSetting}
	if got := codes(c.ValidateSettings("ti_overlay", json.RawMessage(`{"ti_set":"x","label":"y"}`))); !reflect.DeepEqual(got, want) {
		t.Errorf("ValidateSettings = %v, want %v", got, want)
	}
	resolved := &fieldkit.ResolvedSpec{Fields: decode(t, overlaySpec)}
	pinned := strings.Replace(strings.Replace(entry, `"content":"law1",`, `"content":"law2","pin":"r1",`, 1), `"e1"`, `"e2"`, 1)
	unnamed := strings.Replace(strings.Replace(entry, `"content":"law1",`, `"content":"",`, 1), `"e1"`, `"e3"`, 1)
	data := json.RawMessage(`{"ti":{"entries":[` + entry + `,` + pinned + `,` + unnamed + `]}}`)
	wantEdges := []fieldkit.Edge{
		{Path: "/ti/entries/e1", Kind: fieldkit.EdgeAnchor, Target: fieldkit.Target{Content: "law1", Anchor: "12"}},
		{Path: "/ti/entries/e2", Kind: fieldkit.EdgeAnchor, Target: fieldkit.Target{Content: "law2", Pin: "r1", Anchor: "12"}},
	}
	if edges, err := c.Edges(resolved, data); err != nil || !reflect.DeepEqual(edges, wantEdges) {
		t.Errorf("Edges = %+v, %v, want %+v", edges, err, wantEdges)
	}
	if fieldkit.EdgeAnchor != "anchor" {
		t.Errorf("EdgeAnchor = %q", fieldkit.EdgeAnchor)
	}
	data = json.RawMessage(`{"ti":{"entries":[` + entry + `]}}`)
	if texts, err := c.Texts(resolved, data); err != nil || len(texts) != 0 {
		t.Errorf("Texts = %+v, %v", texts, err)
	}
}

func TestTIOverlayMintsEveryEntry(t *testing.T) {
	f := decode(t, overlaySpec)[0]
	value := json.RawMessage(`{"entries":[{"content":"law1","anchor":{"node":"1","offset":0},"command":"np","source":"editor"},` + entry + `,{"_id":"","content":"law1","anchor":{"node":"2","offset":1},"command":"np","source":"oasys"}]}`)
	// Without the package the type is unknown, and nothing is minted.
	if untouched, err := fieldkit.MintIDs(f, value, "content-1"); err != nil || strings.Count(string(untouched), `"_id"`) != 2 {
		t.Fatalf("fieldkit.MintIDs = %s, %v", untouched, err)
	}
	c := publishing.DefaultCatalogue()
	first, err := c.MintIDs(f, value, "content-1")
	if err != nil {
		t.Fatal(err)
	}
	if again, _ := c.MintIDs(f, value, "content-1"); string(first) != string(again) {
		t.Errorf("minting is not deterministic:\n%s\n%s", first, again)
	}
	var minted struct {
		Entries []map[string]any `json:"entries"`
	}
	if err := json.Unmarshal(first, &minted); err != nil {
		t.Fatal(err)
	}
	a, _ := minted.Entries[0]["_id"].(string)
	b, _ := minted.Entries[2]["_id"].(string)
	if a == "" || b == "" || a == b || minted.Entries[1]["_id"] != "e1" {
		t.Errorf("MintIDs = %s", first)
	}
	if errs := c.ValidateValue(decode(t, overlaySpec), json.RawMessage(`{"ti":`+string(first)+`}`)); len(errs) != 0 {
		t.Errorf("the minted value is invalid: %+v", errs)
	}
	// A value not of the type's shape is returned as it is.
	if out, err := c.MintIDs(f, json.RawMessage(`["x"]`), "content-1"); err != nil || string(out) != `["x"]` {
		t.Errorf("MintIDs(not an overlay) = %s, %v", out, err)
	}
}

func TestTIOverlayComparesAndMergesPerEntry(t *testing.T) {
	c := publishing.DefaultCatalogue()
	resolved := resolveOverlay(t, `{"instructions":[{"code":"np"}]}`)
	fields, err := c.SchemaFields(resolved)
	if err != nil {
		t.Fatal(err)
	}
	f := fields[0]
	merger, ok := f.Type.(fieldkit.Merger)
	if !ok {
		t.Fatal("ti_overlay is not a Merger")
	}
	e2 := strings.Replace(entry, `"e1"`, `"e2"`, 1)
	value := func(entries ...string) json.RawMessage {
		return json.RawMessage(`{"entries":[` + strings.Join(entries, ",") + `]}`)
	}

	equal, detail, err := f.Type.Compare(f.Settings, value(entry, e2), value(e2, strings.Replace(entry, `"keep"`, `"move"`, 1)))
	if err != nil || equal {
		t.Fatalf("Compare = %v, %s, %v", equal, detail, err)
	}
	var d fieldkit.CompareDetail
	if err := json.Unmarshal(detail, &d); err != nil {
		t.Fatal(err)
	}
	items := d.Fields["entries"].Items
	if len(items) != 2 || items[1].ID != "e1" || items[1].Status != fieldkit.StatusChanged || items[1].Fields["notes"].Status == "" {
		t.Errorf("detail = %s", detail)
	}

	base := value(entry, e2)
	ours := value(strings.Replace(entry, `"keep"`, `"ours"`, 1), e2)
	theirs := value(entry, strings.Replace(e2, `"np"`, `"bn"`, 1))
	merged, conflicts, err := merger.Merge(f.Settings, base, ours, theirs)
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("Merge = %s, %v, %v", merged, conflicts, err)
	}
	if !strings.Contains(string(merged), `"ours"`) || !strings.Contains(string(merged), `"bn"`) {
		t.Errorf("merged = %s", merged)
	}

	theirs = value(strings.Replace(entry, `"keep"`, `"theirs"`, 1), e2)
	_, conflicts, err = merger.Merge(f.Settings, base, ours, theirs)
	if err != nil || !reflect.DeepEqual(conflicts, []string{"entries/e1/notes"}) {
		t.Errorf("conflicts = %v, %v", conflicts, err)
	}
}
