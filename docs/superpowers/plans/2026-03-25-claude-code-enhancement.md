# Claude Code Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance fieldkit for effective Claude Code AI-assisted development with operational docs, quality gates, CI, and reference docs.

**Architecture:** Mirror the proven `.claude/` setup from the `@knkcs/anker` sibling repo, then add fieldkit-specific CLAUDE.md content (commands, patterns, reference doc pointers). Add a CI workflow for test gating. Reference docs are already created.

**Tech Stack:** Claude Code hooks, Biome, GitHub Actions, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-claude-code-enhancement-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `.claude/settings.json` | Shared permissions whitelist + PostToolUse auto-format hook + PreToolUse pre-commit gate |
| Create | `.claude/hooks/pre-commit-gate.sh` | Blocks `git commit` if typecheck or lint fails |
| Modify | `CLAUDE.md` | Add Commands, Patterns, and Reference Docs sections |
| Create | `.github/workflows/ci.yml` | Lint + typecheck + build + test on push/PR |
| Already exist | `docs/anker-reference.md`, `docs/knkeditor-reference.md`, `docs/dnd-kit-reference.md`, `docs/react-hook-form-reference.md` | Library API reference for Claude Code |

---

### Task 1: Create Pre-Commit Gate Script

**Files:**
- Create: `.claude/hooks/pre-commit-gate.sh`

- [ ] **Step 1: Create the hooks directory and script**

```bash
#!/bin/bash
# Pre-commit quality gate for Claude Code.
# Runs typecheck and lint before any `git commit` command.
# Exit 2 blocks the commit; stderr is shown to Claude as feedback.

command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed. Install with: brew install jq" >&2; exit 0; }

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Only gate git commit commands
if echo "$COMMAND" | grep -qE '^git commit'; then
  echo "Running typecheck..." >&2
  npm run typecheck >&2 || {
    echo "Typecheck failed — commit blocked" >&2
    exit 2
  }

  echo "Running lint..." >&2
  npm run lint >&2 || {
    echo "Lint failed — commit blocked" >&2
    exit 2
  }
fi

exit 0
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x .claude/hooks/pre-commit-gate.sh`

- [ ] **Step 3: Verify the script is executable**

Run: `ls -la .claude/hooks/pre-commit-gate.sh`
Expected: `-rwxr-xr-x` permissions

---

### Task 2: Create `.claude/settings.json`

**Files:**
- Create: `.claude/settings.json`

**Depends on:** Task 1 (the hook script must exist for the PreToolUse hook reference)

