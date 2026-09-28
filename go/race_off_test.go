//go:build !race

package fieldkit

// raceEnabled: the race detector is on, which distorts the budgets
// (budget_test.go).
const raceEnabled = false
