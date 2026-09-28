# Conventions

What this repo inherits from the rest of the knkCS org, and where each thing lives. The shared ground is taken from contenthub's [`docs/conventions.md`](https://github.com/knkCS/contenthub/blob/main/docs/conventions.md) (itself taken from legalcitationhub's), so fieldkit doesn't rediscover it. Only the notes marked **This repo** are specific to fieldkit.

fieldkit is not a service. It is a library — the npm package `@knkcs/fieldkit`, and from ADR-0018 on a Go module in `go/` — so several of the org's service rules have no subject here. Those sections say so rather than being dropped, so the next reader knows the gap is deliberate.

---

## Commits

**Conventional Commits, always.** `type(scope): subject`, with `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci` / `build` / `perf` (and `style`). A breaking change takes a `!` or a `BREAKING CHANGE:` footer.

This is not style. It is load-bearing:

- **In the org, `release-please` reads commit types to decide the next version** and to write the changelog. A `feat` bumps the minor, a `fix` the patch, a `!` the major. Mislabel a commit and the released version is wrong.
- **The gate is CI**, not discipline. [`.github/workflows/commitlint.yml`](../.github/workflows/commitlint.yml) calls the org's shared linter on every PR.

**This repo:**

- **Scopes are fieldkit's layers:** `schema`, `editor`, `renderer`, `table`, `rich-text-spec`, or no scope for a cross-cutting change (a docs or tooling change is usually `docs:` / `chore:` with no scope). A release commit is `chore(release): X.Y.Z — <what it ships>`.
- **No `release-please` yet.** A release is a `chore(release)` commit prepared by `npm run release -- prepare <version>` (which bumps `package.json` and, for a final release, freezes `conformance/<version>/`), then the `vX.Y.Z` and `go/vX.Y.Z` tags on that one commit, which `npm run release -- tags` prints and a person pushes; a release candidate `X.Y.Z-rc.N` goes first. The `v` tag runs [`publish-fieldkit.yml`](../.github/workflows/publish-fieldkit.yml), which publishes to npmjs.org and GitHub Packages. The full procedure is [`releasing.md`](./releasing.md). The version is chosen by a person reading the commits since the last tag, so the types still decide it — just not mechanically.
- **The API stays on 0.x** (ADR-0019): a breaking change to the TS API bumps the *minor*, as npm's caret ranges expect on 0.x. The **data contract** — Field JSON, settings, value shapes, error codes — only ever grows, whatever the version says (ADR-0019). Once the Go module exists, one release carries one version for both: `vX.Y.Z` and `go/vX.Y.Z` from the same commit (ADR-0018).

## GitHub Actions: reuse, don't rewrite

All CI comes from **[`knkCS/workflows`](https://github.com/knkCS/workflows)**, the org's shared reusable workflows and composite actions. It is deliberately **public**, so repos in both the `knkcs` and `knkcms` orgs can call it on the free tier; private cross-org reuse would need Enterprise. It holds **no secrets**: callers pass `CI_TOKEN` via `secrets: inherit`.

**If CI needs to do something it doesn't do yet, change it there, not here.** A bespoke workflow in a service repo is a fork of the org's CI that nobody else benefits from and nobody else maintains.

| Workflow | Purpose |
|---|---|
| `go-service-ci.yml` | Go service CI: vet, test, lint, optional UI and Helm jobs |
| `commitlint.yml` | Conventional-commit linting |
| `release-please.yml` | release-please PR + release automation |
| `publish-image-chart.yml` | Build and push image + Helm chart to GHCR |
| `publish-ui.yml` | Publish a UI npm package |
| `argocd-rendering-check.yml` | Render and schema-validate a deploy repo's ArgoCD Applications |

Composite actions: `configure-private-modules` (GOPRIVATE + git `insteadOf`), `setup-go-node` (setup-go, optional setup-node, caching).

**This repo:** `commitlint.yml` and `go.yml` are callers of the shared workflows. `go.yml` calls `go-service-ci.yml` for the Go module in `go/` — and cannot pass yet: the shared workflow runs at the repository root and has no `working-directory` input, while the module's `go.mod` is in `go/` (the file's header says more). fieldkit's other three workflows predate this baseline and are its own:

