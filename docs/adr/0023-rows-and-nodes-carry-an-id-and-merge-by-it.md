# Rows and nodes carry an `_id`, and compare and merge by it

versionkit merges a Field finer than a whole value only if its type can say which parts changed (versionkit ADR 0002). Every row of `virtual_table`, `group` and `blocks`, and every node of `reference`, `single_reference` and `manipulation_tree`, therefore carries an `_id`: an opaque string unique within one field value, across every level of a tree. It is not the Reference's `id`, because one target may appear twice. TS mints one on every create, insert, paste and duplicate — a duplicate never copies it — and `toZodType` requires it, as Go does (`missing_id`, `duplicate_id`). Go never mints one implicitly; importers call `MintIDs`, which derives each id from a seed and the row's place, so a re-run cutover mints the same ids.

These types share one Compare detail, `{status, items: [{_id, status, moved?, fields?}]}`, where `fields` holds each child's own detail — so a Row's rich-text column carries knkeditor's node detail nested. They merge per item and, inside an item, per child field, so two people editing different columns of one row do not conflict; a node's parent and position count as its fields. A reorder on one side is taken; reorders on both sides conflict at `_order`; a row added on one side lands after its original predecessor. Every path — in conflicts, errors, edges and text — is `/`-separated with `_id` segments, never indices, because indices shift between base, ours and theirs. Every other type compares and merges as a whole value.

## Consequences

- An Accessor may not start with `_` (ADR-0022).
- A value loaded without `_id`s — taskhub's and mediahub's stored rows, core's before the cutover — has them minted into the form's defaults, so opening a record does not make it dirty; they are stored with the next real save.
