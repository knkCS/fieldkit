package fieldkit_test

import (
	fieldkit "github.com/knkcs/fieldkit/go"
	"github.com/knkcs/fieldkit/go/publishing"
)

// The opt-in packages a conformance fixture may name in its packages. They
// import fieldkit, so only this external test package can reach them; it
// hands their Catalogue sections to the runner before any test runs. The TS
// runner has the same list (src/schema/__tests__/conformance.test.ts).
func init() {
	fieldkit.ConformancePackages["publishing"] = publishing.Catalogue()
}
