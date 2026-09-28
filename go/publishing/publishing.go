// Package publishing is fieldkit's opt-in publishing package (ADR-0002,
// amended): the Field Types only knkCMS's publishing services use, beside the
// npm package's @knkcs/fieldkit/publishing. Nothing registers them. A service
// that wants them builds a Catalogue that holds them and runs every operation
// through it:
//
//	c := publishing.DefaultCatalogue() // fieldkit.DefaultCatalogue().With(publishing.Catalogue())
//	errs := c.ValidateSpec(spec)
//
// fieldkit's package-level functions (fieldkit.ValidateSpec, ValidateValue,
// …) use the embedded Catalogue alone, so to them a publishing type is
// unknown_field_type, as it is to a service that never opted in.
//
// The types' settings are the Catalogue section this package embeds
// (catalogue.json, generated from the TS plugins by scripts/catalogue.ts and
// shipped by npm as @knkcs/fieldkit/publishing/catalogue.json); their values
// are code, one file per type, registered in code below as fieldkit.TypeCode.
package publishing

import (
	_ "embed"
	"fmt"
	"sync"

	fieldkit "github.com/knkcs/fieldkit/go"
)

// catalogueJSON is the publishing Catalogue section, generated and committed.
// `npm run verify` fails when it is stale.
//
//go:embed catalogue.json
var catalogueJSON []byte

// code is every publishing type's code, by type id: exactly the types
// catalogue.json lists (fieldkit.NewCatalogue refuses anything else).
var code = map[string]fieldkit.TypeCode{ //nolint:gochecknoglobals
	"reference_filter": referenceFilter,
}

var (
	section     *fieldkit.Catalogue
	sectionOnce sync.Once
	withDefault *fieldkit.Catalogue
	defaultOnce sync.Once
)

// Catalogue is the publishing Catalogue section alone, with its types' code:
// what a caller adds to a Catalogue with fieldkit's Catalogue.With. It is
// shared: do not modify it.
func Catalogue() *fieldkit.Catalogue {
	sectionOnce.Do(func() {
		c, err := fieldkit.NewCatalogue(catalogueJSON, code)
		if err != nil {
			// The embedded section is generated and tested with this
			// package, so it always decodes.
			panic(fmt.Errorf("fieldkit/publishing: the embedded Catalogue section is invalid: %w", err))
		}
		section = c
	})
	return section
}

// DefaultCatalogue is fieldkit's embedded Catalogue with the publishing
// section added: fieldkit.DefaultCatalogue().With(Catalogue()). It is
// shared: do not modify it.
func DefaultCatalogue() *fieldkit.Catalogue {
	defaultOnce.Do(func() {
		c, err := fieldkit.DefaultCatalogue().With(Catalogue())
		if err != nil {
			// One release generates both files, with one version and no
			// type in both, and tests them together.
			panic(fmt.Errorf("fieldkit/publishing: %w", err))
		}
		withDefault = c
	})
	return withDefault
}
