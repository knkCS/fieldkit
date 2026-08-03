# Fieldset embeds a blueprint through the adapter, not inline children

`fieldset` takes `{ blueprint, collapsible }` and resolves its children at render time through the existing `adapters.blueprint.getSchema(blueprintId)`, producing a single non-repeating record nested under the fieldset's own accessor. We mirrored knkCMS core's model — which selects from blueprints of `type: "fieldset"` and renders them under a `fieldNamePrefix` — because a fieldset *is* a shared blueprint, and inlining its fields as local `children` would both force a migration of every stored fieldset and destroy the edit-once-update-everywhere reuse that is the whole point of the type.

This completes the container trio: `card` groups fields with no value, `group` repeats fields into an array, `fieldset` embeds fields as one record.

## Consequences

A spec containing a fieldset is no longer self-contained — its full field list cannot be known without a network round-trip. See ADR-0004. Fieldset cycles (a fieldset blueprint that transitively references itself) have no equivalent of `reference`'s `max_depth` and must be guarded explicitly.
