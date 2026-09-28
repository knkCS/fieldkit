# Fieldkit

Fieldkit is a specification-driven field system: one authored Spec drives the editor that builds it, the form that renders it, and the table that displays its data. Its field-type catalogue is generic — domain-specific types belong to the Consumer that registers them — while its adapter surface deliberately names knkCMS concepts (see ADR-0002). This glossary is the language of *authoring and rendering specs*, not of any consuming service.

## The spec

**Spec**:
The authored document — an ordered list of Fields — that drives the editor, the renderer, and the table alike. "Specification" is the same word spelled out.
_Avoid_: schema, form definition, field config

> The code names this type `Schema` and passes it as a `schema` prop throughout. That naming predates this glossary; in prose, issue titles, and new names, the term is Spec.

**Schema**:
The Zod validator generated from a Spec, composed from each field type's Zod type.
_Avoid_: bare "schema" for the authored document — that's a Spec

**Resolved Spec**:
A Spec whose every Pin has been resolved, so a reader never follows a second one: each pinned Blueprint Release is expanded into inline Fields, and each other pinned part — a Text Type, a Typesetting Instruction Set — is carried once beside the Fields, however many Fields pin it. Only a Resolved Spec can produce a complete Schema, and only a Resolved Spec can validate a value.
_Avoid_: expanded spec, flattened spec

**Blueprint**:
A stored Spec, addressable by id and resolvable through the blueprint adapter. Fieldkit never owns blueprints — it asks a Consumer for them.

**Content**:
An instance of a Blueprint — the thing a Reference points at. Fieldkit never owns Contents; it asks a Consumer for them through the reference adapter.
_Avoid_: item, record, entity

**Field**:
One entry in a Spec: a field type, plus the config, validation, and settings that specialise it.

**Field Type**:
The kind of a Field, named by an id such as `text`, `group`, or `card`.

