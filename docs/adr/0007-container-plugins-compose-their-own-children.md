# A container plugin composes its own children's schema

`toZodType` and `defaultValue` take an optional second argument that composes a list of child Fields — into the object schema they would generate as a Spec of their own, and into the record they would seed. A resolved `fieldset` uses it, so a required child blocks submit and reports at its own path. The change is additive: a plugin written against the one-argument signature compiles and behaves identically, which is what let this land without editing a single existing plugin.

## Considered options

Special-casing `fieldset` inside `specToZodSchema()`, the way the value-less Markers are special-cased, is smaller. Rejected: the Marker skip-list is already the one exception to "all Field types are plugins", and a second exception would make it a precedent rather than a wart. Shared machinery does not learn Field type names.

## Consequences

`specToZodSchema()`'s `overrides` stay top-level only — they are keyed by Accessor, and a Consumer overriding `street` means their own Field, not one a Blueprint happens to name the same. There is no way to override a child, and no evidence yet that anyone wants one.

A composed record is a `z.object`, so parsing strips keys the children don't declare — the same treatment the top level has always given a Spec, now reaching one level deeper. Anything a Consumer needs on submit has to be a Field.

Termination is `resolveSpec()`'s job (ADR-0004): it rejects a Blueprint cycle before children reach the builder.

A Group could now validate its rows the same way instead of `z.array(z.record(z.unknown()))`. Deliberately not done here — every stored row of every existing Group would start being checked, which is its own change with its own blast radius.
