/**
 * The fieldkit version the Catalogue ships in. It moves with the release that
 * first ships a change to the Catalogue, never back (ADR-0019).
 * `npm run catalogue:compat` and `npm run release` hold it to that
 * (docs/releasing.md, "The Catalogue version").
 *
 * The Catalogue generator (`scripts/catalogue.ts`) writes it into
 * `go/catalogue.json`, and `resolveSpec()` records it as a Resolved Spec's
 * `catalogue` — so the two cannot name different Catalogues (ADR-0020).
 */
export const CATALOGUE_VERSION = "0.18.0";