**Plugin**:
The object implementing a field type — its Zod type, its renderer, its table cell, its settings. Built-in and custom types are plugins alike.
_Avoid_: field type (that's the kind; the plugin is its implementation)

**Catalogue**:
Every Field Type one fieldkit release knows, described as data: each type's id, the settings it accepts, where it is available, and which of its settings hold a Pin. TS and Go read the same Catalogue, and it only ever grows — a released Blueprint keeps meaning what it meant.
_Avoid_: registry (that's the TS runtime lookup of Plugins), type list

**Catalogue section**:
The part of the Catalogue one package ships: the core section, which every Consumer has, and an opt-in package's — the publishing package's — which a Consumer has only once it adds that package, in TS by passing its Plugins and in Go by building `DefaultCatalogue().With(section)`. Every section carries the one Catalogue version and is judged with the others; a type never moves between them.
_Avoid_: extension, plugin pack

## Structure

**Position**:
Where in a Spec a Field sits — at the root, in a Row Spec, in a Reference Spec, in a Block Type — which decides which Field Types it may be. Enforced wherever a Spec is validated, and for a linked part only once it is known what the part is linked as, which is when the Blueprint Release using it is cut. Distinct from which Consumers offer a Field Type in their picker, which is advice, not a rule.
_Avoid_: context, availableIn (the old name that mixed the two)


**Marker**:
A Field that partitions layout and produces no value in the payload. Section and Card are the markers.

**Section**:
The marker an Author inserts to begin a new Tab.

**Tab**:
The run of fields that one Section opens in the rendered form.
_Avoid_: page, step, panel

**Card**:
The marker that visually groups the fields following it, within a single Tab.
_Avoid_: group, panel, box

**Group**:
The repeating field type — a list of rows, each row holding the same child Fields.
_Avoid_: card, repeater, collection

**Virtual Table**:
The repeating field type whose rows are shown and edited as a table, one row per record. Its Row Spec is either **linked** — a Blueprint, which several Virtual Table Fields can share — or **embedded** in the Field itself. Distinct from Group, whose rows are edited inline as stacked forms and whose row Fields are always its own `children`.
_Avoid_: group, grid, repeater

**Row Spec**:
The Spec every row of a Virtual Table follows. **Linked** when it is a Blueprint the Field names; **embedded** when the Field declares it itself. A Field has exactly one.
_Avoid_: table schema, columns (a column is how a Row Spec's Field is shown, not the Field)

**Fieldset**:
The field type that embeds a Blueprint's Fields as one non-repeating record, nested under its own Accessor.
_Avoid_: group, nested object, sub-form

**List**:
The field type holding a flat, ordered set of free-text Entries — `string[]`. Distinct from Array, which holds key-value pairs (ADR-0005).
_Avoid_: array, tags, multi-value

**Entry**:
One string in a List. Entries are positional and carry no identity of their own.
_Avoid_: item, row, value

**Blocks**:
The field type holding an ordered list of Blocks of differing shape, each added from one of the Block Types the Field allows. Distinct from Group, whose rows all hold the same Fields.
_Avoid_: group, repeater, content zone

**Block**:
One item in a Blocks Field, identified by the `_type` of the Block Type it was added from.
_Avoid_: card, section, component

**Block Type**:
One shape a Block may take: a `_type`, a name, and the Fields that shape declares. A Block Type's Fields live in the Blocks Field's settings rather than in `children`, so `resolveSpec()` does not reach them (ADR-0007); `validateSpec()` walks them as it walks `children`. No two Block Types of one Blocks Field share a `_type`.
_Avoid_: field type (that's the kind of a Field; a Block Type is a shape within one Blocks Field)

> The five are distinguished by what they produce: a Card produces no value, a Group produces an array of rows all shaped alike, a Fieldset produces one record, a List produces an array of strings, and Blocks produces an array of records each shaped by its own Block Type.

## References

**Reference**:
A pointer from the Content being edited to another Content. A Reference is a value, not a Field: its target's id, an optional Pin, an `_id` of its own and its values — never a label, never the target's Blueprint.
_Avoid_: link, relation, item

**Reference Field**:
The field type holding a Reference Tree.
_Avoid_: references, relation field

**Single Reference**:
The field type holding exactly one Reference, or none. A separate type rather than a Reference Field capped at one, because the two produce incompatible values (ADR-0005).
_Avoid_: single ref, one-to-one reference

**Reference Tree**:
The nested arrangement of References a Reference Field holds — each Reference may carry child References. A Reference Field owns both the order and the nesting; neither is derived from the Contents themselves.
_Avoid_: hierarchy, outline, structure

**Reference Spec**:
The Fields a Reference Field declares for every Reference it holds, whose values describe the pointing itself, not either Content — the page a citation appears on, the role a credit names. Embedded in the Field once, and replaced — never merged — by a linked Blueprint Release where the Field names one for the target's Blueprint, so every Reference has exactly one. The values, a Reference's `values` keyed by Accessor, belong to the pointing Content's Revision. The term is contenthub's.
_Avoid_: attributes, attribute spec, reference attributes, title data, edge data

**Manipulation Tree**:
The publishing package's field type holding a Title's composition: a Reference Tree whose every node carries an Intent. It shares the Reference Tree's rules — `_id`s, caps, Compare and Merge per node — and none of what the Intents do, which is contenthub's manipulation engine.
_Avoid_: configurator, manipulation spec

**Intent**:
What a Manipulation Tree node does with the Content it names: `include` it (its values following the Field's Reference Spec), `exclude` it, `replace` it `with` another, or `annotate` it (its values following the node-level Reference Spec, `annotation_spec`). Each is also the kind of the Content Graph edge the node yields.
_Avoid_: op, operation, node type, manipulation

**Adoption**:
What happens to the References that follow one that arrives shallower than they are: they become its children, and their branches travel with them. A Reference gains children this way whether it was inserted between rows or dragged there, and both say so before they do it — an insert names the rows that will move, a drag highlights them (ADR-0012). Adoption never changes what a Reference *is*, only whose child it is.
_Avoid_: re-parenting, stealing, nesting

**Spring**:
A folded thing opening because a drag rested on it, rather than because anyone clicked. Editor Tabs spring to reveal a Section; Reference Tree rows spring to reveal a branch. A spring is a **preview**: whatever sprang open and did not receive the drop folds back when the drag ends, and cancelling restores every fold to how it was at the lift. Both use one dwell, so the two feel like one idea.
_Avoid_: auto-expand, hover-expand, unfold

**Find**:
Locating a Reference the tree already holds, by what its row shows for the Content it points at — the Content's name, or the raw id shown in place of one. Matching folds diacritics and ignores case, so what an Author can read off a row they can type back in. Distinct from the catalogue browse the picker opens, which looks outward for a Content to add — that one is the Adapter's `search`, and a Reference Field has both.
_Avoid_: search (that's the catalogue browse), filter

> Find and Lookup are the pair: **Find looks inward** at the tree already held, **Lookup looks outward** at a Source. Neither is "search" — that word is the Adapter method both of them are not.

**Reveal**:
A Reference being brought into view: every fold above it opened, and the row itself shown and marked. Where a Spring opens a fold because a drag rested on it, a Reveal opens one because someone named the Reference — so a Spring is a preview and folds back, and a Reveal is not and does not.
_Avoid_: jump, scroll to, expand to

**Revision**:
One immutable saved state of a Content's data or of a Blueprint's Fields. contenthub owns the term; fieldkit needs it only to say that a Pin never names one.
_Avoid_: version (unqualified), snapshot, draft

**Release**:
A named, immutable pin of one Content or one Blueprint at one of its Revisions. It labels a Revision rather than copying it, and it is the only thing a Pin may name. The term is contenthub's.
_Avoid_: version (unqualified), tag, publication, snapshot

**Blueprint Release**:
A Release of a Blueprint. What a Fieldset, a linked Row Spec, a linked Reference Spec and an outline tree pin, and what the Blueprint Release using them has them resolved into, so that a reader never follows a second Pin.
_Avoid_: blueprint version, blueprint id (a bare id no longer names a shape)

**Pin**:
A fixed Release. A Reference may carry one, naming one of its target Content's Releases; whether a Reference Field's References may be pinned at all is settled once per Field. A Field that uses a shared part — a Fieldset, a linked Row Spec or Reference Spec, a Text Type — always pins that part's Release. A Pin never names a Revision.
_Avoid_: lock, freeze, snapshot, version pin

## Lookups

**Lookup**:
The field type holding exactly one id from a Source, or none. Distinct from a Reference, which points at a Content — a Lookup points at something with no Blueprint, no Revisions and no Releases, so it carries no Pin and no Reference Spec and its value is a bare id string (ADR-0015). Paired with Find: **Find looks inward** at the tree already held, **Lookup looks outward** at a Source.
_Avoid_: reference, relation, external reference

**Source**:
One external collection a Lookup may point into, registered by the Consumer under an id its Fields name. Fieldkit knows only how to ask a Source — what is in one, where it lives and what it is called are the Consumer's alone.
_Avoid_: catalogue (that word already means both the field-type catalogue and the catalogue browse over Contents), collection, provider, registry

## Authoring

**Author**:
The person building a Spec in the editor, as distinct from the person who later fills in the rendered form.

**Consumer**:
The application integrating fieldkit — it owns the Spec, persists it, and owns the form instance the renderer reads from. Which Consumers a Field Type names (`consumers`) only decides whose type picker offers it; unlike a Position, it is never enforced (ADR-0022).
_Avoid_: host, client app, embedder

**Draft**:
The in-progress copy of a Spec inside an editor session, not yet saved.

**Baseline**:
The last saved Spec that the Draft is measured against; any difference makes the draft dirty.
_Avoid_: committed (commit means git here), original, saved state

**System Field**:
A Field whose definition is server-canonical — the Author cannot edit it, because any change would revert on the next read.

**Locked Setting**:
One setting of an otherwise editable Field that the Consumer has frozen, with a reason the Author is shown. What makes a setting lockable is knowledge fieldkit does not have — whether changing it would strand data that already exists.
_Avoid_: disabled setting, readonly setting, system setting

## Data

**Accessor**:
The key a Field's value takes in the payload, unique among its siblings.
_Avoid_: name (that's the Field's human-readable label), key, id

**Unset**:
A setting or a value that says nothing: absent, `null`, `""`, `[]` or `{}` — all five mean the same, everywhere, in TS and Go alike, so two of them compare equal and `required` rejects each. `0` and `false` are values, not Unset. Unset is stored one way only — absent. Nothing can be narrowed to "none" by leaving it empty; whoever needs "none" says so with a switch of its own.
_Avoid_: empty (as distinct from unset), cleared, blank

**Adapter**:
The injected boundary through which backend-dependent field types get their data. Fieldkit never calls a service directly.
