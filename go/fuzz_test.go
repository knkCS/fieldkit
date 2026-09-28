package fieldkit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// Fuzz targets for everything a service hands untrusted JSON (fieldkit#222):
// decoding and validating a Spec, resolving one, validating a value and
// walking it, and Compare and Merge under any Settings. The rule is the same
// for each: whatever the input, no panic — an error, or an answer.
//
// `go test` runs each target over its seed corpus: the shared conformance
// fixtures (every version folder, so a released fixture keeps seeding) plus
// testdata/fuzz/<target>/, where a failing input found by fuzzing is kept as
// a regression case. `npm run verify` fuzzes each target for a few seconds,
// `npm run verify:full` for longer (scripts/fuzz-go.sh).

// fuzzFixtures are the shared conformance fixtures, in a stable order; none
// outside the repository (the module cache), where the targets start from
// their own seeds alone.
func fuzzFixtures(f *testing.F) []fixture {
	f.Helper()
	files, err := filepath.Glob(filepath.Join(conformanceDir, "*", "*", "*.json"))
	if err != nil {
		f.Fatal(err)
	}
	slices.Sort(files)
	out := make([]fixture, 0, len(files))
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			f.Fatal(err)
		}
		var fx fixture
		if err := json.Unmarshal(data, &fx); err != nil {
			f.Fatalf("%s: %v", file, err)
		}
		out = append(out, fx)
	}
	return out
}

// fuzzReleases are every fixture's Releases in one store, the first fixture
// naming a Release winning: the in-memory fetcher every target resolves
// through, so a Spec pinning a Blueprint or a Text Type a fixture holds
// resolves.
func fuzzReleases(fixtures []fixture) Fetcher {
	store := map[string]map[string]json.RawMessage{}
	for _, fx := range fixtures {
		for kind, byID := range fx.Releases {
			if store[kind] == nil {
				store[kind] = map[string]json.RawMessage{}
			}
			for id, raw := range byID {
				if _, ok := store[kind][id]; !ok {
					store[kind][id] = raw
				}
			}
		}
	}
	return FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		raw, ok := store[kind][release]
		if !ok {
			return nil, errors.New("no such release")
		}
		return raw, nil
	})
}

// fuzzTargets answers every Reference's Blueprint, so a Reference Spec linked
// for one is exercised.
func fuzzTargets(id string) string {
	if id == "" {
		return ""
	}
	return "bp-" + id[:1]
}

// fuzzCaps keep one fuzzed resolve small: a fetcher answering every Pin alike
// would otherwise walk to the default caps on every input.
var fuzzCaps = []ResolveOption{WithMaxFetches(16), WithMaxDepth(6)} //nolint:gochecknoglobals

// FuzzSpec: DecodeSpec, ValidateSpec, Pins, and the same for a Resolved Spec
// — DecodeResolvedSpec, ValidateResolvedSpec, SchemaFields — never panic.
func FuzzSpec(f *testing.F) {
	f.Add([]byte(`[]`))
	f.Add([]byte(`{"catalogue":"","vocabulary":"","fields":[],"parts":{}}`))
	for _, fx := range fuzzFixtures(f) {
		f.Add([]byte(fx.Spec))
		for _, byID := range fx.Releases {
			for _, raw := range byID {
				f.Add([]byte(raw))
			}
		}
		if raw, ok := fx.Expect["resolve"]; ok {
			f.Add([]byte(raw))
		}
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		if spec, err := DecodeSpec(data); err == nil {
			_ = ValidateSpec(spec)
			_ = Pins(spec)
			_, _ = SchemaFields(&ResolvedSpec{Fields: spec})
		}
		if resolved, err := DecodeResolvedSpec(data); err == nil {
			_ = ValidateResolvedSpec(resolved)
			_, _ = SchemaFields(resolved)
			_, _ = json.Marshal(resolved)
		}
	})
}

// FuzzResolve: Resolve never panics, whatever the Spec and whatever the
// fetcher answers — here, one Release for every Pin.
func FuzzResolve(f *testing.F) {
	f.Add([]byte(`[]`), []byte(`[]`))
	for _, fx := range fuzzFixtures(f) {
		if len(fx.Releases) == 0 {
			f.Add([]byte(fx.Spec), []byte(`[]`))
		}
		for _, byID := range fx.Releases {
			for _, raw := range byID {
				f.Add([]byte(fx.Spec), []byte(raw))
			}
		}
	}
	f.Fuzz(func(t *testing.T, specData, release []byte) {
		spec, err := DecodeSpec(specData)
		if err != nil {
			return
		}
		fetcher := FetcherFunc(func(context.Context, string, string) (json.RawMessage, error) {
			return json.RawMessage(release), nil
		})
		resolved, err := Resolve(context.Background(), spec, fetcher, fuzzCaps...)
		if err != nil {
			return
		}
		_ = ValidateResolvedSpec(resolved)
		_, _ = SchemaFields(resolved)
	})
}

