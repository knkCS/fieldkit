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
A Spec whose adapter-backed containers have been expanded into inline Fields. Only a resolved Spec can produce a complete Schema.
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

## Structure

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
One shape a Block may take: a `_type`, a name, and the Fields that shape declares. A Block Type's Fields live in the Blocks Field's settings rather than in `children`, so only that plugin reaches them — `resolveSpec()` and `validateSpec()` do not (ADR-0007).
_Avoid_: field type (that's the kind of a Field; a Block Type is a shape within one Blocks Field)

> The five are distinguished by what they produce: a Card produces no value, a Group produces an array of rows all shaped alike, a Fieldset produces one record, a List produces an array of strings, and Blocks produces an array of records each shaped by its own Block Type.

## References

**Reference**:
A pointer from the Content being edited to another Content. A Reference is a value, not a Field.
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

**Attribute**:
A value a Reference carries about the pointing itself, not about either Content — the page a citation appears on, the role a credit names. Attributes are declared once per Reference Field, as a Spec of their own, and filled in per Reference.
_Avoid_: property, metadata, setting

**Adoption**:
What happens to the References that follow one that arrives shallower than they are: they become its children, and their branches travel with them. A Reference gains children this way whether it was inserted between rows or dragged there, and both say so before they do it — an insert names the rows that will move, a drag highlights them (ADR-0012). Adoption never changes what a Reference *is*, only whose child it is.
_Avoid_: re-parenting, stealing, nesting

**Spring**:
A folded thing opening because a drag rested on it, rather than because anyone clicked. Editor Tabs spring to reveal a Section; Reference Tree rows spring to reveal a branch. A spring is a **preview**: whatever sprang open and did not receive the drop folds back when the drag ends, and cancelling restores every fold to how it was at the lift. Both use one dwell, so the two feel like one idea.
_Avoid_: auto-expand, hover-expand, unfold

**Find**:
Locating a Reference the tree already holds, by what its row shows for the Content it points at — the Content's name, or the raw id shown in place of one. Matching folds diacritics and ignores case, so what an Author can read off a row they can type back in. Distinct from the catalogue browse the picker opens, which looks outward for a Content to add — that one is the Adapter's `search`, and a Reference Field has both.
_Avoid_: search (that's the catalogue browse), filter, lookup

**Reveal**:
A Reference being brought into view: every fold above it opened, and the row itself shown and marked. Where a Spring opens a fold because a drag rested on it, a Reveal opens one because someone named the Reference — so a Spring is a preview and folds back, and a Reveal is not and does not.
_Avoid_: jump, scroll to, expand to

**Version**:
One saved state of a Content's data. Versions have no names of their own.
_Avoid_: revision, snapshot, draft

**Release**:
A named, published Version of a Content, carrying a tag and a title. Every Release is a Version; most Versions are not Releases.
_Avoid_: publication, tag, release version

**Pin**:
The Version or Release one Reference is fixed to. Whether a Reference Field pins at all, and to which of the two, is settled once per Field; which target is settled per Reference. A Reference with no Pin resolves to the Content's newest Version, which is also what a Reference falls back to when its Field stops pinning.
_Avoid_: lock, freeze, snapshot

## Authoring

**Author**:
The person building a Spec in the editor, as distinct from the person who later fills in the rendered form.

**Consumer**:
The application integrating fieldkit — it owns the Spec, persists it, and owns the form instance the renderer reads from.
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

**Adapter**:
The injected boundary through which backend-dependent field types get their data. Fieldkit never calls a service directly.
