# Adapter-backed containers are expanded by an explicit resolve step

`resolveSpec(spec, adapters) => Promise<Schema>` expands adapter-backed containers — today only `fieldset` (ADR-0003) — into inline children before `specToZodSchema()` runs. We added an explicit async step rather than letting a fieldset validate as an opaque record, because `specToZodSchema()` composes each plugin's `toZodType()` into one schema keyed by accessor: a hole in that schema means a required field inside a fieldset silently stops blocking submit.

## Considered options

Lazily composing each fieldset's sub-schema into the live form as its blueprint arrives keeps validation complete without a load-order change, but requires dynamic resolver composition in React Hook Form. Rejected as disproportionate.

## Consequences

Consumer integration becomes two-phase: fetch the spec, await `resolveSpec`, then build the Zod schema and render. `defineSpec()` and `getDefaultValues()` are synchronous and operate on the resolved spec, not the authored one. The resolve step is where fieldset cycle detection lives.
