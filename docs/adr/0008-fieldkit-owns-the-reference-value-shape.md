# The Reference value is fieldkit's own shape, and the Consumer maps it

A Reference is `{ id, pin?, attributes?, children? }` — a genuinely nested tree, with attributes keyed by Accessor. knkCMS core persists something else: a flat `ContentReferenceFlat[]` carrying `ancestor_ids`, `parent_id` and `index`, with attributes as a positional `[]string` aligned to the order of the settings array. Core maps between the two at its own save/load boundary. We chose fieldkit's shape over emitting core's verbatim because nesting makes an orphan unrepresentable — a Reference whose declared ancestor is absent from the array has nowhere to live — so the tree is well-formed by construction rather than by convention, and `ancestor_ids`, `parent_id` and `index` are each derivable from it in full. The drag interaction still flattens to a depth-indexed list, because that is what tree drag-and-drop needs; that flattening is an implementation detail of the Field, not of the value.

`reference` holds `Reference[]`, `single_reference` holds `Reference | null`, and they are separate field types for the reason ADR-0005 gives rather than one type switching shape on `max_items`.

> Core's side of this comparison is tabulated in [knkCMS core parity](../knkcms-core-parity.md).

## Considered options

Emitting `ContentReferenceFlat` verbatim needs no mapper at all. Rejected: it bakes a knkCMS payload into a library whose catalogue is meant to stay generic (ADR-0002), it makes every backend change a fieldkit release, and it inherits the orphan problem rather than designing it away. Letting the adapter own serialisation entirely, with the value opaque in between, was rejected because `toZodType()` would then have nothing to validate and the editor could not reason about the value at all.

## Consequences

The mapper is load-bearing and fails silently. Core's extractor unmarshals the stored JSON into `[]ContentReferenceFlat` and returns nil when that fails, so a shape it does not recognise costs backlinks, TOC expansion and diffs with no error raised anywhere. A mapping bug does not look like a bug.

`display_name` is emit-only. Fieldkit never stores it, resolving names through `adapters.reference.fetch` on load, so a renamed Content reads correctly everywhere immediately — at the cost of a skeleton state before the fetch lands, and of a `SpecDataTable` cell, which has neither adapters nor async, rendering `N references` the way a Group cell already renders `N items`. SpecForm's read mode sits inside the renderer, reaches the adapter, and so bypasses the cell to render a resolved tree.

Attributes move from a positional `[]string` to a record keyed by Accessor. That is safe by inspection rather than by hope: core's extractor never reads `attributes` at all, so only its reference diff — which types them as `[]string` and already falls back to a plain "modified" verdict when parsing fails — degrades.

A Reference carries its Pin as a single nullable target id, where null means the Content's newest Version, and never records which *kind* of target that is — the Field's `pin_mode` setting already says. That mirrors knkCMS core's `manipulation_tree`, whose nodes already pin exactly this way (`ReleaseId *string`, null = use latest), and it makes changing `pin_mode` self-resolving: every stored Pin becomes meaningless at once rather than some of them becoming stale, so the content upgrade nulls them and they fall back to latest instead of needing per-Reference reconciliation. The mapper reads `pin_mode` to decide which of core's two columns to write.

That upgrade is the Consumer's, not fieldkit's: editing a Blueprint mints a new `BlueprintDataVersion` and existing Contents stay on their old one until `UpgradeContentBlueprintVersion` moves them. Fieldkit cannot know whether any Content exists, so it cannot itself refuse a `pin_mode` change — a Consumer freezes the setting through `config.locked_settings` instead.
