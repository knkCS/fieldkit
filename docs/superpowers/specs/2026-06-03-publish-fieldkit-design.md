# Publish @knkcs/fieldkit — Design

Date: 2026-06-03

## Problem

`@knkcs/fieldkit` has never been published. `web` and `mediahub-ui` cannot flip
their dependency off a local/phantom reference because `npm view @knkcs/fieldkit`
returns 404 on both npmjs and GitHub Packages.

Investigation showed the publish infrastructure is already complete and correct:

- `.github/workflows/publish-fieldkit.yml` triggers on `v*` tags, enforces
  `tag == package.json version`, runs lint → typecheck → build → verify-exports →
  test, then publishes to npmjs (`--provenance --access public`) and GitHub
  Packages (both `--ignore-scripts`, reusing the validated `dist/`).
- `NPM_TOKEN` secret is present in the repo (added 2026-06-03).
- `package.json` version is `0.0.1`.

The publish never fired because the only tag is `fieldkit-v0.0.1`, which does not
match the `v*` glob — and it points at `7d0f3fe`, a commit that predates the
publish workflow itself.

## Decision

Publish via the existing tag-driven CI (not a manual local `npm publish`). This
runs the full gate, gets provenance, and hits both registries.

- **Version:** keep `0.0.1` (it was never published, so the number is free).
- **Stale tag:** leave `fieldkit-v0.0.1` in place — it doesn't match `v*`, so it
  never fires.

## Steps

1. Ensure local `main` HEAD is pushed to `origin/main` (tagged commit + workflow
   must exist on the remote).
2. Create annotated tag `v0.0.1` at HEAD and push it.
3. The workflow runs and publishes on green.

## Verification

- `gh run watch` the publish workflow to success.
- `npm view @knkcs/fieldkit version` returns `0.0.1`.

## Downstream (separate follow-up)

Flip `web` + `mediahub-ui` deps to `^0.0.1`; run their install + typecheck + build.

## Notes

- npm publishes are effectively permanent — `0.0.1` cannot be reused once
  published. The CI gate is the safety net: if it fails, nothing is published and
  we fix forward.
- Publishing to a public registry is irreversible and outward-facing; explicit
  go-ahead required before pushing the tag.
