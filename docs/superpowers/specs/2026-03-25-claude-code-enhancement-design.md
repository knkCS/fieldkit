# Claude Code Enhancement Design

**Date:** 2026-03-25
**Status:** Approved
**Approach:** Anker Foundation + Fieldkit-Specific Additions (Approach B)

## Goal

Enhance the fieldkit repository for effective Claude Code AI-assisted development by adding operational documentation, automated quality gates, CI test gating, and library reference docs — modeled on the proven setup in the `@knkcs/anker` sibling repo.

## Problem

Claude Code working in fieldkit lacks:
- Operational commands (how to build, test, lint, typecheck)
- Automated guardrails (no hooks to auto-format or gate commits)
- CI test coverage (GitHub Actions only deploys Storybook, doesn't run tests)
- Library API knowledge (proprietary deps @knkcs/anker and @knkcms/knkeditor are unknown to Claude; RHF external FormProvider pattern and dnd-kit usage are fieldkit-specific)
- Pattern guides for common tasks (adding field types, renderer components, adapters)

## Design

### 1. `.claude/settings.json` — Shared Permissions + Hooks

New file (checked into git). Mirrors anker's structure:

**Permissions whitelist:**
- `npm run lint`, `npm run lint:write`, `npm run typecheck`, `npm run build`
- `npm run test`, `npm run test:watch`
- `npx biome check *`, `npx biome check --write *`

**PostToolUse hook (Edit|Write matcher):**
Auto-formats any edited `.ts`/`.tsx` file with Biome after every file write/edit. Ensures all Claude Code edits conform to project formatting without manual intervention.

**PreToolUse hook (Bash matcher):**
Runs `.claude/hooks/pre-commit-gate.sh` before any bash command. The gate script blocks `git commit` if `npm run typecheck` or `npm run lint` fails. Exit code 2 blocks the action; stderr feedback is shown to Claude.

**Attribution:** Empty commit attribution string (matches anker).

### 2. `.claude/hooks/pre-commit-gate.sh`

New file. Identical to anker's implementation:
- Parses the bash command from stdin JSON via `jq`
- Only activates for `git commit` commands
- Runs `npm run typecheck` then `npm run lint`
- Blocks commit (exit 2) on failure with descriptive error

### 3. CLAUDE.md Updates

Three new sections added to the existing CLAUDE.md:

**Commands section** (after Git Conventions):
Table of all npm scripts with purpose descriptions. Includes guidance to always run typecheck + lint before committing, and notes that tests use Vitest with jsdom + @testing-library/react.

**Patterns section** (after Design Principles):
- "Adding a New Field Type Plugin" — 6-step checklist covering schema plugin, renderer component, table cell, registration, stories, and tests
- "Adding a Renderer Field Component" — conventions for anker delegation, Controller usage, `formField` naming, `readOnly` vs `disabled`, `displayName`
- "Adapter Pattern" — reinforces that backend-dependent features use injected adapters

**Reference Docs section** (after Related Repositories):
Pointers to the four reference docs with guidance on when to read each one.

### 4. `.github/workflows/ci.yml`

New workflow mirroring anker's CI. Triggers on push to main and pull requests:
1. Checkout
2. Setup Node 22 with npm cache
3. `npm ci`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run build`
7. `npm run test`

Existing `storybook.yml` is unchanged.

### 5. Reference Docs (already created)

Four docs in `docs/`:

- **`anker-reference.md`** — Complete API for all 13 anker form components used by fieldkit (FormField, InputField, TextareaField, DatePickerField, NumberInputField, SwitchField, RadioGroupField, CheckboxField, SelectField, ColorPickerField, CodeField, MarkdownField, ArrayField), plus DataTable and DrawerRoot. Includes semantic token map, color scales, and key patterns (readOnly vs disabled, optional editor injection).

- **`knkeditor-reference.md`** — EditorSpec/EditorNodePlugin types, all 18 built-in plugins, ID alignment table (3 misaligned IDs identified: subscript/sub, superscript/super, horizontalRule/horizontalLine), planned integration contract, and required peer dependencies.

- **`dnd-kit-reference.md`** — Complete analysis of fieldkit's single-file dnd-kit usage in SpecEditor. Sensor configuration, SortableContext setup, useSortable pattern, onDragEnd handler, data flow diagram, and conventions for future dnd-kit additions.

- **`react-hook-form-reference.md`** — The four integration patterns (anker delegation, Controller, watch+setValue, useFieldArray), external FormProvider contract explanation, nested field path rewriting, Zod integration via specToZodSchema, and rules for new field components.

## What Does NOT Change

- `.claude/settings.local.json` — personal overrides untouched
- `.github/workflows/storybook.yml` — existing deployment untouched
- All source code — no code changes in this design
- Existing CLAUDE.md content — only additions, no removals

## Files Summary

| Action | File |
|---|---|
| Create | `.claude/settings.json` |
| Create | `.claude/hooks/pre-commit-gate.sh` |
| Update | `CLAUDE.md` |
| Create | `.github/workflows/ci.yml` |
| Created | `docs/anker-reference.md` |
| Created | `docs/knkeditor-reference.md` |
| Created | `docs/dnd-kit-reference.md` |
| Created | `docs/react-hook-form-reference.md` |