// FuzzValue: ValidateValue, ValidateResolvedValue, Edges, Texts and MintIDs
// never panic, whatever the Spec and the data — Edges and Texts included,
// though they are meant for data ValidateValue accepted.
func FuzzValue(f *testing.F) {
	fixtures := fuzzFixtures(f)
	f.Add([]byte(`[]`), []byte(`{}`))
	for _, fx := range fixtures {
		if len(fx.Data) > 0 {
			f.Add([]byte(fx.Spec), []byte(fx.Data))
		}
		for _, revision := range fx.Revisions {
			data, err := json.Marshal(revision)
			if err != nil {
				f.Fatal(err)
			}
			f.Add([]byte(fx.Spec), data)
		}
	}
	fetcher := fuzzReleases(fixtures)
	targets := WithTargetBlueprints(fuzzTargets)
	f.Fuzz(func(t *testing.T, specData, data []byte) {
		spec, err := DecodeSpec(specData)
		if err != nil {
			return
		}
		_ = ValidateValue(spec, data, targets)
		var byAccessor map[string]json.RawMessage
		_ = json.Unmarshal(data, &byAccessor)
		for _, field := range spec {
			value, ok := byAccessor[field.Config.APIAccessor]
			if !ok {
				value = data
			}
			_, _ = MintIDs(field, value, "seed")
		}
		resolved, err := Resolve(context.Background(), spec, fetcher, fuzzCaps...)
		if err != nil {
			return
		}
		_ = ValidateResolvedValue(resolved, data, targets)
		_, _ = Edges(resolved, data, targets)
		_, _ = Texts(resolved, data, targets)
	})
}

// FuzzSchemaSettings: a SchemaField's Compare and Merge never panic, whatever
// Settings they are handed back and whatever the values — every type's, as
// both the finer and the whole-value rule.
func FuzzSchemaSettings(f *testing.F) {
	fixtures := fuzzFixtures(f)
	fetcher := fuzzReleases(fixtures)
	f.Add([]byte(`{}`), []byte(`null`), []byte(`[]`), []byte(`{}`))
	for _, fx := range fixtures {
		spec, err := DecodeSpec(fx.Spec)
		if err != nil {
			continue
		}
		resolved, err := Resolve(context.Background(), spec, fetcher)
		if err != nil {
			continue
		}
		fields, err := SchemaFields(resolved)
		if err != nil {
			continue
		}
		var data map[string]json.RawMessage
		_ = json.Unmarshal(fx.Data, &data)
		base, ours, theirs := fx.Revisions["base"], fx.Revisions["ours"], fx.Revisions["theirs"]
		if base == nil {
			base, ours, theirs = fx.Revisions["a"], fx.Revisions["a"], fx.Revisions["b"]
		}
		for _, sf := range fields {
			value := func(r map[string]json.RawMessage) []byte {
				if v, ok := r[sf.Accessor]; ok {
					return v
				}
				if v, ok := data[sf.Accessor]; ok {
					return v
				}
				return []byte(`null`)
			}
			f.Add([]byte(sf.Settings), value(base), value(ours), value(theirs))
		}
	}
	f.Fuzz(func(t *testing.T, settings, base, ours, theirs []byte) {
		for _, c := range []Comparer{finerValueType{}, wholeValueType{}} {
			_, _, _ = c.Compare(settings, ours, theirs)
			if m, ok := c.(Merger); ok {
				_, _, _ = m.Merge(settings, base, ours, theirs)
			}
		}
		if s, err := DecodeSchemaSettings(settings); err == nil {
			_, _ = MintIDs(s.Field, ours, "seed")
		}
	})
}

// fuzzOddValues are what FuzzShapes puts where a fixture had something else:
// each JSON kind, the edges of a number, and the shapes a row, a node and a
// Pin are recognised by, wrong.
var fuzzOddValues = []string{ //nolint:gochecknoglobals
	`null`, `true`, `0`, `-1`, `1.5`, `1e308`, `-1e308`, `""`, `" "`, `"x"`, `"a@1"`,
	`[]`, `{}`, `[null]`, `[{}]`, `{"_id":1}`, `{"_id":"a"}`, `[{"_id":"a"},{"_id":"a"}]`,
	`{"type":"doc"}`, `{"type":"doc","content":{}}`, `{"blueprint":1}`, `[[[[[[]]]]]]`,
}

// fuzzNode is one value inside a decoded JSON tree, and how to replace it.
type fuzzNode struct {
	value any
	set   func(any)
}

