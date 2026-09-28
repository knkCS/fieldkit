package fieldkit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The Go runner for the shared conformance fixtures. It replays the same files
// as the TS runner (src/schema/__tests__/conformance.test.ts) and expects the
// same results. The format is in conformance/README.md: a fixture is a .json
// file directly inside an area folder of a version folder.

const conformanceDir = "../conformance"

// operations are the operations this runner implements. A fixture expecting
// another fails, so a fixture is never silently skipped by one runner.
var operations = []string{"validateSpec", "validateValue", "resolve", "pins", "validateResolvedSpec", "edges", "texts", "compare", "merge"} //nolint:gochecknoglobals

type expectedError struct {
	Path string `json:"path"`
	Code string `json:"code"`
}

type fixture struct {
	Description string          `json:"description"`
	Spec        json.RawMessage `json:"spec"`
	Data        json.RawMessage `json:"data,omitempty"`
	// Revisions are named versions of the data, for compare (a, b) and merge
	// (base, ours, theirs).
	Revisions map[string]map[string]json.RawMessage `json:"revisions,omitempty"`
	// Releases are what resolving spec fetches: kind → Release id → JSON.
	Releases map[string]map[string]json.RawMessage `json:"releases,omitempty"`
	// ResolveOptions override Resolve's caps.
	ResolveOptions *struct {
		MaxFetches *int `json:"maxFetches,omitempty"`
		MaxDepth   *int `json:"maxDepth,omitempty"`
	} `json:"resolveOptions,omitempty"`
	// GoOnly are operations of this fixture the TS runner skips: rich text,
	// which only Go reads through knkeditor (#216). This runner runs them
	// all, and only checks that each is expected.
	GoOnly []string `json:"goOnly,omitempty"`
	// Targets are the Blueprint of each referenced Content, by its id, for
	// the value operations (WithTargetBlueprints).
	Targets map[string]string `json:"targets,omitempty"`
	// Packages are the opt-in packages whose Catalogue section this
	// fixture's operations run against, beside the embedded Catalogue.
	Packages []string                   `json:"packages,omitempty"`
	Expect   map[string]json.RawMessage `json:"expect"`

	// catalogue is the Catalogue every operation of the fixture runs
	// against: DefaultCatalogue with each of Packages' sections.
	catalogue *Catalogue
}

// ConformancePackages are the Catalogue sections a fixture's packages may
// name, by package name. This package cannot import the packages that
// define them — they import it — so the external test package adds them
// (conformance_packages_test.go) before any test runs.
var ConformancePackages = map[string]*Catalogue{} //nolint:gochecknoglobals

// catalogueOf is the Catalogue a fixture's operations run against.
func catalogueOf(packages []string) (*Catalogue, error) {
	sections := make([]*Catalogue, 0, len(packages))
	for _, name := range packages {
		section, ok := ConformancePackages[name]
		if !ok {
			return nil, fmt.Errorf("unknown package %q", name)
		}
		sections = append(sections, section)
	}
	if len(sections) == 0 {
		return DefaultCatalogue(), nil
	}
	return DefaultCatalogue().With(sections...)
}

// valueOptions are the options a fixture's targets make.
func (fx fixture) valueOptions() []ValueOption {
	if fx.Targets == nil {
		return nil
	}
	return []ValueOption{WithTargetBlueprints(func(id string) string { return fx.Targets[id] })}
}

// inRepository skips a test that reads the repository around the module when
// the module runs outside it — from the module cache, as a dependency's tests
// do in "go test all": the fixtures are not part of the module.
func inRepository(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(filepath.Join(conformanceDir, "README.md")); err != nil {
		t.Skip("outside the fieldkit repository: the shared fixtures are not part of the module")
	}
}

func TestConformance(t *testing.T) {
	inRepository(t)
	files, err := filepath.Glob(filepath.Join(conformanceDir, "*", "*", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no conformance fixtures found")
	}
	for _, file := range files {
		name, _ := filepath.Rel(conformanceDir, file)
		t.Run(filepath.ToSlash(name), func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var fx fixture
			if err := decodeStrict(data, &fx); err != nil {
				t.Fatalf("malformed fixture: %v", err)
			}
			if fx.Description == "" {
				t.Error("fixture has no description")
			}
			if fx.catalogue, err = catalogueOf(fx.Packages); err != nil {
				t.Fatalf("packages: %v", err)
			}
			if len(fx.Expect) == 0 {
				t.Fatal("fixture expects nothing")
			}
			for _, op := range fx.GoOnly {
				if _, ok := fx.Expect[op]; !ok {
					t.Errorf("goOnly %q is not expected", op)
				}
			}
			version := strings.SplitN(filepath.ToSlash(name), "/", 2)[0]
			bound := 0
			for op, raw := range fx.Expect {
				if !binds(version, op, raw) {
					continue
				}
				bound++
				switch op {
				case "validateSpec":
					runValidateSpec(t, fx, raw)
				case "validateValue":
					runValidateValue(t, fx, raw)
				case "resolve":
					runResolve(t, fx, raw)
				case "pins":
					runPins(t, fx, raw)
				case "validateResolvedSpec":
					runValidateResolvedSpec(t, fx, raw)
				case "edges":
					runEdges(t, fx, raw)
				case "texts":
					runTexts(t, fx, raw)
				case "compare":
					runCompare(t, fx, raw)
				case "merge":
					runMerge(t, fx, raw)
				default:
					t.Errorf("unknown operation %q (this runner implements %v)", op, operations)
				}
			}
			if bound == 0 {
				t.Skip("an invalid case of a released version: kept as history, binding nothing (ADR-0019)")
			}
		})
	}
}

