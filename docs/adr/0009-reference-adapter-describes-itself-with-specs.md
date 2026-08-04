# The reference adapter describes its filters and result columns as Specs

Picking a Content needs filtering and needs columns, and in knkCMS those mean status and assigned user — domain nouns that ADR-0002 keeps out of the catalogue, and worse than an adapter *name* because fieldkit would be rendering them. So the adapter describes itself instead: `getSearchFilters()` returns the `Field[]` describing a query, `getResultColumns()` returns the `Field[]` describing a Content row, and fieldkit renders both with machinery it already owns — `FieldRenderer` for the filter form, `SpecDataTable` for the results, each field type bringing its own control and cell for free. Collected filter values travel back through `search()` as an opaque record that fieldkit never inspects. Two Specs rather than one, because they model two different things: a query is not a Content.

This is the same instinct as attributes-as-a-Spec — when something needs describing as a form, fieldkit already has the way to describe it — applied to the integration surface rather than to settings.

## Considered options

A Consumer-supplied render prop for the filter UI would let core reuse its existing filter components verbatim, including ones no Spec could express. Rejected: it is a genuinely new extension point, where ADR-0002's own reasoning preferred the route that needed none, and injected filters would stop matching the drawer around them. One Spec plus a new `FieldConfig` flag marking each Field filterable, displayable or both was rejected because that flag would sit on the shared config for exactly one caller to read and every other layer to ignore.

## Consequences

`search()` becomes a query object taking `blueprintIds`, `query`, `filters`, `page` and `page_size`, and returns `{ items, total }` rather than a bare array — a filterable picker over a real content set needs pagination, and the old signature could not express it.

An adapter now authors Specs, by hand or through `defineSpec()`. A filter no field type can express — a date range, a user picker with avatars — needs a new field type rather than a bespoke control. That is the price of the drawer staying coherent with everything else fieldkit renders.

Both methods are optional. Without them the picker degrades to a search box and a name column, which is what a Consumer that has not implemented them should get rather than an error.
