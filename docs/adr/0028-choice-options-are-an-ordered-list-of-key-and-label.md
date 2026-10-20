---
status: accepted
---

# Choice options are an ordered list of Key and Label

_Decided for [#84](https://github.com/knkCS/fieldkit/issues/84) in a design session with blueprinthub on 2026-10-20, before the 0.18.0 freeze ([ADR-0024](0024-the-data-contract-freezes-with-the-first-blueprint-release.md))._

`select`, `radio` and `checkboxes` stored their **Options** as a map, `options: { [key]: label }`. That map loses its order. Postgres `jsonb`, where versionkit keeps every Revision, sorts an object's keys by length and then bytewise, so an Author's *Low, Medium, High* comes back as *low, high, medium*. JavaScript also moves integer-like keys to the front in numeric order, and core's real option keys include `"1"` to `"12"`. Order is part of what an Author means, and no editor can keep an order that the stored shape cannot hold.

## Decision

- **`options` is an ordered list**: `[{ key, label }, …]`. List order is display order. The same shape applies to all three types, in the Zod `settingsSchema`, in `catalogue.json` and in Go `ValidateSettings`. `choiceText` reads labels from the list.
- **A Key matches `^[a-z0-9][a-z0-9_-]{0,63}$`** and is unique within its Field. A Label is non-empty. Both are checked when a Spec is saved. The list form gives up the uniqueness the map gave for free, so uniqueness has to be a rule. Keys are strict because they are stored in Content and read by templates. Every option key in core's data already fits, so the conversion ([blueprinthub ADR 0007](https://github.com/knkCS/blueprinthub/blob/main/docs/adr/0007-core-blueprints-are-converted-once-into-a-reviewed-file-set-applied-through-the-public-api.md)) renames `value` to `label` and changes nothing else.
- **An empty list is valid in a Spec and refused in a resolved Spec.** `ValidateSpec` lets a draft hold a choice Field with no Options yet. `ValidateResolvedSpec`, which a Release is checked with, refuses it, because Content could hold no value and a required Field could never be valid.
- **A released Option's Key is fixed in the editor.** The settings editor for the three types lets an Author add, relabel, reorder and remove Options, and suggests a Key from a new Option's Label. It does not let an Author edit the Key of an Option that is in the baseline Release. This is not checked in validation: a renamed Key looks the same as a removed Option plus a new one, and removing an Option is allowed. Content still holding a removed Key shows it raw.
- **Content values are still not checked against the Options**, as before.

## Considered Options

- **Keep the map and accept the order `jsonb` gives back.** Rejected: Authors would see their order rearranged after every save.
- **Keep the map and add an `order: [key…]` setting.** Rejected: two settings that can disagree, and every reader has to merge them.
- **Read both shapes and normalise the map to a list.** Not needed: no Blueprint Release holds the map outside a seed that can be reset, and 0.18 is not frozen.
- **Teach the generic settings form to edit records ([#241](https://github.com/knkCS/fieldkit/issues/241)).** Doesn't solve this on its own: a record editor cannot hold order, and Options need fixed Keys, which a generic form doesn't know about. #241 stays open for other record-shaped settings.

## Consequences

- Breaking between release candidates. It is recorded in the release notes, as ADR-0024 allows. blueprinthub's System Blueprint seed moves to the list shape.
- A default Option, translated Labels and core's `visible_if` are not part of this decision.
