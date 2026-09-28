package fieldkit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The conformance runner's resolve operations: resolve, pins and
// validateResolvedSpec (conformance/README.md).

// fixtureFetcher fetches a fixture's releases.
func fixtureFetcher(fx fixture) Fetcher {
	return FetcherFunc(func(_ context.Context, kind, release string) (json.RawMessage, error) {
		raw, ok := fx.Releases[kind][release]
		if !ok {
			return nil, fmt.Errorf("the fixture has no %s Release %q", kind, release)
		}
		return raw, nil
	})
}

func resolveFixture(t *testing.T, fx fixture) (*ResolvedSpec, error) {
	t.Helper()
	spec, err := DecodeSpec(fx.Spec)
	if err != nil {
		t.Fatalf("DecodeSpec: %v", err)
	}
	var opts []ResolveOption
	if o := fx.ResolveOptions; o != nil {
		if o.MaxFetches != nil {
			opts = append(opts, WithMaxFetches(*o.MaxFetches))
		}
		if o.MaxDepth != nil {
			opts = append(opts, WithMaxDepth(*o.MaxDepth))
		}
	}
	return Resolve(context.Background(), spec, fixtureFetcher(fx), opts...)
}

// runResolve compares the envelope with the expected one — whose catalogue
// is left out, since it is always the running Catalogue's version — or the
// refusal's code with the expected error.
func runResolve(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want map[string]any
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatalf("malformed resolve expectation: %v", err)
	}
	resolved, err := resolveFixture(t, fx)
	if code, ok := want["error"]; ok {
		var re *ResolveError
		if !errors.As(err, &re) {
			t.Fatalf("resolve: want %v, got %v", code, err)
		}
		if re.Code != code {
			t.Errorf("resolve: want %v, got %s", code, re.Code)
		}
		return
	}
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.Catalogue != DefaultCatalogue().Version {
		t.Errorf("catalogue = %q, want %q", resolved.Catalogue, DefaultCatalogue().Version)
	}
	encoded, err := json.Marshal(resolved)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	delete(got, "catalogue")
	if !reflect.DeepEqual(got, want) {
		gotJSON, _ := json.MarshalIndent(got, "", "  ")
		wantJSON, _ := json.MarshalIndent(want, "", "  ")
		t.Errorf("resolve\n got: %s\nwant: %s", gotJSON, wantJSON)
	}
}

func runPins(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []Pin
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed pins expectation: %v", err)
	}
	spec, err := DecodeSpec(fx.Spec)
	if err != nil {
		t.Fatalf("DecodeSpec: %v", err)
	}
	got := Pins(spec)
	if want == nil {
		want = []Pin{}
	}
	byPath := func(a, b Pin) int { return strings.Compare(a.Path, b.Path) }
	slices.SortFunc(got, byPath)
	slices.SortFunc(want, byPath)
	if !slices.Equal(got, want) {
		t.Errorf("pins\n got: %+v\nwant: %+v", got, want)
	}
}

func runValidateResolvedSpec(t *testing.T, fx fixture, raw json.RawMessage) {
	t.Helper()
	var want []expectedError
	if err := decodeStrict(raw, &want); err != nil {
		t.Fatalf("malformed validateResolvedSpec expectation: %v", err)
	}
	resolved, err := resolveFixture(t, fx)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	got := []expectedError{}
	for _, e := range ValidateResolvedSpec(resolved) {
		got = append(got, expectedError{Path: e.Path, Code: e.Code})
	}
	if want == nil {
		want = []expectedError{}
	}
	sortErrors(got)
	sortErrors(want)
	if !slices.Equal(got, want) {
		t.Errorf("validateResolvedSpec\n got: %s\nwant: %s", show(got), show(want))
	}
}
