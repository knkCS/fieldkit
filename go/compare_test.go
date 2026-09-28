package fieldkit

import (
	"encoding/json"
	"slices"
	"testing"
)

// schemaField is the SchemaField of one Field, built as the adapter builds it.
func schemaField(t *testing.T, field string) SchemaField {
	t.Helper()
	spec, err := DecodeSpec([]byte("[" + field + "]"))
	if err != nil {
		t.Fatal(err)
	}
	fields, err := SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		t.Fatal(err)
	}
	return fields[0]
}

const tableField = `{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[
	{"field_type":"text","config":{"name":"Cell","api_accessor":"cell","required":false,"instructions":""},"system":false},
	{"field_type":"group","config":{"name":"Items","api_accessor":"items","required":false,"instructions":""},"children":[
		{"field_type":"number","config":{"name":"Qty","api_accessor":"qty","required":false,"instructions":""},"system":false}
	],"system":false}
],"system":false}`

func merge(t *testing.T, f SchemaField, base, ours, theirs string) (string, []string) {
	t.Helper()
	merger, ok := f.Type.(Merger)
	if !ok {
		t.Fatalf("%s is not a Merger", f.TypeID)
	}
	merged, conflicts, err := merger.Merge(f.Settings, json.RawMessage(base), json.RawMessage(ours), json.RawMessage(theirs))
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	return string(merged), conflicts
}

func TestMergeRows(t *testing.T) {
	f := schemaField(t, tableField)
	cases := []struct {
		name, base, ours, theirs string
		merged                   string
		conflicts                []string
	}{
		{
			name:   "a side that changed only a number's spelling did not change it",
			base:   `[{"_id":"a","cell":"x","items":[{"_id":"i","qty":1}]}]`,
			ours:   `[{"_id":"a","cell":"y","items":[{"_id":"i","qty":1.0}]}]`,
			theirs: `[{"_id":"a","cell":"x","items":[{"_id":"i","qty":2}]}]`,
			merged: `[{"_id":"a","cell":"y","items":[{"_id":"i","qty":2}]}]`,
		},
		{
			name:   "a row both sides removed is removed",
			base:   `[{"_id":"a"},{"_id":"b"}]`,
			ours:   `[{"_id":"b","cell":"ours"}]`,
			theirs: `[{"_id":"b"}]`,
			merged: `[{"_id":"b","cell":"ours"}]`,
		},
		{
			name:   "a row both sides added alike is added once",
			base:   `[{"_id":"a"}]`,
			ours:   `[{"_id":"a"},{"_id":"n","cell":"x"}]`,
			theirs: `[{"_id":"a","cell":"t"},{"_id":"n","cell":"x"}]`,
			merged: `[{"_id":"a","cell":"t"},{"_id":"n","cell":"x"}]`,
		},
		{
			name:      "a row both sides added differently conflicts at the row",
			base:      `[{"_id":"a"}]`,
			ours:      `[{"_id":"a"},{"_id":"n","cell":"x"}]`,
			theirs:    `[{"_id":"a"},{"_id":"n","cell":"y"}]`,
			conflicts: []string{"n"},
		},
		{
			name:   "a child emptied by the merge is dropped, not stored Unset",
			base:   `[{"_id":"a","items":[{"_id":"i"},{"_id":"j"}]}]`,
			ours:   `[{"_id":"a","items":[{"_id":"j"}],"cell":"x"}]`,
			theirs: `[{"_id":"a","items":[{"_id":"i"}]}]`,
			merged: `[{"_id":"a","cell":"x"}]`,
		},
		{
			name:      "an _id is escaped in a conflict path",
			base:      `[{"_id":"a/b~c","cell":"x"}]`,
			ours:      `[{"_id":"a/b~c","cell":"y"}]`,
			theirs:    `[{"_id":"a/b~c","cell":"z"}]`,
			conflicts: []string{"a~1b~0c/cell"},
		},
		{
			name:      "nested reorders on both sides conflict at the nested _order",
			base:      `[{"_id":"a","items":[{"_id":"i"},{"_id":"j"},{"_id":"k"}]}]`,
			ours:      `[{"_id":"a","items":[{"_id":"k"},{"_id":"i"},{"_id":"j"}]}]`,
			theirs:    `[{"_id":"a","items":[{"_id":"j"},{"_id":"i"},{"_id":"k"}]}]`,
			conflicts: []string{"a/items/_order"},
		},
		{
			name:   "reorders on both sides that agree on the rows all three hold",
			base:   `[{"_id":"a"},{"_id":"b"},{"_id":"c"}]`,
			ours:   `[{"_id":"c"},{"_id":"b"},{"_id":"a"}]`,
			theirs: `[{"_id":"c"},{"_id":"b"},{"_id":"n"},{"_id":"a"}]`,
			merged: `[{"_id":"c"},{"_id":"b"},{"_id":"n"},{"_id":"a"}]`,
		},
		{
			name:   "a key the Spec does not name merges as a whole value",
			base:   `[{"_id":"a","extra":{"p":1,"q":1}}]`,
			ours:   `[{"_id":"a","extra":{"p":2,"q":1},"cell":"x"}]`,
			theirs: `[{"_id":"a","extra":{"q":1,"p":1},"cell":"x"}]`,
			merged: `[{"_id":"a","cell":"x","extra":{"p":2,"q":1}}]`,
		},
		{
			// Merge cannot answer "absent"; versionkit's Validate reports the
			// [] as not_canonical and the merge waits for a person.
			name:   "rows the merge removes every one of are []",
			base:   `[{"_id":"a"},{"_id":"b"}]`,
			ours:   `[{"_id":"b"}]`,
			theirs: `[{"_id":"a"}]`,
			merged: `[]`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			merged, conflicts := merge(t, f, c.base, c.ours, c.theirs)
			if !slices.Equal(conflicts, c.conflicts) {
				t.Fatalf("conflicts = %q, want %q", conflicts, c.conflicts)
			}
			if c.conflicts != nil {
				if merged != "" {
					t.Errorf("merged = %s alongside conflicts", merged)
				}
				return
			}
			if !sameJSONText(t, []byte(merged), []byte(c.merged)) {
				t.Errorf("merged = %s, want %s", merged, c.merged)
			}
		})
	}
}

