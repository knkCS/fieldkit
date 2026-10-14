# Pickers search through the Adapter; a Field Type the Consumer cannot serve is hidden, never degraded to typed ids

The settings that name a Blueprint or a Text Type Release — a Reference's targets, a Fieldset's Blueprint, a linked Virtual Table's Row Spec, a `rich_text` Field's Text Type — are picked in `BlueprintPicker`, which listed every choice at once through an optional `list()` on the `blueprint` and `textType` Adapters and, where a Consumer had none (#52), turned into a text box for comma-separated ids. Both halves failed in use: `list()` cannot search or page, so a Consumer had to fetch everything (blueprinthub fetches every Release and remounts a separate Adapter per picker to tell a Fieldset from a Reference target), and the text box is what mediahub and taskhub actually showed — mediahub offers every built-in type with no Adapters at all, so every Blueprint setting there was typed by hand. We decided, in a design session on 2026-10-14, that **a picker searches through its Adapter or the setting is not offered**.

## The decision

- **One async select.** `BlueprintPicker` renders through anker's `LookupSelect`, as the Reference value picker already does (ADR-0016), so both pickers in one panel page, debounce and name a stored id the same way.
- **`search` and `resolve` replace `list`.** The `blueprint` and `textType` Adapters offer `search({ query, cursor, purpose, signal })`, answering one page of `{ id, name }` and the next cursor, and `resolve({ ids, signal })`, naming stored ids — archived ones included, so an existing setting stays readable. `list()` is removed in the same release: the API is 0.x (ADR-0019) and blueprinthub is its only implementer.
- **`purpose` says which setting is asking** — `reference_target`, `fieldset`, `row_spec` — so the Consumer filters (a Fieldset is offered fieldset-kind Blueprints only) with one Adapter, instead of one Adapter per picker.
- **No typed ids.** The text box goes. A search that fails shows that it failed, with a retry, and never turns into free text.
- **What a Consumer cannot serve is hidden.** A Field Type declares the Adapters its settings need: `reference`, `single_reference` and `fieldset` need `blueprint.search`; `rich_text` needs `textType.search`; Virtual Table's linked Row Spec needs `blueprint.search`. A Consumer that does not provide one is not offered the type in its type picker, and a Virtual Table there offers only an embedded Row Spec. A Field of such a type that is already stored stays shown and readable; its setting says the application has no source for it rather than offering an input.

## Considered Options

- **Keep `list()` and add search beside it.** Rejected: two code paths in the picker for one Consumer, and `list()` keeps inviting the fetch-everything implementation.
- **Keep the typed-id fallback.** Rejected: it was meant for a transient failure and became the permanent UI of every Consumer without an Adapter. An id nobody can look up is not a configuration an Author can check.
- **Move the picker into blueprinthub-ui.** Rejected: the picker belongs to the settings editors of fieldkit's own Field Types (ADR-0018), which taskhub and mediahub embed as well, and blueprinthub-ui depends on fieldkit, not the other way round. fieldkit owns the control; the Consumer owns the data, through the Adapter (ADR-0002).
- **Give every Consumer a Blueprint source.** Rejected as the default: a Reference in asset metadata or a task form also needs a Content source to mean anything. A Consumer that wants such types provides the Adapters and gets them.

## Consequences

- blueprinthub, taskhub and mediahub move to the release that carries this. blueprinthub implements `search`/`resolve` for both Adapters and drops its per-scope remount; taskhub and mediahub implement nothing and lose the types they could not serve.
- Hiding is the Consumer-facing side of ADR-0022's "which Consumers offer a type is advice": it narrows a picker, it never invalidates a stored Spec.
