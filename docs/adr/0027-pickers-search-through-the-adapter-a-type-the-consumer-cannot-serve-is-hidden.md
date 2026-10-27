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

## Amended: hidden by purpose, and by value (fieldkit#399, fieldkit#356)

The rule stands — what a Consumer cannot serve is hidden, never degraded — but "cannot serve" was read too coarsely. A type was hidden by **whether** the `blueprint` Adapter has `search`, not by **which purpose** asks. taskhub provides `blueprint.search` so a task type's `reference` Field can name its target Blueprints (taskhub ADR 0018); the moment it does, its type editor also offered `fieldset`, a Virtual Table's linked Row Spec and a reference Field's `spec_blueprint` — all of which taskhub refuses at publish, because a task type never links a part released in blueprinthub (contenthub ADR 0018). An Author could author what the publish would refuse. And a type was hidden by its *settings* only, so a type whose *value* needs an Adapter (`media`, `lookup`, the Reference value picker) was offered where nothing could fill it. Both halves are decided here, in a triage on 2026-10-27.

### By purpose (fieldkit#399)

- **The `blueprint` Adapter declares the purposes it serves:** `purposes?: BlueprintPurpose[]`. **Absent means all three** (`reference_target`, `fieldset`, `row_spec`), so blueprinthub, contenthub and every Consumer that predates it behave exactly as before. taskhub declares `purposes: ["reference_target"]`.
- **Capabilities are purpose-specific:** `blueprint.search:reference_target`, `blueprint.search:fieldset`, `blueprint.search:row_spec` — each held when the Adapter has `search` and its `purposes` include that purpose. The bare `blueprint.search` stays, meaning "searches, for any purpose", for a Consumer's own types that declared it; no built-in type names it any more.
- **Each type, and each setting inside a type, names the purpose it needs.** `reference`, `single_reference` and a `createReferencePlugin` type need `reference_target`; `fieldset` needs `fieldset`; a Virtual Table's linked Row Spec needs `row_spec`; a reference Field's per-Blueprint linked Reference Spec (`spec_blueprint`) needs `fieldset`, being a Release embedded into each Reference the way a Fieldset's is. The type picker hides a whole type by its `requiresAdapters`; the Reference and Virtual Table settings editors hide those settings the same way — no `spec_blueprint` picker, no "A linked blueprint" option.
- **Declined is not missing.** A setting whose purpose the Adapter's `purposes` leave out is *hidden*: the Consumer chose not to serve it. A Consumer with no Blueprint search at all still sees the original "this application has no source" note. Either way **a stored value of a hidden setting stays shown and readable**, never editable — a linked Reference Spec, a linked Row Spec or a stored Fieldset's Blueprint shows the id it holds through the picker's no-source state — and `search` is never asked for a purpose the Adapter declined.

With `purposes: ["reference_target"]` a Consumer therefore offers `reference` and `single_reference` with a targets picker and an embedded Reference Spec, no linked one; no `fieldset`; and a Virtual Table with an embedded Row Spec only.

### By value (fieldkit#356 — decided here, built there)

- **A type whose value needs an Adapter is hidden without it**, on the same terms as a type whose settings do: `reference` and `single_reference` need `reference.search` — the value picker — in addition to their Blueprint capability; `media` needs the `media` Adapter's `upload`; `lookup` needs at least one Source on `adapters.lookup`.
- **A stored Field of a type hidden this way stays shown and readable**, with a "no source" control in place of the input, as a stored setting does above. Hiding still narrows a picker only; it never invalidates a stored Spec (ADR-0022).

### Considered options

- **One Adapter per purpose, as before this ADR.** Rejected again: it is the remount this ADR removed, and a Consumer serving reference targets only would still have to register a whole Adapter to say so.
- **Let the Consumer's publish refuse what it cannot serve, and leave the editor alone.** Rejected: that is an Author authoring what will be refused, which is the failure this ADR exists to prevent.
- **`purposes` defaulting to none.** Rejected: every existing Consumer would lose every Blueprint setting until it declared them, for a narrowing only taskhub needs.
