# fieldkit compiles against the oldest anker it promises

The `@knkcs/anker` peer range spans three majors — `^3.1.0 || ^4.0.0 || ^5.0.0` — while the devDependency stays at `^4.0.0`. That gap is deliberate. The devDependency is the only anker any gate in this repo ever executes: `ci.yml` and `publish-fieldkit.yml` both install from the lockfile, so whatever it pins is what lint, typecheck, build, `verify-exports` and the suite compile and run against. Pinning it low makes the typechecker enforce the lower legs of the range for free — an import of an API that exists only in a newer anker fails to compile here, instead of shipping and throwing in a Consumer. anker 5.0.1 adds 20 exports to `components` and 6 to `atoms` over 4.0.0; with the devDependency on 5, using any of them would leave every gate green and break every Consumer still on 4, which at the time of writing is all of them.

Read the pairing the other way round and it is the same rule: the range's *ceiling* is the leg no compiler can defend, so it is proven by running the gates against it deliberately, and the result is a point-in-time fact that has to be re-established each time anker cuts a major. For 5.0.1 that was done on 2026-08-18 — the full gate set at 4.0.0 as a control and again at 5.0.1 in the same tree, 158 files and 1805 tests green both times, with zero exports removed from the five subpaths fieldkit imports (`forms`, `components`, `primitives`, `atoms`, `feedback`) and an unchanged peer set.

## Considered options

Moving the devDependency to the newest anker is the obvious reading of "keep dependencies current", and it answers a real failure: the range went stale to `^3.1.0 || ^4.0.0` and blocked every Consumer that upgraded (knkCS/fieldkit#180, escalated from knkCS/taskhub#244) precisely because nothing here had reason to notice anker had moved. It was rejected because the failure it prevents is loud and the failure it introduces is silent — a stale range fails at install with `ERESOLVE`, before anything is built, while accidental use of newer API fails at runtime in a Consumer with every gate green behind it. `verify-exports` does not catch it either; it compares tsup entries to the built `.d.ts`, not anker's surface.

Testing both ends in CI is the answer that makes the ceiling's proof continuous rather than dated, and is the intended successor to the manual run above. It is not in place yet.

This reverses the earlier practice, which ran the devDependency *ahead* of the peer floor within a major — devDependency `^3.1.1` then `^3.2.0` against a peer of `^3.1.0`, each time with a written argument that the new feature degraded gracefully on the older anker (`docs/superpowers/plans/2026-07-06-*`). That is a defensible trade inside one major, where the surface barely moves and the degrade can be reasoned about field by field. It does not survive a range spanning three majors, where nobody is going to reason about 26 added exports one at a time.

## Consequences

Currency has to come from somewhere other than the devDependency, because nothing here will notice anker moving. Today that somewhere is a Consumer hitting `ERESOLVE`, which is how this ADR came to exist.

The `^3.1.0` leg is defended by neither compiler nor evidence: the devDependency is `^4.0.0`, so 3.1.x is below what anything compiles against, and the 2026-08-18 verification compared 4.0.0 to 5.0.1 and never touched it. It is an assertion, and if it cannot be tested it should probably be dropped rather than carried.

Anyone raising the devDependency should read this first — beside a three-major peer range it reads as neglect, and the correction is the mistake.