// unreleased is the folder of fieldkit as it is now; every other folder is a
// released version.
const unreleased = "unreleased"

// binds reports whether a fixture's expectation for one operation binds the
// current code. Everything in unreleased/ does. In a released version's folder
// only the valid cases do (ADR-0019): what a release accepted stays accepted,
// but what it rejected may since have become valid — a validation bug is
// fixed by loosening. An operation this runner does not know binds, so it
// still fails as unknown rather than being skipped. The TS runner has the
// same rule.
func binds(version, op string, raw json.RawMessage) bool {
	if version == unreleased {
		return true
	}
	switch op {
	// Both operations answer with a list of errors, and a valid case is an
	// empty one.
	case "validateSpec", "validateValue", "validateResolvedSpec":
		var want []json.RawMessage
		if err := json.Unmarshal(raw, &want); err != nil {
			return true // malformed: let the run report it
		}
		return len(want) == 0
	// A refusal may loosen, as an invalid case may; an envelope binds.
	case "resolve":
		var want struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(raw, &want); err != nil {
			return true
		}
		return want.Error == ""
	// A Conflict may become a clean merge once a type merges finer; a clean
	// merge binds, as a Compare does.
	case "merge":
		return !mergeConflicts(raw)
	default:
		return true
	}
}

func TestBinds(t *testing.T) {
	invalid := json.RawMessage(`[{"path":"/a","code":"unknown_setting"}]`)
	cases := []struct {
		name, version, op string
		raw               json.RawMessage
		want              bool
	}{
		{"an unreleased valid case", unreleased, "validateSpec", json.RawMessage(`[]`), true},
		{"an unreleased invalid case", unreleased, "validateSpec", invalid, true},
		{"a released valid case", "0.18.0", "validateSpec", json.RawMessage(`[]`), true},
		{"a released invalid case", "0.18.0", "validateSpec", invalid, false},
		{"a released valid value", "0.18.0", "validateValue", json.RawMessage(`[]`), true},
		{"a released invalid value", "0.18.0", "validateValue", invalid, false},
		{"an operation the runner does not know", "0.18.0", "somethingNew", invalid, true},
		{"a released envelope", "0.18.0", "resolve", json.RawMessage(`{"vocabulary":"","fields":[],"parts":{}}`), true},
		{"a released refusal", "0.18.0", "resolve", json.RawMessage(`{"error":"resolve_cycle"}`), false},
		{"a released invalid Resolved Spec", "0.18.0", "validateResolvedSpec", invalid, false},
		{"released Pins", "0.18.0", "pins", json.RawMessage(`[]`), true},
		{"a released Compare", "0.18.0", "compare", json.RawMessage(`{"a":{"equal":true}}`), true},
		{"a released clean merge", "0.18.0", "merge", json.RawMessage(`{"a":{"merged":[]}}`), true},
		{"a released conflict", "0.18.0", "merge", json.RawMessage(`{"a":{"conflicts":["x"]}}`), false},
	}
	for _, c := range cases {
		if got := binds(c.version, c.op, c.raw); got != c.want {
			t.Errorf("%s: binds = %v, want %v", c.name, got, c.want)
		}
	}
}

func runValidateSpec(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []expectedError
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed validateSpec expectation: %v", err)
	}
	spec, err := DecodeSpec(fx.Spec)
	if err != nil {
		t.Fatalf("DecodeSpec: %v", err)
	}
	got := []expectedError{}
	for _, e := range fx.catalogue.ValidateSpec(spec) {
		got = append(got, expectedError{Path: e.Path, Code: e.Code})
	}
	if want == nil {
		want = []expectedError{}
	}
	sortErrors(got)
	sortErrors(want)
	if !slices.Equal(got, want) {
		t.Errorf("validateSpec\n got: %s\nwant: %s", show(got), show(want))
	}
}

func runValidateValue(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []expectedError
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed validateValue expectation: %v", err)
	}
	spec, err := DecodeSpec(fx.Spec)
	if err != nil {
		t.Fatalf("DecodeSpec: %v", err)
	}
	errs := fx.catalogue.ValidateValue(spec, fx.Data, fx.valueOptions()...)
	// A fixture with releases validates against its Resolved Spec: a
	// rich_text Field's Text Type is in its parts.
	if len(fx.Releases) > 0 {
		resolved, err := resolveFixture(t, fx)
		if err != nil {
			t.Fatalf("resolve: %v", err)
		}
		errs = fx.catalogue.ValidateResolvedValue(resolved, fx.Data, fx.valueOptions()...)
	}
	got := []expectedError{}
	for _, e := range errs {
		got = append(got, expectedError{Path: e.Path, Code: e.Code})
	}
	if want == nil {
		want = []expectedError{}
	}
	sortErrors(got)
	sortErrors(want)
	if !slices.Equal(got, want) {
		t.Errorf("validateValue\n got: %s\nwant: %s", show(got), show(want))
	}
}

func sortErrors(errs []expectedError) {
	slices.SortFunc(errs, func(a, b expectedError) int {
		if c := strings.Compare(a.Path, b.Path); c != 0 {
			return c
		}
		return strings.Compare(a.Code, b.Code)
	})
}

func show(errs []expectedError) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetIndent("", "  ")
	_ = enc.Encode(errs)
	return b.String()
}
