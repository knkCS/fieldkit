# Layout markers are flat siblings, not nesting containers

A Spec is a flat ordered list, and Sections and Cards partition it by position: a `card` marker owns every field after it until the next `card` or `section`, rather than holding those fields in `Field.children`. We chose position over nesting because reordering — the editor's central gesture — stays a single flat-list move, and a field can cross a card or tab boundary without re-parenting or rewriting any subtree.

This is deliberately surprising: `Field.children` exists and `group` uses it, so nesting was available and rejected. The cost is that structural integrity is a runtime rule rather than a shape guarantee — `partitionSchemaBySections()` and `partitionTabByCards()` are the only places that know a marker's extent, `validateSpec()` enforces the card-layout rule, and the renderer needs a degrade rule for fields that appear before the first marker.

Reversing this means migrating stored Specs, since `field_type: "section"` and `field_type: "card"` markers are persisted data.