- [ ] **Step 1: Create settings.json**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run lint:write)",
      "Bash(npm run typecheck)",
      "Bash(npm run build)",
      "Bash(npm run test)",
      "Bash(npm run test:watch)",
      "Bash(npx biome check *)",
      "Bash(npx biome check --write *)"
    ]
  },
  "attribution": {
    "commit": ""
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r \".tool_input.file_path\"); [[ \"$FILE\" =~ \\.(ts|tsx)$ ]] && npx biome check --write \"$FILE\" || true'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-commit-gate.sh\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `cat .claude/settings.json | jq .`
Expected: Pretty-printed JSON with no errors

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json .claude/hooks/pre-commit-gate.sh
git commit -m "chore: add Claude Code settings and pre-commit quality gate

Mirror anker's .claude/ setup: permissions whitelist for npm scripts,
PostToolUse hook for auto-formatting with Biome, PreToolUse hook for
pre-commit typecheck + lint gate."
```

---

### Task 3: Update CLAUDE.md — Commands Section

**Files:**
- Modify: `CLAUDE.md` (insert after the Git Conventions section, before Peer Dependencies)

- [ ] **Step 1: Add Commands section after Git Conventions**

Insert after line 87 (end of Git Conventions section), before the `## Peer Dependencies` heading:

```markdown
## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Storybook on localhost:6007 |
| `npm run build` | Build ESM + type declarations to `/dist` (via tsup) |
| `npm run build:storybook` | Build static Storybook site |
| `npm run lint` | Check linting and formatting (Biome) |
| `npm run lint:write` | Auto-fix lint and format issues |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run tests once (Vitest, jsdom environment) |
| `npm run test:watch` | Run tests in watch mode |

Always run `npm run typecheck` and `npm run lint` before committing. Tests use Vitest with jsdom environment and `@testing-library/react`. Test files are colocated with source in `__tests__/` directories.
```

- [ ] **Step 2: Verify the section is correctly placed**

Read `CLAUDE.md` and confirm the Commands section appears between Git Conventions and Peer Dependencies.

---

### Task 4: Update CLAUDE.md — Patterns Section

**Files:**
- Modify: `CLAUDE.md` (insert after the Design Principles section, before Git Conventions)

- [ ] **Step 1: Add Patterns section after Design Principles**

Insert after line 74 (end of Design Principles section), before `## Git Conventions`:

```markdown
## Patterns

### Adding a New Field Type Plugin

1. Create `src/schema/field-types/<name>.ts`:
   - Export a `FieldTypePlugin` with `id`, `name`, `icon` (Lucide), `toZodType()`, `defaultConfig`
   - Define a `<Name>Settings` interface if the field has configurable settings
   - Add tests in `src/schema/field-types/__tests__/<name>.test.ts`
2. Register the plugin in `src/schema/field-types/index.ts`
3. Create renderer component: `src/renderer/fields/<name>-field.tsx`
   - Use anker form components for simple inputs (see `docs/anker-reference.md`)
   - Use `Controller` for complex values (see `docs/react-hook-form-reference.md`)
   - Set `displayName` on the exported component
   - Add Storybook story (`.stories.tsx`) and MDX documentation (`.mdx`)
4. Create table cell: `src/table/cells/<name>-cell.tsx`
   - Set `displayName` on the exported component
5. Register the cell in `src/table/get-cell-for-type.tsx`
6. Register the renderer in `src/renderer/field-component.tsx`

### Adding a Renderer Field Component

- Prefer delegating to `@knkcs/anker/forms` components for simple inputs (Pattern A in `docs/react-hook-form-reference.md`)
- For complex values, use `Controller` from react-hook-form (Pattern B)
- Destructure the Controller render prop as `{ field: formField }` to avoid shadowing fieldkit's `field` prop
- Never call `useForm()` — always use `useFormContext()`
- Pass `readOnly` from `FieldProps`, not `disabled` (anker applies different opacity for each)
- Set `displayName` on every exported React component

### Adapter Pattern

Backend-dependent features (reference lookup, media upload, blueprint data, textType data) are injected through the `FieldKitProvider` `adapters` prop. Never import from service codebases — use the adapter interfaces defined in `src/renderer/adapters.ts`.
```

- [ ] **Step 2: Verify the section is correctly placed**

Read `CLAUDE.md` and confirm the Patterns section appears between Design Principles and Git Conventions.

---

### Task 5: Update CLAUDE.md — Reference Docs Section

**Files:**
- Modify: `CLAUDE.md` (insert after the Related Repositories section, at the end of the file)

- [ ] **Step 1: Add Reference Docs section at the end of CLAUDE.md**

Append after line 107 (end of Related Repositories section):

```markdown
## Reference Docs

Read these before working on the corresponding area:

- **`docs/anker-reference.md`** — All anker form component APIs, DataTable, DrawerRoot, semantic tokens. Read before creating or modifying any field component or table component.
- **`docs/react-hook-form-reference.md`** — The four integration patterns (delegation, Controller, watch+setValue, useFieldArray), nested paths, Zod wiring. Read before creating or modifying any field component.
- **`docs/dnd-kit-reference.md`** — Sensor config, sortable pattern, drag handle conventions. Read before modifying SpecEditor or adding drag-and-drop.
- **`docs/knkeditor-reference.md`** — EditorSpec types, plugin ID alignment, planned integration contract. Read before modifying rich-text-spec or RichTextField.
```

- [ ] **Step 2: Verify the section is the last section in the file**

Read the end of `CLAUDE.md` and confirm Reference Docs is the final section.

- [ ] **Step 3: Commit all CLAUDE.md changes**

```bash
git add CLAUDE.md
git commit -m "docs: add Commands, Patterns, and Reference Docs sections to CLAUDE.md

Add operational commands table, field type plugin scaffolding checklist,
renderer component conventions, adapter pattern guide, and pointers to
the four library reference docs."
```

---

### Task 6: Create CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npm run test
```

- [ ] **Step 2: Verify YAML is valid**

Run: `cat .github/workflows/ci.yml`
Expected: Valid YAML with name, on, jobs sections

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow with lint, typecheck, build, and test

Run quality checks on push to main and pull requests. Mirrors the
anker CI pipeline: lint (Biome), typecheck (tsc), build (tsup),
test (Vitest)."
```

---

### Task 7: Commit Reference Docs

**Files:**
- Stage: `docs/anker-reference.md`, `docs/knkeditor-reference.md`, `docs/dnd-kit-reference.md`, `docs/react-hook-form-reference.md`

These files already exist (created during brainstorming). They need to be committed.

- [ ] **Step 1: Verify all four files exist**

Run: `ls -la docs/anker-reference.md docs/knkeditor-reference.md docs/dnd-kit-reference.md docs/react-hook-form-reference.md`
Expected: All four files listed

- [ ] **Step 2: Commit**

```bash
git add docs/anker-reference.md docs/knkeditor-reference.md docs/dnd-kit-reference.md docs/react-hook-form-reference.md
git commit -m "docs: add library reference docs for Claude Code

Add reference docs for @knkcs/anker (form components, DataTable, tokens),
@knkcms/knkeditor (EditorSpec, plugin IDs, integration contract),
dnd-kit (sortable pattern in SpecEditor), and react-hook-form (external
FormProvider pattern, four integration patterns, Zod wiring)."
```

---

### Task 8: Commit Design Spec and Plan

**Files:**
- Stage: `docs/superpowers/specs/2026-03-25-claude-code-enhancement-design.md`, `docs/superpowers/plans/2026-03-25-claude-code-enhancement.md`

- [ ] **Step 1: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-03-25-claude-code-enhancement-design.md docs/superpowers/plans/2026-03-25-claude-code-enhancement.md
git commit -m "docs: add Claude Code enhancement design spec and implementation plan"
```

---

### Task 9: Verify Everything Works

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors (we only added non-TS files)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (reference docs are outside `src/`)

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass (no code changes)

- [ ] **Step 4: Verify .claude/settings.json is valid**

Run: `cat .claude/settings.json | jq .`
Expected: Valid JSON, no parse errors

- [ ] **Step 5: Verify pre-commit gate script is executable**

Run: `test -x .claude/hooks/pre-commit-gate.sh && echo "OK" || echo "NOT EXECUTABLE"`
Expected: `OK`