// A merged value keeps every number exactly as one side wrote it.
func TestMergeKeepsNumbersAsWritten(t *testing.T) {
	f := schemaField(t, tableField)
	merged, _ := merge(t, f,
		`[{"_id":"a","items":[{"_id":"i","qty":1}]}]`,
		`[{"_id":"a","items":[{"_id":"i","qty":12345678901234567890}]}]`,
		`[{"_id":"a","cell":"x","items":[{"_id":"i","qty":1}]}]`)
	if want := `[{"_id":"a","cell":"x","items":[{"_id":"i","qty":12345678901234567890}]}]`; merged != want {
		t.Errorf("merged = %s, want %s", merged, want)
	}
}

// A linked Row Spec never resolved has no children: its rows still compare
// and merge by _id, each key as a whole value.
func TestUnresolvedRowSpec(t *testing.T) {
	f := schemaField(t, `{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"settings":{"blueprint":"bp"},"system":false}`)
	merged, conflicts := merge(t, f, `[{"_id":"a","p":1,"q":1}]`, `[{"_id":"a","p":2,"q":1}]`, `[{"_id":"a","p":1,"q":2}]`)
	if conflicts != nil || !sameJSONText(t, []byte(merged), []byte(`[{"_id":"a","p":2,"q":2}]`)) {
		t.Errorf("merged = %s, conflicts %q", merged, conflicts)
	}
	equal, detail, err := f.Type.Compare(f.Settings, json.RawMessage(`[{"_id":"a","p":1}]`), json.RawMessage(`[{"_id":"a","p":2}]`))
	if err != nil || equal {
		t.Fatalf("Compare = %v, %v", equal, err)
	}
	if want := `{"status":"changed","items":[{"_id":"a","status":"changed","fields":{"p":{"status":"changed"}}}]}`; string(detail) != want {
		t.Errorf("detail = %s, want %s", detail, want)
	}
}

