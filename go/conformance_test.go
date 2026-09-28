package fieldkit

import (
	"bytes"
	"encoding/json"
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
var operations = []string{"validateSpec"} //nolint:gochecknoglobals

type expectedError struct {
	Path string `json:"path"`
	Code string `json:"code"`
}

type fixture struct {
	Description string                     `json:"description"`
	Spec        json.RawMessage            `json:"spec"`
	Expect      map[string]json.RawMessage `json:"expect"`
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
			if len(fx.Expect) == 0 {
				t.Fatal("fixture expects nothing")
			}
			for op, raw := range fx.Expect {
				switch op {
				case "validateSpec":
					runValidateSpec(t, fx, raw)
				default:
					t.Errorf("unknown operation %q (this runner implements %v)", op, operations)
				}
			}
		})
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
	for _, e := range ValidateSpec(spec) {
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
