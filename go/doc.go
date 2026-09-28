// Package fieldkit is fieldkit's field-type system in Go: the same Field Types
// the npm package @knkcs/fieldkit defines, for the services that store and
// check what fieldkit's editor and renderer produce (ADR-0018).
//
// A Field Type is defined once. Its settings are data: every type's settings
// schema is generated from the TS plugins into the Catalogue
// (catalogue.json), which this module embeds and the npm package ships as
// @knkcs/fieldkit/catalogue.json. Its value rules are code, written in each
// language and held together by the shared conformance fixtures in the
// repository's conformance/ folder, which Vitest and go test both replay.
//
// The package-level functions check against that embedded Catalogue. An
// opt-in package — the publishing package, github.com/knkcs/fieldkit/go/publishing
// — ships a Catalogue section with its types' code (TypeCode); a caller that
// wants those types builds DefaultCatalogue().With(section) and calls the
// same operations as its methods. Nothing registers a section globally.
//
// Every error is an Error: a /-separated path, a code from the data
// contract, and optional params. Codes are only ever added (ADR-0019).
package fieldkit