// Values a type cannot hold are a failure, not a difference: stored data is
// validated, so they mean the caller handed Compare or Merge the wrong thing.
func TestCompareAndMergeRefuseMalformedValues(t *testing.T) {
	f := schemaField(t, tableField)
	fieldset := schemaField(t, `{"field_type":"fieldset","config":{"name":"A","api_accessor":"a","required":false,"instructions":""},"system":false}`)
	valid := `[{"_id":"a","items":[{"_id":"i","qty":1}]}]`
	for _, c := range []struct {
		f     SchemaField
		value string
	}{
		{f, `{"_id":"a"}`},
		{f, `[{"cell":"x"}]`},
		{f, `[{"_id":""}]`},
		{f, `[{"_id":"a"},{"_id":"a"}]`},
		{f, `["a"]`},
		{f, `[{"_id":"a","items":[{"qty":1}]}]`},
		{f, `not json`},
		{f, `[] []`},
		{f, ``},
		{fieldset, `[]`},
	} {
		other := valid
		if c.f.TypeID == "fieldset" {
			other = `{"x":1}`
		}
		// A nested row array is read only where both sides hold it and
		// differ: one side alone holding it is added, or a Conflict.
		changed := `[{"_id":"a","items":[{"_id":"i","qty":2}]}]`
		if c.f.TypeID == "fieldset" {
			changed = `{"x":2}`
		}
		if _, _, err := c.f.Type.Compare(c.f.Settings, json.RawMessage(other), json.RawMessage(c.value)); err == nil {
			t.Errorf("Compare(%s, %s): want an error", other, c.value)
		}
		merger := c.f.Type.(Merger)
		if _, _, err := merger.Merge(c.f.Settings, json.RawMessage(other), json.RawMessage(changed), json.RawMessage(c.value)); err == nil {
			t.Errorf("Merge(%s, %s, %s): want an error", other, changed, c.value)
		}
	}
}

func TestWholeValueCompare(t *testing.T) {
	f := schemaField(t, `{"field_type":"array","config":{"name":"Meta","api_accessor":"meta","required":false,"instructions":""},"system":false}`)
	if _, ok := f.Type.(Merger); ok {
		t.Fatal("a whole-value type must not be a Merger: versionkit merges it")
	}
	for _, c := range []struct {
		a, b  string
		equal bool
	}{
		{`{"a":1,"b":[1,2]}`, `{"b":[1.0,2e0],"a":1}`, true},
		{`{"a":1,"b":null}`, `{"a":1}`, true},
		{`{"a":1}`, `{"a":"1"}`, false},
		{`[1,2]`, `[2,1]`, false},
		{`[null]`, `[]`, false},
	} {
		equal, detail, err := f.Type.Compare(f.Settings, json.RawMessage(c.a), json.RawMessage(c.b))
		if err != nil {
			t.Fatal(err)
		}
		if equal != c.equal || detail != nil {
			t.Errorf("Compare(%s, %s) = %v, %s; want %v and no detail", c.a, c.b, equal, detail, c.equal)
		}
	}
}

// Compare and Merge never panic, whatever they are handed.
func FuzzCompareAndMerge(f *testing.F) {
	f.Add(`[{"_id":"a","cell":"x"}]`, `[{"_id":"b"},{"_id":"a","cell":"y"}]`, `[{"_id":"a","items":[{"_id":"i","qty":1}]}]`)
	f.Add(`[]`, `{}`, `null`)
	f.Add(`[{"_id":"a"},{"_id":"a"}]`, `[{"_id":1}]`, `"x"`)
	field := `{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[
		{"field_type":"text","config":{"name":"Cell","api_accessor":"cell","required":false,"instructions":""},"system":false},
		{"field_type":"group","config":{"name":"Items","api_accessor":"items","required":false,"instructions":""},"children":[
			{"field_type":"number","config":{"name":"Qty","api_accessor":"qty","required":false,"instructions":""},"system":false}
		],"system":false}
	],"system":false}`
	spec, err := DecodeSpec([]byte("[" + field + "]"))
	if err != nil {
		f.Fatal(err)
	}
	fields, err := SchemaFields(&ResolvedSpec{Fields: spec})
	if err != nil {
		f.Fatal(err)
	}
	sf := fields[0]
	f.Fuzz(func(t *testing.T, base, ours, theirs string) {
		_, _, _ = sf.Type.Compare(sf.Settings, json.RawMessage(ours), json.RawMessage(theirs))
		_, _, _ = sf.Type.(Merger).Merge(sf.Settings, json.RawMessage(base), json.RawMessage(ours), json.RawMessage(theirs))
	})
}
