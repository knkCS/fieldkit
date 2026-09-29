# The data contract freezes with the first Blueprint Release, not with the first npm release

ADR-0019 makes the data contract additive-only because a released Blueprint is served for ever. No Blueprint Release exists yet: blueprinthub and contenthub have no code. Several shapes were still open when 0.18 was ready (the rich-text document boundary, `ti_overlay`'s target Content, hidden Fields), and freezing them unused would make every mistake cost a new type id. So 0.18 ships as a **`0.18.0-rc.N` series**, which the release train already leaves unfrozen. blueprinthub and contenthub build their first slices against it, and **0.18.0, the freeze, is cut when blueprinthub cuts its first real Blueprint Release**. taskhub and mediahub stay on 0.17.x until then: they need none of it, and 0.18 is breaking for them.

## Considered Options

- **Freeze at 0.18.0 now.** Rejected: it freezes shapes no service has exercised, while at least three stored shapes were still changing.
- **Release 0.18.0 with a "provisional" Catalogue until 1.x.** Rejected: it weakens a rule just built, and "provisional" means nothing to a Go importer.

## Consequences

- Until the freeze, the Catalogue compatibility check still passes ("no released Catalogue yet"), and shapes may change between release candidates, each recorded in the release notes.
- #223's release candidates are verified in blueprinthub, contenthub and core's frontend (for the cutover), not in taskhub and mediahub.
