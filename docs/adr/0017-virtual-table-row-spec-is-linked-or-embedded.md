# A Virtual Table's Row Spec is linked or embedded, and an embedded one lives in `children`

A `virtual_table` Field declares its **Row Spec** in exactly one of two ways:

- **Linked:** `settings.blueprint` names a Blueprint, resolved through the blueprint adapter as Fieldset's is (ADR-0003), so several Virtual Table Fields can share one Row Spec.
- **Embedded:** the Field's own `children` hold the Row Spec, as Group's do (ADR-0007).

`validateSpec()` refuses a Field with both or neither. Resolution turns a linked Row Spec into `children`, so the renderer, the table cell and every validator see one shape: a Resolved Spec (ADR-0004).

The type is available in every context (blueprint, task, form). The editor offers "linked" only where the Consumer registers a blueprint adapter. A Consumer without Blueprints (taskhub) accepts only embedded Row Specs and refuses a linked one when a Spec is published, rather than publishing a Field that renders "Blueprint adapter not configured".

## Why not the alternatives

- **The embedded Row Spec is not kept in `settings.fields`,** the shape knkCMS core used for code-emitted system specs. Settings are private to the plugin, like a Blocks Field's Block Types (ADR-0007), so `resolveSpec()`, `validateSpec()`, the editor's nested authoring and a Consumer's value validation could not reach the columns. No stored data used `settings.fields`, so core moves its one emitter to `children` and the key is removed rather than aliased.
- **The embedded Virtual Table does not become a Group.** Both store an array of equally shaped records, but a Group is edited inline as stacked forms with its own `children` only. A Virtual Table is edited as a table (paging, a row drawer, reordering) and can share its Row Spec. Merging them would need a migration of every stored `virtual_table` and would lose the linked option.

## Consequences

- **A Row Spec holds only value fields without children:** text-like, number, date, time, boolean, the choice types, lookup, and media or single references where the Consumer supports them. No markers and no containers, because each column must fit a cell and a drawer, and a Consumer's row validation stays one level deep.
- **The plugin's renderer becomes a full editor** on anker's `DataTable`. Row reordering is added to that component rather than wrapped around it here, which puts an anker release in front of this one (ADR-0014).