| Workflow | What it does |
|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | lint, typecheck, the Catalogue staleness and compatibility checks, build, verify-exports, tests on Node 22 and the Go module's checks — the same steps as `npm run verify` |
| [`publish-fieldkit.yml`](../.github/workflows/publish-fieldkit.yml) | on a `v*` tag: checks the tag against `package.json`, runs the same gate, publishes to npmjs.org (with provenance) and GitHub Packages |
| [`storybook.yml`](../.github/workflows/storybook.yml) | deploys Storybook to GitHub Pages on every push to `main` |

They are a known deviation from "reuse, don't rewrite", not a precedent: a new workflow here goes through `knkCS/workflows` first.

### Pinning

**Pin `@v1`**, a moving major-version tag that advances on backward-compatible changes.

**There is one exception; know it before you copy a caller.** A reusable workflow **silently ignores an input it does not declare** rather than erroring. So if `v1` points at a commit that predates an input you rely on, your gate stops running while every check stays green. CI quietly gets shorter, which is exactly the failure that adopting shared CI is meant to remove. `taskhub` pins `go-service-ci` to a **commit** for this reason, and says so in the file. Do the same whenever you depend on a recently added input.

`commitlint.yml` takes no inputs, so `@v1` is safe for it.

### Current state

**Actions in the org have been blocked by a billing issue** (as recorded in legalcitationhub). `commitlint.yml` is committed here anyway, so the gate is in place the moment Actions run again, as are `go.yml`, `ci.yml`, `publish-fieldkit.yml` and `storybook.yml`.

**This repo: until then, the merge bar is `npm run verify`, run locally.** It runs what `ci.yml` runs — lint, typecheck, the Catalogue staleness and compatibility checks, build, verify-exports, the full suite (`test:gate`, which allows 30s per test and one retry, because the jsdom suite is load-sensitive) and the Go module's gofmt, `go vet` and `go test` (`verify:go`). A PR's checks stay pending for ever and are not a gate; a PR merges only when `npm run verify` is green at the merge commit. Nothing runs commitlint locally, so commit messages are checked by review until Actions return. `CLAUDE.md` holds the full rule; update both when Actions run again.

## Shared code: `knkCS/commons`

