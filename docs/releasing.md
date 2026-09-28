# Releasing

One fieldkit release is **one version number on one commit, tagged twice**
(ADR-0018): `vX.Y.Z` publishes the npm package `@knkcs/fieldkit`, and
`go/vX.Y.Z` is the version of the Go module `github.com/knkcs/fieldkit/go`.
Both embed the same Catalogue, so "does a service know everything this
Blueprint Release uses" stays a version comparison.

`npm run release` prepares and checks a release. **It never creates or pushes
a tag.** Agents are blocked from pushing release tags, and a pushed tag cannot
be taken back, so the script prints the commands and a person runs them.

## The train

A release candidate goes first. Every step runs from an up-to-date `main`.

### 1. A release candidate: `X.Y.Z-rc.N`

```sh
npm run release -- prepare 0.18.0-rc.1
npm run verify:full
git switch -c release/0.18.0-rc.1
git commit -am "chore(release): 0.18.0-rc.1 — <what it ships>"
```

`verify:full` is `npm run verify` with each Go Fuzz target fuzzed for 60s
instead of 3s (`scripts/fuzz-go.sh`): a release is when the long run pays. A
failing input it finds is written to `go/testdata/fuzz/`; fix the panic and
commit the input with the fix, as the regression case.

`prepare` refuses a dirty tree or a version not newer than `package.json`,
checks that the Catalogue is current and may ship under this version (below),
and sets `package.json` and `package-lock.json` to it. A candidate freezes
nothing: its fixtures may still change before the release.

Land the commit on `main` through a PR, then on `main` at that commit:

```sh
git fetch origin && git checkout <the release commit on main>
npm run release -- tags
```

`tags` checks that HEAD is the release commit — its subject starts
`chore(release): <package.json's version>`, the tree is clean, neither tag
exists, the commit is on `origin/main`, and the Catalogue checks still hold —
and prints:

```sh
git tag -a v0.18.0-rc.1 <sha> -m "@knkcs/fieldkit 0.18.0-rc.1"
git tag -a go/v0.18.0-rc.1 <sha> -m "github.com/knkcs/fieldkit/go 0.18.0-rc.1"
git push origin v0.18.0-rc.1 go/v0.18.0-rc.1
```

A person runs them. The `v` tag runs `publish-fieldkit.yml`, which publishes a
candidate under npm's `next` dist-tag, so `latest` does not move. Try the
candidate in its consumers (`npm i @knkcs/fieldkit@next`,
`go get github.com/knkcs/fieldkit/go@v0.18.0-rc.1`); cut `-rc.2` the same way
if it needs fixing.

### 2. The release: `X.Y.Z`

The same three steps with the final version:

```sh
npm run release -- prepare 0.18.0
npm run verify:full
git switch -c release/0.18.0
git add -A    # includes the new conformance/0.18.0/
git commit -m "chore(release): 0.18.0 — <what it ships>"
```

A final release also **freezes** its data contract: `prepare` copies
`conformance/unreleased/` and every Catalogue section into
`conformance/0.18.0/` — `go/catalogue.json` as `catalogue.json`,
`go/publishing/catalogue.json` as `catalogue.publishing.json`
(`scripts/lib/catalogue-sections.ts`, ADR-0018). That folder is never edited or deleted, and `tags` refuses a
release commit whose frozen folder does not match `unreleased/` and the
Catalogue byte for byte. Then `npm run release -- tags`, and a person runs what
it prints; the `v` tag publishes under `latest`.

Merge the release PR with a merge commit or a rebase, never a squash that folds
it into other commits: the commit on `main` is the one tagged.

## What a released version binds

Everything under `conformance/<version>/` is history, and part of it binds
every later fieldkit (ADR-0019):

- **Its valid fixtures run in `npm run verify` for ever**, in both runners: a
  Spec a release accepted stays accepted. Its invalid ones are kept but bind
  nothing — a value once rejected may become valid, so a validation bug is
  fixed by loosening. The rule lives in `binds` in both runners
  (`src/schema/__tests__/conformance.test.ts`, `go/conformance_test.go`); a new
  operation adds what "valid" means for it there.
- **Its Catalogue is the baseline** `npm run catalogue:compat` (part of
  `npm run verify`) compares the current one with. It passes an addition — a
  type, an optional setting, an enum value, a Position, a Pin, a loosened bound
  — and fails a removal, a rename (a removal plus an addition), a narrowed
  enum, a newly required key, a changed type, a tightened bound, and any change
  to a keyword it cannot judge. Consumers are not compared: they only filter
  type pickers (ADR-0022). Before the first release there is no baseline, and
  the check passes saying so.

  The Catalogue is judged **whole**: the core section and each opt-in
  package's (the publishing package's, ADR-0002 amended) are one data contract
  with one version, so a type added to any section moves `CATALOGUE_VERSION`.
  Each section also keeps its types: a type moving to another section fails,
  as it would vanish for the Consumers of the one it left. A section a release
  had not got yet is empty in its baseline.

## The Catalogue version

`CATALOGUE_VERSION` in `src/schema/catalogue-version.ts` is set by hand, and is not
`package.json`'s version: it names **one Catalogue**, and moves only with the
release that first ships a change to it (a Resolved Spec records it,
ADR-0019). The checks hold it to that:

- `npm run catalogue:compat` fails a Catalogue that changed since the last
  release but kept its version, one that moved without changing, a version that
  moves back, and a new type whose `since` is not the new version. So the first
  change after a release bumps `CATALOGUE_VERSION` to the next release.
- `npm run release -- prepare` fails when the Catalogue would ship under a
  version other than this release's (when it changed) or the last release's
  (when it did not), and when it names a version newer than the release.
