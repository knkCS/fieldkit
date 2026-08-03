# The field-type catalogue stays generic; domain types belong to consumers

Fieldkit's built-in field types are general form concepts only. When knkCMS core replaces its own renderer and specification editor with fieldkit, it registers `title_data`, `title_scope`, `ti_overlay`, `outline_tree` and `manipulation_tree` as its own `FieldTypePlugin`s and passes them to `FieldKitProvider` and `TypePicker`; fieldkit implements only `list` and `fieldset`, which are generic. We chose this because plugins are already injected as props rather than globally registered, so consumer-owned types reach both the editor and the renderer with no new extension point.

The boundary is narrower than "no domain coupling". Fieldkit's **adapter surface** already names knkCMS concepts — `adapters.blueprint`, `adapters.textType` — and `FieldContext` is `"blueprint" | "task" | "form"`. That is accepted: the *catalogue* is generic, the *integration surface* is not.

## Consequences

Core must author five plugins including editor settings UI and table cells, and `blueprint-review`'s "placeholder" classification for those five becomes permanent unless that tool can import core's plugin definitions.
