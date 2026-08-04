# `toc_reference` belongs to the Consumer, and fieldkit exports the parts to build it

ADR-0002 drew the line at "the catalogue is generic, the integration surface is not", and named `manipulation_tree` among the types knkCMS core registers for itself. `toc_reference` is that type's structural sibling and sat on the wrong side of the line: its entire meaning is knkCMS publication structure, and core's backend addresses it *by field type id* — `GetFirstFieldByType(bp.Data, TocReferenceFieldTypeID)` expands a publication tree from it, and reference extraction finds a Content's parent through it. Fieldkit therefore drops the type and exports the pieces instead: the tree Reference Field component and a `createReferencePlugin()` factory, so core mints `toc_reference` with `maxPerSpec: 1` in a few lines rather than reimplementing a tree.

That adds a corollary to ADR-0002. The catalogue stays generic, but it exports the parts a Consumer needs to assemble a domain type, rather than leaving each Consumer to build one from nothing — which is what made moving this type out cheap enough to be worth doing.

## Consequences

Breaking removal. The plugin, field component, table cell, stories, MDX and tests all go, and a Spec containing `toc_reference` renders nothing until its Consumer registers a replacement. Fieldkit's implementation was wrong in any case — it held a single string, where a table of contents is a tree — so nothing correct is being lost.

`maxPerSpec` loses its only in-tree user. The machinery stays and still works: `validateSpec()` reports violations, the TypePicker greys out an exhausted type, the canvas blocks the duplicate, and `SpecEditor` routes the resulting non-field error separately. But nothing built in exercises any of it, so from here it is kept honest by tests and by Consumer plugins alone.
