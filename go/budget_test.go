package fieldkit

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Performance budgets (fieldkit#222): a large Virtual Table and a long rich
// text, run through everything a service does with a stored value —
// ValidateResolvedValue, Edges, Texts, Compare and Merge.
//
// A budget has to hold on a heavily loaded machine (load averages of 20–100
// while other lanes run), so it never states an absolute time. Each operation
// has two ceilings:
//
//   - allocs: allocations per run, which load does not change. It catches a
//     copy per row or a re-parse per value.
//   - ratio: the operation's fastest of budgetRuns runs, over the fastest run
//     of a baseline on the same payload — json.Unmarshal of it into an any,
//     measured interleaved with it, so load slows both alike. It catches
//     work that grows faster than the payload without allocating: at
//     thousands of rows, an accidental O(n²) is far past any ceiling here.
//
// Both ceilings sit well above what was measured when they were set (the
// comment at each), so they fail on a regression, not on noise. Raising one is
// a decision: say why in the commit. `go test -short` skips them; the
// Benchmark functions below run the same workloads for `go test -bench`.

// budgetRuns is how many runs of an operation and of the baseline the ratio
// takes the fastest of.
const budgetRuns = 5

// budgetRows is the Virtual Table's row count: thousands, under MaxItems.
const budgetRows = 5000

// budgetParagraphs is the long rich text's top-level node count.
const budgetParagraphs = 2000

type budget struct {
	name string
	// payload is what the baseline decodes.
	payload []byte
	run     func() error
	// maxAllocs is the ceiling on allocations per run.
	maxAllocs float64
	// maxRatio is the ceiling on the fastest run over the fastest baseline.
	maxRatio float64
}

func budgetDoc(prefix string, paragraphs int, edit func(i int) string) string {
	nodes := make([]string, paragraphs)
	for i := range nodes {
		text := fmt.Sprintf("Absatz %d: Der schnelle braune Fuchs springt über den faulen Hund.", i)
		if edit != nil {
			if e := edit(i); e != "" {
				text = e
			}
		}
		nodes[i] = pmWrapper(prefix+strconv.Itoa(i), pmText(text))
	}
	return pmDoc(nodes...)
}

// budgetTable is a Virtual Table of budgetRows rows — text, number, boolean
// and a short rich text of two paragraphs, one repeating the text and one the
// number — with edit applied to each row's text and number.
func budgetTable(edit func(i int) (cell string, qty int)) string {
	rows := make([]string, budgetRows)
	for i := range rows {
		cell, qty := fmt.Sprintf("Zeile %d", i), i
		if edit != nil {
			cell, qty = edit(i)
		}
		body := pmDoc(pmWrapper("a", pmText(cell)), pmWrapper("b", pmText(fmt.Sprintf("Menge %d", qty))))
		rows[i] = fmt.Sprintf(`{"_id":"r%d","cell":%s,"qty":%d,"done":%t,"body":%s}`, i, quoted(cell), qty, i%2 == 0, body)
	}
	return "[" + strings.Join(rows, ",") + "]"
}

func budgetResolved(tb testing.TB, spec string) *ResolvedSpec {
	tb.Helper()
	decoded, err := DecodeSpec([]byte(spec))
	if err != nil {
		tb.Fatal(err)
	}
	resolved, err := Resolve(context.Background(), decoded, &releases{byKind: map[string]map[string]string{"text_type": {"plain@1": textTypeMinimal}}})
	if err != nil {
		tb.Fatal(err)
	}
	return resolved
}

// budgetField is the one SchemaField of a one-Field Resolved Spec.
func budgetField(tb testing.TB, resolved *ResolvedSpec) SchemaField {
	tb.Helper()
	fields, err := SchemaFields(resolved)
	if err != nil || len(fields) != 1 {
		tb.Fatalf("SchemaFields: %v, %d fields", err, len(fields))
	}
	return fields[0]
}

// budgetValue runs ValidateResolvedValue and fails on any error: a budget
// timing a rejection would time the wrong thing.
func budgetValue(resolved *ResolvedSpec, data []byte) error {
	if errs := ValidateResolvedValue(resolved, data); len(errs) > 0 {
		return fmt.Errorf("ValidateResolvedValue: %d errors, first %+v", len(errs), errs[0])
	}
	return nil
}

func budgetCompare(sf SchemaField, a, b string) error {
	equal, _, err := sf.Type.Compare(sf.Settings, json.RawMessage(a), json.RawMessage(b))
	if err == nil && equal {
		err = fmt.Errorf("compare: equal")
	}
	return err
}

func budgetMerge(sf SchemaField, base, ours, theirs string) error {
	merged, conflicts, err := sf.Type.(Merger).Merge(sf.Settings, json.RawMessage(base), json.RawMessage(ours), json.RawMessage(theirs))
	if err == nil && (merged == nil || len(conflicts) > 0) {
		err = fmt.Errorf("merge: conflicts %v", conflicts)
	}
	return err
}

func budgetWalk(resolved *ResolvedSpec, data []byte) error {
	if _, err := Edges(resolved, data); err != nil {
		return err
	}
	texts, err := Texts(resolved, data)
	if err == nil && len(texts) == 0 {
		err = fmt.Errorf("texts: none")
	}
	return err
}

func budgets(tb testing.TB) []budget {
	tb.Helper()
	// The Virtual Table: ours edits every 7th row's text, theirs every 11th
	// row's number and moves the last row to the front — a clean merge, whose
	// rows both sides edited merge their rich text paragraph by paragraph.
	table := budgetResolved(tb, list(`{"field_type":"virtual_table","config":{"name":"Rows","api_accessor":"rows","required":false,"instructions":""},"children":[`+
		field("text", "cell", "")+","+field("number", "qty", "")+","+field("boolean", "done", "")+","+richText("body", "plain@1")+
		`],"system":false}`))
	tableField := budgetField(tb, table)
	base := budgetTable(nil)
	ours := budgetTable(func(i int) (string, int) {
		if i%7 == 0 {
			return fmt.Sprintf("Zeile %d, geändert", i), i
		}
		return fmt.Sprintf("Zeile %d", i), i
	})
	theirsRows := budgetTable(func(i int) (string, int) {
		if i%11 == 1 {
			return fmt.Sprintf("Zeile %d", i), i + 1000
		}
		return fmt.Sprintf("Zeile %d", i), i
	})
	// Move the last row to the front.
	var rows []json.RawMessage
	if err := json.Unmarshal([]byte(theirsRows), &rows); err != nil {
		tb.Fatal(err)
	}
	rows = append(rows[len(rows)-1:], rows[:len(rows)-1]...)
	theirsBytes, err := json.Marshal(rows)
	if err != nil {
		tb.Fatal(err)
	}
	theirs := string(theirsBytes)
	tableData := []byte(`{"rows":` + base + `}`)

	// The long rich text: ours edits every 5th paragraph, theirs every 5th
	// from the second — a clean merge.
	text := budgetResolved(tb, list(richText("body", "plain@1")))
	textField := budgetField(tb, text)
	docBase := budgetDoc("p", budgetParagraphs, nil)
	docOurs := budgetDoc("p", budgetParagraphs, func(i int) string {
		if i%5 == 0 {
			return fmt.Sprintf("Absatz %d, von uns geändert.", i)
		}
		return ""
	})
	docTheirs := budgetDoc("p", budgetParagraphs, func(i int) string {
		if i%5 == 1 {
			return fmt.Sprintf("Absatz %d, von ihnen geändert.", i)
		}
		return ""
	})
	textData := []byte(`{"body":` + docBase + `}`)

	// The ceilings, set with Go 1.26 and knkeditor v0.1.0 on an Apple M1 Pro
	// under a load average of 70–105. Allocations are stated per row (per
	// paragraph for the rich text) at about 1.2 times what was measured:
	// tight enough that parsing the Text Type once per row again (#216's
	// cost, fixed in #222: 1.25–1.5 times) fails. A ratio is about three
	// times the worst measured, which load moves by half again at most; an
	// O(n²) at these sizes is hundreds of times over.
	payload := func(values ...string) []byte { return []byte("[" + strings.Join(values, ",") + "]") }
	return []budget{
		// 635 allocs per row, ratio 11–15.6
		{"table/validate", tableData, func() error { return budgetValue(table, tableData) }, 760 * budgetRows, 45},
		// 303 allocs per row, ratio 7.3–8.6
		{"table/walk", tableData, func() error { return budgetWalk(table, tableData) }, 365 * budgetRows, 25},
		// 310 allocs per row, ratio 3.2–3.8
		{"table/compare", payload(base, ours), func() error { return budgetCompare(tableField, base, ours) }, 370 * budgetRows, 12},
		// 325 allocs per row, ratio 2.6–3.0
		{"table/merge", payload(base, ours, theirs), func() error { return budgetMerge(tableField, base, ours, theirs) }, 390 * budgetRows, 10},
		// 216 allocs per paragraph, ratio 11–13
		{"rich text/validate", textData, func() error { return budgetValue(text, textData) }, 260 * budgetParagraphs, 40},
		// 83 allocs per paragraph, ratio 4.6–5.6
		{"rich text/walk", textData, func() error { return budgetWalk(text, textData) }, 100 * budgetParagraphs, 16},
		// 127 allocs per paragraph, ratio 3.8–4.5
		{"rich text/compare", payload(docBase, docOurs), func() error { return budgetCompare(textField, docBase, docOurs) }, 152 * budgetParagraphs, 14},
		// 594 allocs per paragraph, ratio 11.6–18.3
		{"rich text/merge", payload(docBase, docOurs, docTheirs), func() error { return budgetMerge(textField, docBase, docOurs, docTheirs) }, 710 * budgetParagraphs, 55},
	}
}

// timed is how long one run takes.
func timed(run func() error) (time.Duration, error) {
	start := time.Now()
	err := run()
	return time.Since(start), err
}

func TestBudgets(t *testing.T) {
	if testing.Short() {
		t.Skip("-short: the budgets take a few seconds")
	}
	if testing.CoverMode() != "" || raceEnabled {
		t.Skip("coverage or race instrumentation distorts the budgets")
	}
	for _, b := range budgets(t) {
		t.Run(b.name, func(t *testing.T) {
			if err := b.run(); err != nil {
				t.Fatal(err)
			}
			allocs := testing.AllocsPerRun(1, func() { _ = b.run() })
			baseline := func() error {
				var v any
				return json.Unmarshal(b.payload, &v)
			}
			// Interleaved, so a burst of load slows both.
			bestRun, bestBase := time.Duration(1<<63-1), time.Duration(1<<63-1)
			for range budgetRuns {
				d, err := timed(b.run)
				if err != nil {
					t.Fatal(err)
				}
				bestRun = min(bestRun, d)
				if d, err = timed(baseline); err != nil {
					t.Fatal(err)
				}
				bestBase = min(bestBase, d)
			}
			ratio := float64(bestRun) / float64(bestBase)
			t.Logf("%.0f allocs (budget %.0f), %v over a %v baseline: ratio %.1f (budget %.0f)", allocs, b.maxAllocs, bestRun, bestBase, ratio, b.maxRatio)
			if allocs > b.maxAllocs {
				t.Errorf("%.0f allocations per run, over the budget of %.0f", allocs, b.maxAllocs)
			}
			if ratio > b.maxRatio {
				t.Errorf("%v per run, %.1f times the %v baseline: over the budget of %.0f", bestRun, ratio, bestBase, b.maxRatio)
			}
		})
	}
}

func BenchmarkBudgets(b *testing.B) {
	for _, bg := range budgets(b) {
		b.Run(bg.name, func(b *testing.B) {
			b.SetBytes(int64(len(bg.payload)))
			b.ReportAllocs()
			for b.Loop() {
				if err := bg.run(); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