// fuzzNodes lists every value under root — root excluded — in a stable
// order: object keys sorted.
func fuzzNodes(root any) []fuzzNode {
	var out []fuzzNode
	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			keys := make([]string, 0, len(x))
			for k := range x {
				keys = append(keys, k)
			}
			slices.Sort(keys)
			for _, k := range keys {
				out = append(out, fuzzNode{value: x[k], set: func(n any) { x[k] = n }})
				walk(x[k])
			}
		case []any:
			for i := range x {
				out = append(out, fuzzNode{value: x[i], set: func(n any) { x[i] = n }})
				walk(x[i])
			}
		}
	}
	walk(root)
	return out
}

// fuzzMutate replaces values inside root as choices say, two bytes a
// replacement, at most eight: the first picks the value, the second an odd
// value or — past them — a copy of another value in the tree, so a row turns
// up where a setting was and a setting where a row was.
func fuzzMutate(root any, choices []byte) any {
	for i := 0; i+1 < len(choices) && i < 16; i += 2 {
		nodes := fuzzNodes(root)
		if len(nodes) == 0 {
			return root
		}
		target := nodes[int(choices[i])%len(nodes)]
		pick := int(choices[i+1])
		if pick < len(fuzzOddValues) {
			target.set(fuzzDecode([]byte(fuzzOddValues[pick])))
		} else {
			// A copy, so the tree never holds itself.
			raw, _ := json.Marshal(nodes[pick%len(nodes)].value)
			target.set(fuzzDecode(raw))
		}
	}
	return root
}

// fuzzDecode decodes JSON text keeping each number's spelling, so a number
// past float64 survives the round trip.
func fuzzDecode(raw []byte) any {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	_ = dec.Decode(&v)
	return v
}

// FuzzShapes mutates a fixture's Spec, data and revisions structurally —
// byte-level mutation of JSON text rarely yields a different JSON value — and
// runs everything a service does with them: validate the Spec, resolve it,
// validate the data against both, walk it, and Compare and Merge every Field.
// A value of the wrong shape anywhere is an error or an answer, never a panic.
func FuzzShapes(f *testing.F) {
	fixtures := fuzzFixtures(f)
	if len(fixtures) == 0 {
		f.Skip("outside the fieldkit repository: the shared fixtures are not part of the module")
	}
	fetcher := fuzzReleases(fixtures)
	for i := range fixtures {
		f.Add(uint16(i), []byte{})
		f.Add(uint16(i), []byte{3, 11, 7, 200})
	}
	targets := WithTargetBlueprints(fuzzTargets)
	f.Fuzz(func(t *testing.T, which uint16, choices []byte) {
		fx := fixtures[int(which)%len(fixtures)]
		raw, err := json.Marshal(map[string]any{"spec": fx.Spec, "data": fx.Data, "revisions": fx.Revisions})
		if err != nil {
			t.Fatal(err)
		}
		root, _ := fuzzMutate(fuzzDecode(raw), choices).(map[string]any)
		specData, _ := json.Marshal(root["spec"])
		data, _ := json.Marshal(root["data"])
		spec, err := DecodeSpec(specData)
		if err != nil {
			return
		}
		_ = ValidateSpec(spec)
		_ = Pins(spec)
		_ = ValidateValue(spec, data, targets)
		resolved, err := Resolve(context.Background(), spec, fetcher, fuzzCaps...)
		if err != nil {
			return
		}
		_ = ValidateResolvedSpec(resolved)
		_ = ValidateResolvedValue(resolved, data, targets)
		_, _ = Edges(resolved, data, targets)
		_, _ = Texts(resolved, data, targets)
		fields, err := SchemaFields(resolved)
		if err != nil {
			return
		}
		revisions, _ := root["revisions"].(map[string]any)
		value := func(name, accessor string) json.RawMessage {
			r, _ := revisions[name].(map[string]any)
			v, ok := r[accessor]
			if !ok {
				return json.RawMessage(`null`)
			}
			encoded, _ := json.Marshal(v)
			return encoded
		}
		for _, sf := range fields {
			_, _ = MintIDs(fieldOf(resolved, sf.Accessor), value("a", sf.Accessor), "seed")
			_, _, _ = sf.Type.Compare(sf.Settings, value("a", sf.Accessor), value("b", sf.Accessor))
			if m, ok := sf.Type.(Merger); ok {
				_, _, _ = m.Merge(sf.Settings, value("base", sf.Accessor), value("ours", sf.Accessor), value("theirs", sf.Accessor))
			}
		}
	})
}

// fieldOf is the top-level Field of resolved with accessor.
func fieldOf(resolved *ResolvedSpec, accessor string) Field {
	for _, f := range resolved.Fields {
		if f.Config.APIAccessor == accessor {
			return f
		}
	}
	return Field{}
}
