# Where a Field may sit is enforced; which Consumers offer a type is only advice

`availableIn` mixed two axes: which **Consumer** authors a Spec (blueprint, task, form) and where in a Spec a Field sits (`attribute`, meaning inside a Reference Spec). The Catalogue splits them. `consumers` only filters a Consumer's type picker, as blueprinthub ADR 0003 has it, and Go ignores it. `positions` — `root`, `row`, `reference_spec`, `block_type`, … — is enforced by one recursive check in `ValidateSpec`, in TS and Go, which absorbs the Row Spec allow-list (ADR-0017) and the Reference Spec rule rather than keeping one mechanism per container. `attribute` becomes `reference_spec`; this is plugin metadata, so no stored data changes.

A linked part's Position is known only once another Blueprint pins it, so the check also runs on the Resolved Spec when a Release is cut (ADR-0020).

Accessors starting with `_` are reserved in every Position, for `_id`, `_type`, `_order` and whatever the value shapes need later.
