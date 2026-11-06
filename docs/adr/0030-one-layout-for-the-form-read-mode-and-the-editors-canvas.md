---
status: accepted
---

# One layout for the form, read mode and the editor's canvas: one tab shell, only a Field's value differs

Decided in a grilling in contenthub on 2026-11-06 (contenthub ADR 0029).

A Spec was laid out three times. The form (`SpecForm`) went through `TabShell`. Read mode went through the same `TabShell`, but drew each Tab as a label-left `DescriptionList` and ignored the form's spacing, so a Content's read page looked like a different product from the form that edits it. The Blueprint editor's canvas drew its own Tab header, a horizontal row of the section list and the field search, with no vertical case: with a first Section set to vertical, `Tabs.Root` became a row, the list and the search stayed squeezed into that header row with `align="center"`, the Tabs sat in the middle of the column and the search beside them. The editor's own "Try it" preview, going through `TabShell`, drew the same Spec correctly next to it. Each copy drifted on its own.

## The decision

- **One tab shell.** `TabShell` lays out the Tabs for the form, read mode and the editor's canvas. The canvas passes its own triggers — drop zones, the section menu, renaming — into it, and owns nothing of the layout.
- **The shell's placement is the rule, in one place.** Horizontal: the Tab list across the top, the field search at its end. Vertical: the field search above, then the Tab list as a column aligned to the top beside the Tab's fields. A container narrower than the vertical layout fits falls back to horizontal, as before.
- **Read mode lays out a Tab as the form does**: the same Cards, labels above values and the form's vertical rhythm. Only the leaf differs — the Plugin's `readComponent` (or the shared `ReadValue`) where the form has its `fieldComponent`.
- **`readOnly` and read mode stay two things.** `readOnly` is the form with editing switched off for now: its controls are shown, so whoever fills the form sees what they would edit. Read mode has no form: values as values, cheap enough for any page, no seeding and no resolver (fieldkit#329). What they share is the layout, not the leaves.

## Considered Options

- **Patch the canvas with a vertical branch of its own.** Rejected: it fixes the reported bug and keeps three copies of the Tab layout, which is what produced it.
- **One mode: read as a disabled form.** Rejected: disabled controls are read as dimmed, unusable controls, toolbars and handles show that do nothing, and a read page would need a form, seeded and validated, to show values.

## Consequences

- A Consumer's read page now matches its form without doing anything; a Consumer that styled around the old description list sees the form's layout instead.
- `SpecForm` accepts `mode="read"` with `readOnly`, which means nothing. A later API change may make the three states (`edit`, `readOnly`, `read`) one prop so the combination cannot be expressed.
