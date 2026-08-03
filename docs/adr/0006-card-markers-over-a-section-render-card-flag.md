# Card-ness is a marker, not a flag on the section

Fieldkit expresses card layout with a `card` marker that sub-partitions a tab, and keeps `orientation` as the only `SectionSettings` key. knkCMS core expresses the same idea as `section.render_card: bool`, which makes card-ness a property of the whole tab; fieldkit's model is a strict superset, since `render_card: true` is just a tab whose single card wraps everything. Supporting both would leave an author facing a "render as card" switch and a `+ Card` button that overlap.

Both projects already partition a flat field list at sibling markers (ADR-0001) — core's `build-section-tabs.ts` is the same algorithm as `partitionSchemaBySections()` — so this is a settings-level reconciliation, not a structural one.

## Consequences

Migration inserts a `card` marker as the first field of each `render_card: true` tab — six seeded sections, all in `boor/general/migration/entscheidungen/sql/10_entscheidung.sql`. The same migration must write `orientation: "vertical"` onto each first section: fieldkit defaults to `"horizontal"` (`partition.ts:44`) while core renders vertical tabs, so migrated specs would otherwise silently flip layout.
