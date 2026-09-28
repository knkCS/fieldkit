package fieldkit

import (
	"encoding/json"
	"os"
	"testing"
)

// TestIsURL replays testdata/urls.json: strings, and whether JS's new URL()
// parsed each without a base — which is what Zod's url() accepts. The file
// was recorded with Node; record it again from Node when adding a case.
func TestIsURL(t *testing.T) {
	data, err := os.ReadFile("testdata/urls.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		S  string `json:"s"`
		OK bool   `json:"ok"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := isURL(c.S); got != c.OK {
			t.Errorf("isURL(%q) = %v, new URL() says %v", c.S, got, c.OK)
		}
	}
}
