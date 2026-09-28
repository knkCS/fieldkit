# fieldkit's Go resolves Specs, and a Resolved Spec carries its opaque parts once

Which settings hold a Pin, and how what they pin is inlined, is field-type knowledge; TS already owns it in `resolveSpec()` and `linkedBlueprintId()` so that validator, resolver and renderer cannot disagree. fieldkit's Go therefore owns `Resolve(ctx, spec, fetcher)` and `Pins(spec)` as well, with the fetcher a port the service implements — blueprinthub, when it cuts a Blueprint Release (blueprinthub ADR 0001). Go needs no adapter afterwards: every value operation takes a Resolved Spec.

A Resolved Spec is an envelope, `{catalogue, vocabulary, fields, parts}`. **Pinned Blueprint Releases** — a Fieldset, a linked Row Spec, a linked Reference Spec, an outline tree — **are inlined as Fields**, because they are Spec and everything that walks Fields must see them. **Opaque parts** — a resolved Text Type, a Typesetting Instruction Set — are carried once in `parts`, keyed by Pin, and the Field keeps its Pin; fieldkit hands them to knkeditor without looking inside. `catalogue` and `vocabulary` record the fieldkit and knkeditor versions the Resolved Spec needs, which contenthub's `CheckBlueprintRelease` compares with its own.

`Resolve` caps fetches and depth beside refusing cycles, and `ValidateSpec` runs twice: on the authored Spec when it is saved, and on the Resolved Spec when a Release is cut — only then is it known what a linked Blueprint is linked *as*, so only then can its Positions be checked.

## Considered Options

- **blueprinthub resolves on raw JSON.** Rejected: a second resolver is the drift `linkedBlueprintId()` exists to prevent.
- **Opaque parts inlined into each Field's settings.** Rejected: blueprinthub ADR 0001 counts 88 rich-text fields sharing a handful of Text Types, and every copy would bloat the Release and every Compare of two Releases.

## Consequences

- `resolveSpec()` returns the envelope instead of a bare `Field[]` — a breaking TS change, taken with the rest in one release.
- The Go Spec model decodes strictly, so round-tripping it through structs cannot silently drop a property: the failure `commons/fieldspec` avoids by staying on raw JSON is avoided here by rejecting what is not modelled.
