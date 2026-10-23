# A media field names its stored assets and picks existing ones through the adapter

The media field could only upload: it learned a stored id's name only if that asset happened to be in
the first `browse()` list, loaded unfiltered on mount, so on any real workspace a stored file showed as
a bare id, and an asset already in MediaHub could not be chosen at all (found with taskhub's
attachments, its ADR 0017, 2026-10-23). The media adapter gains three things, all optional so every
consumer keeps working: **`resolve(ids)`** names the stored ids, deleted ones included (marked as
such), and an id it leaves out shows as itself — the rule ADR-0009 and ADR-0027 give stored Blueprint
ids; **a picker** that searches existing assets through `browse({query, mime_types})`, filtered by the
field's `accept` and stopped at `max_items`, on ADR-0027's terms (a consumer whose adapter cannot
search is offered upload only); and **`upload(file, context)`**, whose second argument names the field
(and whatever the consumer passes with it) so the consumer, not the spec, decides where an upload is
stored. The field no longer calls `browse` on mount.

## Considered Options

- **A media field of each consumer's own.** Rejected: two implementations of one field type, and
  contenthub would keep the gap.
- **`browse` filtered by the stored ids.** Rejected: it would make `browse` mean "name these" as well
  as "search", the two jobs ADR-0027 keeps apart.
