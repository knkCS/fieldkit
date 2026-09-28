# The field-type catalogue stays generic; domain types belong to consumers

Fieldkit's built-in field types are general form concepts only. When knkCMS core replaces its own renderer and specification editor with fieldkit, it registers `title_data`, `title_scope`, `ti_overlay`, `outline_tree` and `manipulation_tree` as its own `FieldTypePlugin`s and passes them to `FieldKitProvider` and `TypePicker`; fieldkit implements only `list` and `fieldset`, which are generic. We chose this because plugins are already injected as props rather than globally registered, so consumer-owned types reach both the editor and the renderer with no new extension point.

The boundary is narrower than "no domain coupling". Fieldkit's **adapter surface** already names knkCMS concepts — `adapters.blueprint`, `adapters.textType` — and `FieldContext` is `"blueprint" | "task" | "form"`. That is accepted: the *catalogue* is generic, the *integration surface* is not.

> Core's side of this comparison is tabulated in [knkCMS core parity](../knkcms-core-parity.md).

## Consequences

Core must author five plugins including editor settings UI and table cells, and `blueprint-review`'s "placeholder" classification for those five becomes permanent unless that tool can import core's plugin definitions.

## Amended by contenthub's map (fieldkit#200)

`manipulation_tree`, `outline_tree`, `ti_overlay`, `template_text` and the new `reference_filter` move into fieldkit after all — as an **opt-in publishing package** (`@knkcs/fieldkit/publishing`, `…/go/publishing`) that nothing registers by default. The catalogue itself stays generic. They cannot stay consumer-owned because blueprinthub and contenthub both need their Go side, and neither may depend on the other's repo. `title_data` and `title_scope` go. The package ships each type's data contract — Catalogue entry, settings schema, Zod type, Go — first; their editing UI is optional on the plugin and ported later, and until then a Consumer attaches its own component or uses the settings form generated from the schema (ADR-0018). `FieldContext` is replaced by Consumers and Positions (ADR-0022).
