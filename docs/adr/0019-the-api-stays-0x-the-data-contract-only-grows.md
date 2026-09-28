# The API stays on 0.x; the data contract only grows, and says so in CI

A released Blueprint is served for ever, so fieldkit's **data contract** — the Field JSON envelope, every type's settings, every value shape, and the error codes — changes **additively only**: a new optional key, a new type id, never a rename or a removal. It is enforced independently of semver, by a CI check that diffs the Catalogue against the last released one and fails on anything but an addition, and by the conformance fixtures of every earlier release. Semver keeps describing the TS API alone, which stays on 0.x.

**Only an earlier release's *valid* fixtures bind.** A value valid once stays valid; a value once rejected may become valid, so a validation bug that let bad data through can be fixed by loosening, never by tightening. Tightening is a new type id.

## Considered Options

- **Going to 1.0.0 now the data is frozen.** Rejected: npm and Go share one version number (ADR-0018), so a breaking change to a renderer prop would make the Go module `…/go/v2` and every Go importer rewrite its imports for a React change.
- **Binding the invalid fixtures too.** Rejected: it would make every validation bug permanent.

## Consequences

- A generator — knkeditor's option forms — may target the Spec JSON: it declares the lowest fieldkit it needs, and no later fieldkit rejects what it generates.
- A Resolved Spec records the Catalogue version and the rich-text vocabulary version it was resolved against, so a service can refuse a Blueprint Release it is too old to understand (ADR-0020).
