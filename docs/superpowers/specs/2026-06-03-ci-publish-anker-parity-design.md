# Design: Bring fieldkit CI/publish to anker parity

**Date:** 2026-06-03
**Status:** Approved
**Scope:** GitHub Actions CI + publish pipeline for `@knkcs/fieldkit`

## Problem

Fieldkit already has three workflows (`ci.yml`, `publish-fieldkit.yml`, `storybook.yml`),
but they lag the standard set by the sibling `@knkcs/anker` repo. The gaps:

1. CI does not run an export-surface check (`verify-exports`). Anker added this after
   shipping a broken tarball (`@knkcs/anker@1.10.0`) where symbols were exported in
   source but absent from the published `.d.ts` — all CI was green.
2. The publish workflow skips `lint` and `typecheck`, and does not use npm provenance.
3. Publish targets npmjs.org only. Anker publishes to both npmjs.org (with provenance)
   and GitHub Packages.
4. Fieldkit uses a `fieldkit-v*` tag scheme; anker uses `v*`.

## Goal

Bring fieldkit's CI and publish pipeline to parity with anker, keeping the fieldkit-only
improvements that are genuinely better (the version-matches-tag guard).

## Decisions

| Decision | Choice |
|----------|--------|
| Overall goal | Bring fieldkit workflows to anker parity, closing the gaps |
| Publish registries | Both — npmjs.org (with `--provenance`) **and** GitHub Packages |
| `verify-exports` | Port anker's `scripts/verify-exports.ts` and run it in CI + publish |
| Release tag scheme | Switch from `fieldkit-v*` to `v*` (anker parity) |
| Version-matches-tag check | Keep (fieldkit improvement over anker), adapt to strip `v` prefix |
| `storybook.yml` | No change — already byte-identical to anker |

## Components

### 1. `scripts/verify-exports.ts` (new — ported from anker)

Port anker's script verbatim. It is repo-agnostic:

- Parses `tsup.config.ts` to read the `entry: { ... }` map. Fieldkit's config has the
  identical shape (`"schema/index": "src/schema/index.ts"`, etc.).
- For each entry source file, walks the AST collecting the transitive closure of named
  exports (handles `export *`, named re-exports, renames, type-only exports, the
  barrel-vs-leaf heuristic, and circular-re-export guards).
- Parses the built `dist/<entry>.d.ts` and extracts declared exports.
- Reports any source-side export missing from the dist-side `.d.ts`, with a provenance
  trail showing which sub-barrel surfaced the symbol.
- Ships with a `--self-test` mode (synthetic fixtures exercising each rule).

For fieldkit, the script resolves entries like `dist/schema/index.d.ts` from
`entry["schema/index"]` — confirmed to match tsup's `dts: true` output layout.

### 2. `package.json` changes

- Add `tsx` to `devDependencies` (anker uses `tsx scripts/verify-exports.ts`; fieldkit
  does not currently depend on `tsx`).
- Add script: `"verify-exports": "tsx scripts/verify-exports.ts"`.
- Leave existing `"prepublishOnly": "npm run build"` in place — it causes one redundant
  rebuild on `npm publish` (on top of the explicit CI `build` step) but is harmless and
  provides a local-publish safety net.

### 3. `.github/workflows/ci.yml`

Add `npm run verify-exports` after `build`, before `test`. Final step order:

```
npm ci → npm run lint → npm run typecheck → npm run build → npm run verify-exports → npm run test
```

### 4. `.github/workflows/publish-fieldkit.yml` (reworked)

- **Trigger:** `on.push.tags: ["v*"]` (was `fieldkit-v*`).
- **Permissions:** `contents: read`, `id-token: write`, `packages: write`.
- **Steps:**
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version: 22`, `registry-url: https://registry.npmjs.org`,
     `cache: npm`
  3. `npm ci`
  4. Verify version matches tag — adapted to strip `v` prefix:
     ```sh
     PKG_VERSION=$(node -p "require('./package.json').version")
     TAG_VERSION="${GITHUB_REF_NAME#v}"
     if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
       echo "package.json version ($PKG_VERSION) does not match tag ($TAG_VERSION)"
       exit 1
     fi
     ```
  5. `npm run lint`
  6. `npm run typecheck`
  7. `npm run build`
  8. `npm run verify-exports`
  9. `npm run test`
  10. Publish to npmjs.org:
      `npm publish --provenance --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
  11. Re-`actions/setup-node@v4` with `registry-url: https://npm.pkg.github.com`,
      `scope: "@knkcs"`.
  12. Publish to GitHub Packages: `npm publish` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Filename stays `publish-fieldkit.yml` (descriptive; avoids churn). The dist built in
step 7 persists across the second `setup-node`, so both publishes ship the same artifact.

### 5. `.github/workflows/storybook.yml`

No change.

## Out-of-band prerequisites (operator, not code)

- Repo secret **`NPM_TOKEN`** must exist (already referenced by the current workflow).
- GitHub Packages uses the auto-provided `GITHUB_TOKEN` — no secret needed.
- npmjs provenance requires the package to be public and the workflow to run from this
  repo with `id-token: write` (set) on a GitHub-hosted runner.

## Verification plan

- `npm install` (pulls in `tsx`), then `npm run build && npm run verify-exports` — confirm
  it passes against current dist.
- `npm run verify-exports -- --self-test` — confirm the ported script's own tests pass.
- `npm run typecheck` and `npm run lint` — confirm the new script/devDep don't break the build.
- Publish workflow cannot be fully exercised without pushing a `v*` tag; validate the YAML
  and the bash version-check logic by inspection.

## Addendum (2026-06-03): rich-text-spec export-surface fix

Porting `verify-exports` immediately surfaced a real finding: the `rich-text-spec`
entry (`src/rich-text-spec/index.ts`) intentionally exposes only three aggregate
collections (`builtInEditorPlugins`, `builtInMarkPlugins`, `builtInNodePlugins`), but
imports them from `node-plugins/index.ts` — a **barrel** that also re-exports 20 individual
plugins (`paragraphPlugin`, `boldPlugin`, `imagePlugin`, `builtInCoreNodePlugins`, …).
The script's barrel-widening heuristic (a barrel is assumed to be a 1:1 mirror of its
public API) therefore expects those 20 in the built `.d.ts`, where they are absent.

**Decision:** Keep the individual plugins **internal** — only the 3 aggregates are public.
Resolve by **narrowing the barrel to mirror the public API** (Approach A), which keeps
`verify-exports.ts` unmodified (preserving it as a shared oracle with anker) and changes
nothing for published consumers (the individuals were never in the published `.d.ts`):

- `src/rich-text-spec/node-plugins/index.ts` re-exports only the 3 public aggregates;
  individual plugins remain exported from their leaf files (`core-nodes.ts`, `marks.ts`,
  `media-nodes.ts`) for internal use.
- `src/rich-text-spec/__tests__/node-plugins.test.ts` imports individual/sub-aggregate
  plugins directly from the leaf files instead of the barrel.
- `editor-spec-editor.stories.tsx` is unaffected (it imports only aggregates).

This is implemented as Task 1b in the plan, sequenced before the CI wiring (Task 2) so CI
stays green.

## Out of scope

- Bumping the package version or actually cutting a release.
- Changing `storybook.yml`.
- Adding fieldkit's own `check-chakra-imports`-style lint (anker-specific; not applicable).
