# A container plugin composes its own children's schema

`toZodType` and `defaultValue` take an optional second argument that composes a list of child Fields — into the object schema they would generate as a Spec of their own, and into the record they would seed. A resolved `fieldset` uses it, so a required child blocks submit and reports at its own path. The change is additive: a plugin written against the one-argument signature compiles and behaves identically, which is what let this land without editing a single existing plugin.

## Considered options

Special-casing `fieldset` inside `specToZodSchema()`, the way the value-less Markers are special-cased, is smaller. Rejected: the Marker skip-list is already the one exception to "all Field types are plugins", and a second exception would make it a precedent rather than a wart. Shared machinery does not learn Field type names.

## Consequences

`specToZodSchema()`'s `overrides` stay top-level only — they are keyed by Accessor, and a Consumer overriding `street` means their own Field, not one a Blueprint happens to name the same. There is no way to override a child, and no evidence yet that anyone wants one.

Both container types call `.passthrough()` on what they compose, so a nested record keeps keys its Fields don't describe. A Spec says what a form edits, not what a record holds: a Group row carries a backend id, a Fieldset record carries whatever core stores beside the Blueprint's Fields, and neither should vanish because validation arrived. That is also why the plugin, not the shared builder, applies the policy — the builder hands back a plain `ZodObject` and each container decides.

The top level still strips, unchanged, and that asymmetry has a matching consequence in the table: `EditDrawer` submits parsed values, so it merges them back over the row it was given rather than handing a Consumer a record stripped of its id.

Termination is `resolveSpec()`'s job (ADR-0004): it rejects a Blueprint cycle before children reach the builder.

Group rows validate through the same mechanism. Every stored row of every existing Group is now checked, which is the point and also the blast radius: a Spec whose rows were never validated can start blocking submit on data that was already saved.

Blocks compose per allowed type: each type's declared fields become the object schema for its branch of the `_type` union, so a required field inside a `heading` blocks submit and reports at `content.1.title`. The blast radius is the Group one again — every stored block of every existing Blocks Field starts being checked. `_type` is extended on after the composed shape, so a type declaring a field of that accessor cannot overwrite the discriminator.

A block type's fields live in `settings.allowed_blocks[].fields`, not in `children`, and composing them deliberately does not move the boundary shared traversal draws: `resolveSpec()`, `validateSpec()` and `resolveMarkerConvention()` still walk `Field.children` only, so a Field nested in settings is reached by the plugin that owns those settings and by nothing else. That is the same instinct that put composition in the plugin rather than in the builder — shared machinery does not learn a Field type's settings shape any more than it learns its name. Two consequences a Consumer meets, and the reason this is written down rather than left implicit: a Fieldset declared inside a block type is never resolved, and composes as the opaque record any unresolved Fieldset does; and a duplicate Accessor between two fields of one block type is not reported, the later one winning the composed shape.