**[`knkCS/commons`](https://github.com/knkCS/commons)** is the shared Go library for the microservice ecosystem. It is a private module:

```sh
export GOPRIVATE=github.com/knkcs/*
go get github.com/knkcs/commons@latest
```

Pin a `v*` tag. Importing one package never drags in another's machinery: a service that only writes Events gets no NATS client in its build.

**Reach for commons before writing any of these:**

| Package | What it owns |
|---|---|
| `config` | koanf YAML + env overlay |
| `errors` | Domain error types with Connect-RPC code mapping |
| `ctxutil` | user, org, admin, service, workspace, correlation id, delegation |
| `correlation` | The correlation id: header, format, and the trust rule |
| `interceptor` | Connect-RPC interceptors: auth, request info, locale, logging, correlation |
| `middleware` | Plain-HTTP middleware for non-Connect routes |
| `logging` | slog handler that puts `correlation_id` on every line |
| `guard` | Fail-closed Guardian authorization (`Require`) |
| `entmixin` | Ent mixins; `BaseMixin` gives a KSUID id + timestamps |
| `ksuid` | KSUID utilities |
| `events` | The Event contract: Envelope, proto naming rule, Encode/Decode, Outbox `Write` |
| `events/relay` | Draining the Outbox onto NATS |
| `events/harness` | Smoke-test machinery for events |
| `fieldspec` | fieldkit field specs |
| `server` | HTTP server helpers |

**Snippets that turn out to be useful across repos belong in commons**, not copied between services.

**This repo:** the TS package has no Go and nothing from this list applies to it. The Go module (`github.com/knkcs/fieldkit/go`, ADR-0018) is a library, not a service, so most of commons is still not its business. The one overlap is `commons/fieldspec`, which stays in commons on raw JSON, merges System Fields and knows nothing of types; fieldkit's `ValidateSpec` enforces the card-marker rule it relies on, so the two cannot disagree about a valid Spec (ADR-0018, ADR-0020).

---

## Design principles shared across the org

These recur across `commons`, `flowhub`, `taskhub`, `statushub`, `core` and `knkeditor`. They are the house style, and this repo follows them.

### 1. A glossary with an `_Avoid_` list

Every repo has a **`CONTEXT.md`** that defines the terms carrying a specific meaning, the ones that *would be misread in their everyday sense*. Each term has an explicit `_Avoid_:` line naming the synonyms that must not be used. The `_Avoid_` line is the part that does the work: it stops two people writing the same concept under three names.

**This repo:** [`CONTEXT.md`](../CONTEXT.md).

### 2. Numbered ADRs, cited by number

**`docs/adr/NNNN-lowercase-sentence-title.md`**, numbered from 0001, and cited by number from code comments, CLAUDE.md and other ADRs: `(ADR 0004)`, `docs/adr/0008-*`. An ADR states the decision *and the alternatives rejected*.

Contradicting one is allowed; doing it silently is not. Say so explicitly: *"Contradicts ADR 0007, but worth reopening because…"*

**This repo:** [`docs/adr/`](./adr/). fieldkit cites them hyphenated, `ADR-0014`, in code, CLAUDE.md and the ADRs themselves; keep that spelling here so a search finds every citation. Older design records live in `docs/superpowers/specs/`; they predate the ADRs and are consulted, not extended.

### 3. Comments carry the *why*, at length

This is the most distinctive thing about the org's code, and it looks excessive until you need it. `taskhub`'s `ci.yaml` has roughly three lines of comment per line of configuration. Every one answers a question a reader would otherwise have to reconstruct: why a commit pin rather than `@v1`, why `30m` rather than the default, why a job is guarded on the event and not just `needs:`.

The rule that generates this: **when a value or a structure is the way it is because of something you learned, write down what you learned.** A comment that restates the code is noise; a comment that records the failure that produced the code is the only copy of that knowledge.

### 4. Events: Outbox, Relay, and a named type

A service that publishes facts for others to react to follows the platform Event contract (commons `CONTEXT.md`, ADRs 0001–0005; originally flowhub ADR 0002):

- **Event type** is `<namespace>.<aggregate>.<past-tense verb>`, e.g. `template.export.completed`. It is both the name and the address.
- **Envelope + Payload.** The Envelope is the same for every Event: id, type, version, time, Workspace, Entity, Actor, cause. commons owns it.
- **Transactional Outbox.** The Event is written **in the same transaction** as the change it reports.
- **A Relay** publishes from the Outbox *outside* that transaction, retries forever, and gives up only on what the broker could never accept.
- **A correlation id** is minted at the edge, trusted only on a delegated token, and copied into every Event a change produces.

**This repo:** not applicable. fieldkit publishes no Events and owns no transaction; the services that store fieldkit values do.

### 5. Workspace scoping is enforced, not trusted

Multi-tenancy runs through a Workspace on every entity, and the org treats cross-workspace access as a live risk rather than a convention. `taskhub` has a dedicated CI job asserting that **every generated table carries the column the workspace predicate is written against**. A cross-workspace IDOR (insecure direct object reference) was closed across six services by adding an explicit workspace check at about 49 call sites. That check is now taskhub's `entscope`, a workspace-scoped ent client.

**This repo:** not applicable directly. fieldkit has no storage and makes no API calls: every backend lookup (references, media, blueprints, lookups) goes through an adapter the consumer injects (see `src/renderer/adapters.ts`), so scoping is the consumer's adapter's job, never fieldkit's.

### 6. One stack, few choices

Go · Connect-RPC (buf v2) · Postgres · Ent + Atlas migrations run as a Job *before* the rollout · KSUID ids · Helm charts to GHCR · deploys through `knkCS/platform-deploy` · frontend on `@knkcs/anker` with `@knkcs/fieldkit` forms, as a UI package plus a thin embedded `web/` host. Core mounts services per knkcms/core ADR 0003 (one way to integrate a service).

Deviating is allowed, and a deviation is an ADR. **This repo:** fieldkit is the `@knkcs/fieldkit` forms the stack names, not a service: a TypeScript library built with tsup, tested with Vitest (jsdom), linted with Biome and documented in Storybook, plus a Go module in `go/` for the same field types (ADR-0018). No server, database, image or chart.

### 7. A migration must be survivable mid-rollout

A new column on a hot table **carries a `DEFAULT`**, declared in the Ent schema so Atlas stays drift-free. The migration Job runs before the rollout while old pods are still serving, and a rollback brings them back. A `NOT NULL` column without a default would fail every one of their writes during that window. Flowhub found this the hard way.

**This repo:** fieldkit has no migrations. Its counterpart is the data contract: a released Blueprint is served for ever, so the Field JSON, settings, value shapes and error codes change **additively only**, enforced by a Catalogue diff and every earlier release's conformance fixtures (ADR-0019). An unset value is stored as absent (ADR-0021).

### 8. UI: anker, always

fieldkit's UI follows the **anker design system**. This section is a pointer; the rules themselves live with anker and win over this summary.

- **The agent rules** are anker's [`CLAUDE-ANKER.md`](https://github.com/knkCS/anker/blob/main/CLAUDE-ANKER.md). A repo with a UI package `@`-imports it at the top of its `CLAUDE.md`, as taskhub does: `@node_modules/@knkcs/anker/CLAUDE-ANKER.md`. It then tracks the installed anker version.
- **The human spec** is in anker's [`docs/design-system.md`](https://github.com/knkCS/anker/blob/main/docs/design-system.md) (tokens, palette, typography) and [`docs/page-patterns.md`](https://github.com/knkCS/anker/blob/main/docs/page-patterns.md) (page anatomy, templates, slots). Trust anker's source over the docs where they differ.
- **Five principles:** refined minimalism (brand colour for the primary action only), density over air, consistency over creativity (use existing patterns as they are), a clear hierarchy (title, primary action, content), and keyboard-first where it matters (`/` search, `⌘K`).
- **Components:** anker components only, never raw Chakra (the lint rule fails the build). There are no Chakra v2 patterns. Pages are built from templates (`IndexPageTemplate`, `DetailPageTemplate`, `SettingsPageTemplate`). Tables use `DataTable` and its cells. Forms use anker `*Field` + React Hook Form + Zod, with fieldkit fields rendering through them. Overlays use `Modal`, `Drawer` and `useConfirmModal`. If no template fits, file an issue on anker rather than inventing a layout.
- **Tokens:** semantic tokens only, never hex (`accent`, `bg-canvas`, `bg-surface`, `border`, `default`, `muted`). The palette is closed. Radius is `md`. Shadows stay subtle. Animations stay at or under 300 ms. Icons are Lucide. Fonts are Inter Tight and JetBrains Mono, via `@fontsource`.
- **Host contract** ([anker ADR 0003](https://github.com/knkCS/anker/blob/main/docs/adr/0003-host-owns-the-frame-anker-owns-the-contract.md); knkcms/core ADR 0003 and core's `docs/service-integration.md` provider checklist): screens report their frame through the templates and read identity through `@knkcs/anker/host`.
- **Packaging:** `@knkcs/anker` is a peer dependency supplied by the host, and also a dev dependency.

**This repo:**

- fieldkit ships components, not screens: no page templates, no host frame. It renders *inside* consumers' screens, so the host contract binds its consumers rather than it, and consumers own the React Hook Form instance (`useFormContext()`, never `useForm()`).
- **Known deviation:** fieldkit imports `@chakra-ui/react` directly (about 110 files under `src/`, for layout primitives anker does not wrap), and its Biome config has no rule against it. New code reaches for anker first; a raw Chakra import needs a reason anker cannot supply.
- `CLAUDE.md` lists `node_modules/@knkcs/anker/CLAUDE-ANKER.md` under *Reference Docs* rather than `@`-importing it; it still tracks the installed anker.
- The anker **devDependency equals the peer floor** (`^5.4.0` both), so fieldkit compiles against the oldest anker it promises (ADR-0014). Never raise the devDependency past the floor.
- There is no `./testing` subpath; consumers stub fieldkit's adapters instead.
