# knkCMS core's Reference Tree: insertion and drop rules, against fieldkit's

Where a new Reference may be inserted in knkCMS core, which drag-and-drop moves core permits or refuses beyond depth limits, and what each of those rules would cost fieldkit to adopt.

A research note, not a maintained doc. The maintained comparison is [knkCMS core parity](./knkcms-core-parity.md), which this deliberately does not edit and does not duplicate: parity tabulates *settings and value shapes* per field type, this reads the *interaction rules* of one of them.

> **Superseded in part, 2026-08-05.** This note was written *before* the work it informed. Tickets #97–#102 have since landed, so several "fieldkit does not have this" readings below are now false — most of §2's closing paragraph, and items 1, 3 and 4 of §7's portability list. Each is marked inline. The note is kept as the record of what core did and what was decided from it, not as a current statement of fieldkit's behaviour; for that, read `src/renderer/fields/reference-field.mdx`. A second reading of core's drag feedback on 2026-08-05 added §5.9.

**Read on 2026-08-04**, from source only, against:

| | |
|---|---|
| knkCMS core | `/opt/workspace/knkcms/core` at `f292262b7`, `web/src/components/field-types/field-type-reference/` |
| fieldkit | `main` at `fe2613a` (v0.14.x), `src/schema/reference-tree.ts` + `src/renderer/fields/reference-tree.tsx` |

**There are no tests under core's `field-type-reference/`.** Confirmed by enumeration: the directory tree holds 37 files, none of them a `.test.*`, `.spec.*` or `.stories.*`, and the only fixture is `test-data.json` — 8 flat entries with `ancestorIds` (camelCase, which no runtime code reads; the runtime type spells it `ancestor_ids`, `types.ts:10`), imported by nothing. So every rule below is read off behaviour in the source, and none of it is pinned by an assertion anywhere in core. That matters for two reasons: nothing tells a core maintainer which of these behaviours are intended, and several of them (§5) look accidental.

Core's structural sibling `manipulation_tree` — which *does* have tests — is compared in §6, because it independently re-derived several of the same rules and disagrees with the reference field on two of them.

---

## 1. The two value shapes, and why some rules cannot cross

This is the constraint behind most of §4, so it comes first.

| | core | fieldkit |
|---|---|---|
| persisted | flat `ContentReferenceFlat[]` | nested `Reference[]` |
| shape | `{ id?, ancestor_ids?, parent_id?, index?, attributes?, release?, version?, display_name? }` (`web/src/api/model/modelContentReferenceFlat.ts:9-18`) | `{ id, pin?, attributes?, children? }` (ADR-0008) |
| what the front end actually writes | `{ id, version?, attributes?, ancestor_ids?, display_name? }` — `parent_id` and `index` never appear in the editor's own type (`types.ts:1-12`) | the whole value |
| nesting expressed by | a root-first array of ancestor ids on every row | containment |
| ordering expressed by | array position (and a backend-derived `index`) | array position within `children` |

Two consequences run through everything below.

**An orphan is representable in core and not in fieldkit.** Core rows carry ancestor ids as strings, so a row can name an ancestor that is not in the array — which is exactly what several of core's insertion helpers produce as an intermediate state, and what `replaceAncestor` (`utils.ts:133-154`) exists to clean up. Fieldkit has nothing to clean up because the state is unreachable.

**Core can put a row in the tree before it is a Reference to anything.** `onInsertPlaceholder` writes `{ id: crypto.randomUUID(), version: null, ancestor_ids: [] }` straight into the form value (`hooks/use-reference-field.ts:432-436`, `setValue` at `:455`). It is a real entry in the persisted array from the moment the Author clicks, and it renders as a blue "New reference" row (`related-item.tsx:254-261`). This is the mechanism behind core's whole insert-between-items flow, and it is the single largest thing that does not transfer (§4.3).

---

## 2. (a) Where a newly added item may be inserted

Core's answer: **anywhere between two existing rows, at any depth those two rows allow — but never above the first row**, and the position is chosen by hovering a strip and moving the pointer sideways.

### The affordance

`AddReferenceItem` is a 4px-high strip that grows to 40px on hover (`add-reference-item.tsx:118-129`). One is rendered *after* every visible row (`reference-field.tsx:375-459`: `RelatedItem` at `:419`, then `AddReferenceItem` at `:440`). There is no strip before the first row, and `handleClick` computes `insertPos = index + 1` (`add-reference-item.tsx:76-79`), so **position 0 is unreachable through the affordance**. The only entry point for an empty field is `EmptyReferencesPanel` (`reference-field.tsx:490`), which appends at index 0 by a different path.

### The rules

| # | Rule | Mechanism | What it prevents |
|---|---|---|---|
| **INS‑1** | A strip sits after every visible row; none before the first | `reference-field.tsx:375-459`; `insertPos = index + 1` (`add-reference-item.tsx:76-79`) | — (see §5.4: this reads as a gap) |
| **INS‑2** | Depth is the pointer's horizontal position over the strip, in 32px steps | `Math.floor(mouseX / 32)` (`add-reference-item.tsx:56`), `mouseX` tracked on the strip (`:43-48`) | — |
| **INS‑3** | That depth is clamped to `[nextDepth − 1, prevCollapsed ? prevDepth : prevDepth + 1]`, and separately to `max_depth − 1` | `:68-73` set the bounds, `:57-63` apply them | Skipping a level below; silently adopting the row beneath; breaking `max_depth` |
| **INS‑4** | The strip names what it would create — "+ Add root item" / "+ Add child of X" / "+ Add sibling of X" | `getLabel()` (`add-reference-item.tsx:82-114`) over `buildRefDepthLabelMap` (`reference-field.tsx:310-339`) | An Author guessing what a pixel offset means |
| **INS‑5** | At `max_items` the strip turns red, loses its cursor and its click handler | `disabled` prop (`reference-field.tsx:447-450`), applied at `add-reference-item.tsx:127-128, 137, 150`, with a "Maximum number of references set" label (`:84-88`) | Exceeding the cap |
| **INS‑6** | Strips are replaced by 10px spacers while a drag is running | `reference-field.tsx:437-439` | Two competing insertion affordances at once |
| **INS‑7** | Clicking writes a placeholder *into the form value* and opens the browse drawer | `onInsertPlaceholder` (`hooks/use-reference-field.ts:426-456`); drawer opened by effect on `currentPlaceholder` (`reference-field.tsx:276-280`) | — (this is the mechanism, §4.3) |
| **INS‑8** | The placeholder adopts the trailing descendants of the nearest preceding row at its own depth | `updateNewChildren` (`utils.ts:163-207`), called at `hooks/use-reference-field.ts:450` | — (this is an artefact, §4.3 and §5) |
| **INS‑9** | A placeholder that adopted children accepts exactly **one** Content; several are inserted as siblings and the *last* one keeps the adopted children | `hasChildren` passed at `reference-field.tsx:500-502`; save disabled at `currentSelected > 1` (`reference-drawer.tsx:264-267`); footer counts `1 − currentSelected` (`:227-231`); `replaceAncestor(newRefs[last].id, placeholder.id, …)` (`hooks/use-reference-field.ts:289-295`) | An ambiguous re-parent when INS‑8 has already moved children onto the placeholder |
| **INS‑10** | Contents already in the tree are excluded from the browse and filtered from the result | `exclude_ids` (`reference-drawer.tsx:135`); `oldIds` filter (`hooks/use-reference-field.ts:262-265`) | Duplicate rows for one Content |
| **INS‑11** | Cancelling the drawer restores the list as it was before the insert | `onReset` → `handleResetItems` (`hooks/use-reference-field.ts:99-103`) against `previousItems` snapshotted at `:430` | A dangling placeholder |
| **INS‑12** | The browse is a table of **blueprint / status / assigned-to**, filterable and sortable on those | `reference-drawer.tsx:43-97` (columns), `:114-118` (filters), `:132-147` (query) | — |
| **INS‑13** | The drawer's second path mints a *new* Content: choose blueprint → choose release (or latest) → name it → fill its fields | `reference-content-create-drawer.tsx`, `step-select-blueprint.tsx`, `step-select-blueprint-release.tsx`, `step-configure-content.tsx`, `step-edit-content.tsx`; entry at `reference-drawer.tsx:269-284` | — |

### The resulting value

On confirm, `handleSetReferences` (`hooks/use-reference-field.ts:247-300`):

1. builds `{ id, ancestor_ids: placeholder.ancestor_ids ?? [] }` for each newly selected Content (`:264-271`) — **all at the placeholder's depth, as siblings**;
2. splices them at the placeholder's index (`:273-281`);
3. removes the placeholder (`:283-287`);
4. re-points anything that named the placeholder as an ancestor to the last new ref (`:289-295`).

So for a tree `A / A1 / A2 / B` (`A` a root with two children), inserting at the strip below `A` at depth 0 and choosing one Content `X` yields:

```
[ {id:A, ancestor_ids:[]}, {id:X, ancestor_ids:[]},
  {id:A1, ancestor_ids:[X]}, {id:A2, ancestor_ids:[X]}, {id:B, ancestor_ids:[]} ]
```

`A1` and `A2` have moved from `A` to `X`. That is INS‑8 firing on a *sibling* insert, and it is discussed in §5.1 — the label on the strip said "+ Add sibling of …", and it re-parented two rows.

Note also what the front end never writes: no `index`, no `parent_id`, and — on this path — no `version` either. `ModelContentListItem` (the browse result type) carries no version field at all (`web/src/api/model/modelContentListItem.ts:13-29`), so the multi-reference add flow cannot pin. Only the single-reference path writes `version` (`reference-field.tsx:140-144`), from a value it casts rather than one the browse supplied.

### fieldkit, on the same question

Fieldkit **always appends at the root**, recorded as a known limitation at `src/renderer/fields/reference-field.mdx:230` ("The drawer always adds at the root; a new Reference is nested by dragging it"). Verified in source: `handleAdd` is `formField.onChange([...entries, withPin(null, content.id, pin)])` (`src/renderer/fields/reference-field.tsx:170`) — one append to the top-level array, no position and no depth. There is one Add button, below the tree, disabled at the cap (`:213-225`, `atCap` at `:126`).

So of the thirteen rules above, fieldkit has: INS‑5 (as a button rather than a strip), INS‑11 vacuously (nothing is written until a Content is chosen — see §4.3), and part of INS‑10 (the picker does not exclude what is already referenced; core does). It has none of INS‑1 through INS‑4, which is the whole of the "insert between items at a chosen depth" story.

> **No longer true as of 2026-08-05.** #99 and #100 built INS‑1 through INS‑4 — a strip in every gap *including before the first row*, pointer-x depth, a naming label, and keyboard operation core has no equivalent for. #98 built INS‑10, through an optional `excludeIds` on the search query. #102 added the drawer chrome. The paragraph above describes the state this note was written in.

---

## 3. (b) Which drag-and-drop moves the tree permits or refuses

| # | Rule | Mechanism | How the refusal is expressed | What it prevents |
|---|---|---|---|---|
| **DND‑1** | Read-only trees do not drag at all | `sensors = undefined` (`hooks/use-reference-field.ts:74`); every handler early-returns (`:76-77, 84-85, 89-90, 105-109`); `getProjection` returns `null` (`:338`); grip not rendered (`related-item.tsx:245`) | Affordance absent | — |
| **DND‑2** | A target equal to the dragged row is discarded, and a drag with no recorded target is a no-op | `handleDragOver` records a target only if `String(targetId) !== activeId` (`hooks/use-reference-field.ts:89-97`); `handleDragEnd` bails on a falsy `state.overId` (`:120-122`) | Drop silently dropped | Nothing useful — see §5.5 |
| **DND‑3** | The dragged Reference's descendants are removed from the DOM for the duration of the drag | `if (isChild) return null` (`reference-field.tsx:397-401`) | Affordance removed — the rows are not rendered, so not droppable | A Reference being dropped inside its own branch (a cycle) |
| **DND‑4** | An index that does not resolve refuses the drop | `hooks/use-reference-field.ts:129-131` (drop), `:342-344, 346-349` (projection → `null` → drop bails at `:120`) | Drop rejected, value untouched | Acting on a stale id |
| **DND‑5** | A **collapsed** target stands in for its whole branch: the drop lands *after* the last descendant | `hooks/use-reference-field.ts:133-146` — `newIndex` jumps to the last child's index | Position clamped | Landing invisibly inside a folded branch |
| **DND‑6** | A drop may go at most one level deeper than the row above it — and if that row is **collapsed**, not deeper at all | `structuralMaxDepth = previousItem && !isPrevCollapsed ? prevDepth + 1 : prevDepth` (`hooks/use-reference-field.ts:377-378`) | Depth clamped | Skipping a level; entering a folded branch |
| **DND‑7** | `max_depth` caps the drop, **less the height of the dragged branch** | `Math.min(structuralMaxDepth, maxDepthSetting - 1 - relativeSubtreeHeight)` (`:381-386`), with `relativeSubtreeHeight` from `getItemDepth` (`:369-374`, `utils.ts:58-66`) | Depth clamped | A parent being dropped where its own children would break the cap |
| **DND‑8** | A floor from the row below: `max(0, isParent ? nextDepth : nextDepth − 1)` | `hooks/use-reference-field.ts:388`, with `nextItem` found by skipping the dragged item's own descendants (`:357-364`) | Depth clamped | Silently adopting the following row and its branch |
| **DND‑9** | An out-of-bounds depth is **clamped, never refused**, and the clamped depth is what the dragged row draws at mid-drag | `:389-395`; live indent via `useRelatedItem` (`hooks/use-related-item.ts:9-14`) → `paddingLeft` (`related-item.tsx:196`) | Position clamped, with live feedback | A drag that looks legal and lands somewhere else |
| **DND‑10** | Cancelling a drag restores nothing | `handleDragCancel` (`hooks/use-reference-field.ts:239-245`) dispatches `RESET_ITEMS`, which the reducer implements as `return { ...state }` (`state/reducer/reducer.ts:37-38`) | — | Nothing — see §5.6 |

Two things core notably does **not** check on drop: `max_items` (a drag never adds a row, so there is nothing to cap) and anything about the *Content* being dragged — no blueprint kind, no status, no release. Core's drop rules are purely structural. That is the single most portable fact in this document.

### fieldkit, rule by rule

| core rule | fieldkit | where |
|---|---|---|
| DND‑1 | **Has it.** No grip rendered read-only; the tree still collapses, because reading a folded branch is reading | `reference-tree.tsx:491-501`; test "offers no grip at all in read-only mode" |
| DND‑2 | **Deliberately opposite.** Hovering your own row is a legal drag: `overIndex` falls back to `activeIndex` (`reference-tree.tsx:163-164`), `dropSlot` resolves it to the row's own slot (`reference-tree.ts:203-211`), and the pointer's `offsetX` still asks for a depth. So a Reference can be re-indented **in place** — which core cannot do at all | `reference-tree.tsx:161-180`; keyboard test "nests a Reference under the one above it" |
| DND‑3 | **Has it, by model rather than by DOM.** Descendants stay rendered and droppable; the branch is pruned from the neighbour list before the projection reads it (`reference-tree.ts:248-250`), and `dropSlot` maps a hover inside the branch back to the branch's own slot (`:203-211`) — a no-op | test "never offers a Reference a place inside its own branch" |
| DND‑4 | **Has it.** `resolveDrop` returns `null` on an unresolved active key (`reference-tree.tsx:158-159`); `projectDropDepth` answers root-only (`reference-tree.ts:241-243`); `moveReferenceBranch` hands the list back unchanged (`:315-317`) | |
| DND‑5 | **Has it, identically.** `overIndex` jumps to `referenceBranchEnd` for a collapsed target below the dragged row (`reference-tree.tsx:165-167`) | |
| DND‑6 | **Has the first half, refuses the second.** `maxDepth = min(above.depth + 1, capped)` (`reference-tree.ts:263`) is the same one-level rule. But the projection reads the **visible** rows only (`reference-tree.tsx:172-179`), so a folded Reference *is* offerable as a parent: the drop lands at the end of its branch and whatever it landed inside is then unfolded (`:378-381`). Core refuses; fieldkit permits and reveals | test "cannot reach a depth inside a folded branch" — which asserts the *deeper* level is refused, not the child level |
| DND‑7 | **Has it, and more soundly.** `capped = max(0, depthCeiling − active.height)` (`reference-tree.ts:259-262`), `height` measured at flatten time from the tree itself (`:81-89`) rather than from what happens to be on screen — see §5.2 | tests "spends the ceiling on the dragged branch's own height first", "keeps a branch taller than the ceiling at the root rather than below it" |
| DND‑8 | **Has it, differently.** `minDepth = min(below.depth, maxDepth)` (`reference-tree.ts:264`): the floor is the row below's own depth, with no `isParent` special case, and it is explicitly capped by `maxDepth` so the two bounds can never invert — see §5.3 | test "wins against the floor the neighbours set, rather than reporting a bound it broke" |
| DND‑9 | **Has it.** `Math.min(Math.max(asked, minDepth), maxDepth)` (`reference-tree.ts:267`); the dragged row draws at the projected depth from the same resolution the release uses (`reference-tree.tsx:406-411`) | |
| DND‑10 | **Has a real cancel.** `handleDragCancel` clears the transient state and nothing was written mid-drag anyway (`reference-tree.tsx:353-356`) | |

And three fieldkit rules with no core counterpart:

- **Keyboard dragging.** A `KeyboardSensor` with a custom coordinate getter maps ←/→ to one indent level each (`reference-tree.tsx:218-224, 295-298`). Core registers `PointerSensor` only (`hooks/use-reference-field.ts:74`), so nesting is unreachable without a pointer.
- **A settled drag writes nothing.** If the move produces the same keys at the same depths, the value is left alone rather than rewritten, so a nudge does not dirty the form (`reference-tree.tsx:366-372`).
- **Folding survives a move.** `carryCollapsed` re-keys the folded set across the reshape (`reference-tree.tsx:92-103, 377`), so an Author's first drag does not spring the tree open. Core re-derives `collapsedIds` only at mount (`hooks/use-reference-field.ts:52, 63`) and never reconciles it after a move; because core keys by Content id rather than by position, a move happens not to break it — but a *removal* of a parent leaves its id in the set forever (`onRemoveItem`, `:302-314`, never touches `collapsedIds`).

---

## 4. Classification

Twenty-three core rules, one bucket each.

### 4.1 Portable — generic tree behaviour, no knkCMS vocabulary (16)

**INS‑1, INS‑2, INS‑3, INS‑4, INS‑5, INS‑6, INS‑10, INS‑11, DND‑1, DND‑3, DND‑4, DND‑5, DND‑6, DND‑7, DND‑8, DND‑9.**

Every one of these is stated in terms of rows, depths and neighbours. Fieldkit already has DND‑1, DND‑3 through DND‑5 and DND‑7 through DND‑9, differs on DND‑6, and has none of INS‑1 through INS‑4.

The four worth porting, in order of what they buy:

1. ~~**INS‑1 + INS‑2 + INS‑3 + INS‑4 as a set**~~ — **done (#99, #100).** Insert between rows, at a pointer-chosen depth, with a label that names the result. The prediction held: fieldkit already owned every piece of arithmetic, and the affordance was the work, not the model. It went further than core on two counts — a strip before the first row, so position 0 is reachable, and full keyboard operation.
2. **DND‑6's collapsed clause** — the one place fieldkit is *more* permissive than core, and the divergence is a real design choice rather than an oversight on either side. Core says a folded branch is closed to drops; fieldkit says it is open and unfolds it on arrival. **Decided 2026-08-04: fieldkit's reading stands, for drags and for inserts alike.**
3. ~~**INS‑10's exclusion**~~ — **done (#98)**, through an optional `excludeIds` on the search query rather than a setting, with a client-side filter as a backstop. Duplicates remain *representable* in the value; the picker simply stops proposing them.
4. ~~**INS‑6**~~ — **done (#99).** Strips become inert spacers during a drag. As of the [2026-08-05 tree drag-feedback design](./superpowers/specs/2026-08-05-tree-drag-feedback-design.md) that reserved slot earns a second job: the landing one draws the drop indicator.

### 4.2 Domain-coupled — cannot be ported as-is under ADR-0002 (2)

**INS‑12** (browse by blueprint / status / assigned-to) and **INS‑13** (create-and-link a new Content through blueprint → release → configure → edit).

Both are pure knkCMS vocabulary. Content status, assignee, blueprint releases and the four-step Content-creation flow are publication machinery, and `ReferenceDrawer` reaches straight into `@root/modules/knk-content/components/filters/…` for three column filters (`reference-drawer.tsx:20-22`).

Fieldkit already answered INS‑12: **ADR-0009** pushed exactly this into the Adapter, which describes its own filters and result columns as Specs (`reference-picker-drawer.tsx:157-165, 351-381`). Nothing to port — the mechanism is there and the vocabulary stays out.

INS‑13 has no fieldkit analogue and should not get one. Minting a Content is not a form-field concern. If a Consumer wants it, the shape is an Adapter capability plus a Consumer-supplied step, not a fieldkit flow. Note that INS‑13 is also what makes core's placeholder-first design (INS‑7) *coherent* on core's side: a row can exist before it points at anything because the Content it will point at may not exist yet either.

Two settings are domain-coupled for the same reason, and are already recorded in parity §B2 rather than here: `children` ("a children reference will be traversed for a title configuration", `reference-field-configuration.tsx:88-91`) is publication-structure vocabulary, and `always_latest` is release semantics, superseded by `pin_mode`.

### 4.3 Not transferable — the value shapes forbid it (3)

**INS‑7, INS‑8, INS‑9.**

**INS‑7 — the placeholder as a value entry.** Core splices `{ id: <uuid>, version: null, ancestor_ids: [] }` into the persisted array and calls `setValue` on it before the Author has chosen anything (`hooks/use-reference-field.ts:432-455`). That works because a core row is an id in a flat array and nothing validates that the id resolves. In fieldkit the value is a nested `Reference[]` behind a recursive Zod schema (`src/schema/field-types/reference.ts:234-275`), the row's *name* is resolved through the Adapter (`reference-field.tsx:115-118`), and `max_items` counts the flattened tree (`reference-tree.ts:459-461`) — so a placeholder would count against the cap, fail to resolve a name, and persist as a dangling Reference if the form were saved mid-flow. Fieldkit's picker settles on a Content first and writes once (`reference-field.tsx:163-171`). The *outcome* INS‑7 exists to produce (insert at a chosen position and depth) is portable; the mechanism is not.

**INS‑8 — child adoption via ancestor-id surgery.** `updateNewChildren` scans backwards from the insert position for the nearest row at the new item's depth, then rewrites that row's id to the new item's id in every descendant's `ancestor_ids` at or past the insert position (`utils.ts:163-207`). This is only expressible because parentage is a string in a flat list. The equivalent in a nested tree would be an explicit "move these children onto that node", which is a different operation with a different UI meaning — and, as §5.1 argues, one nobody would write on purpose.

**INS‑9 — the one-selection rule.** It exists solely to disambiguate INS‑8: once the placeholder has silently acquired children, inserting two Contents leaves no answer to "which one keeps them", so core forbids the case and, where it happens anyway, hands the children to the last (`hooks/use-reference-field.ts:289-295`). Without INS‑8 there is nothing to disambiguate.

### 4.4 Looks like a bug rather than a rule (2)

**DND‑2** and **DND‑10**. Both detailed in §5.5 and §5.6.

---

## 5. Defects found

The two already recorded in parity §B2 — the add affordance disabled by `?? 0` when no `max_items` is set, and `max_depth: 0` read as unset — are not repeated. These are additional.

### 5.1 Adding a *sibling* below an expanded parent silently re-parents that parent's whole branch

**High confidence. The most consequential finding here.**

`onInsertPlaceholder` calls `updateNewChildren` unconditionally (`hooks/use-reference-field.ts:450`). With the strip below an expanded row `A` at depth 0, `insertPos = index(A) + 1` (`add-reference-item.tsx:78`) and the placeholder's depth is also 0, so `updateNewChildren` finds `oldParent = A` (`utils.ts:171-179`) and rewrites `A → placeholder` in the `ancestor_ids` of every descendant of `A` at index ≥ `insertPos` (`:185-201`) — which is all of them, since a parent's descendants immediately follow it. `A` is left childless and the new row inherits the entire branch.

The strip's own label said `+ Add sibling of …` (`add-reference-item.tsx:109-113`).

The helper reads as if written for the *child* case (insert at depth `prevDepth + 1`, where taking the trailing rows at that depth is the right thing), and the guard that would restrict it to that case is missing. Note that `handleDragEnd` calls the same helper behind a real guard — `if (nextDepth > depth && adjustedNewIndex !== 0)` (`hooks/use-reference-field.ts:224-230`) — which is evidence the unconditional call on the insert path is an omission rather than a decision.

**Why it matters for the port:** this is what INS‑8 and INS‑9 are, and INS‑9 (§4.3) is a UI restriction built on top of the defect. Porting insert-between-items to fieldkit means porting INS‑1 through INS‑4 and *not* this — which is the same as saying fieldkit's version is simply "splice one Reference at this position and depth", with no adoption at all.

### 5.2 The `max_depth` cap ignores a collapsed branch's height

**High confidence.**

`getProjection` is called with `visibleItems` as its `items` argument (`reference-field.tsx:267-274`), and `relativeSubtreeHeight` is derived from `getItemDepth(items, activeId)` — that same visible list (`hooks/use-reference-field.ts:369-374`). `getVisibleItems` drops every row whose ancestors include a collapsed id (`utils.ts:90-103`). So when the dragged Reference is itself collapsed, its descendants are absent, `getItemDepth` reduces over an empty array and returns 0, and `relativeSubtreeHeight` clamps to 0 (`:371-374`).

A collapsed three-level branch therefore projects as if it were a leaf and can be dropped at a depth where its hidden descendants exceed `max_depth`. Core initialises **every parent as collapsed** on mount (`hooks/use-reference-field.ts:52`, `getParentIds` at `utils.ts:9-18`), so this is the default state, not an edge case.

Note the inconsistency in the same function: `childrenCount` on the line above deliberately reads `state.items`, the full list (`:355`), so `isParent` is correct for a collapsed parent while `relativeSubtreeHeight` is not.

Fieldkit does not have this: `height` is measured during `flattenReferences` from the tree itself (`reference-tree.ts:81-89`) and is a property of the branch, not of what is on screen. `projectDropDepth`'s doc comment says as much (`:56-62`).

### 5.3 `minDepth` can exceed `maxDepth`, and then wins

**Medium-high confidence** — reachable, though it needs `max_depth` set and a specific neighbourhood.

`hooks/use-reference-field.ts:389-395`:

```ts
let depth = projectedDepth;
if (projectedDepth >= maxDepth) {
    depth = maxDepth;
} else if (projectedDepth < minDepth) {
    depth = minDepth;
}
```

Nothing relates the two bounds. `minDepth` comes from the row below (`:388`), `maxDepth` from the row above and the setting (`:377-386`). Where the setting pushes `maxDepth` below `minDepth`, a `projectedDepth` between them takes the second branch and lands at `minDepth` — past the cap the first branch was enforcing.

Fieldkit forecloses this by construction: `minDepth = Math.min(below ? below.depth : 0, maxDepth)` (`reference-tree.ts:264`), with the reasoning written down at `:225-230` — "a drop that adopts the Reference below it is a shrug, and one that breaks the ceiling is a broken promise". There is a test for exactly this ordering.

### 5.4 `max_items_per_page` is dead in the reference field

**High confidence.**

`reference-field.tsx:254-263` computes `_totalPages` and `_currentItems`; grep confirms neither identifier appears anywhere else in the file. The list renders `visibleItems` in full (`:375`), and the `Pagination` control below it (`:482-487`) is wired to `allItems.length` and a page state nothing consumes. The setting is offered in the config UI (`reference-field-configuration.tsx:70-81`) and is listed in parity §B2 as one of core's two extra settings keys — worth knowing that it currently does nothing, before anyone weighs porting it.

### 5.5 A drag that never hovers another row does nothing — so a Reference cannot be re-indented in place (DND‑2)

**High confidence about the behaviour; the intent is unrecoverable from source.**

`handleDragOver` records a target only when it differs from the active id (`hooks/use-reference-field.ts:89-97`), and `handleDragEnd` bails unless `state.overId` is truthy (`:120-122`). The comment at `:92-93` explains the filter as a workaround for the library reporting the dragged item as its own target after a visual swap.

The cost is that **changing only depth is impossible**: promoting a child to a root, or nesting a row under the one directly above it, requires dragging onto some *other* row and back. Core's own `manipulation_tree` treats this as a first-class case — `computeMove` handles `activeId === overId` explicitly and proceeds when the projection changes the parent (`field-type-manipulation-tree/utils/dnd-move.ts:38-55`) — which is good evidence the reference field's behaviour is a workaround's side effect rather than a rule.

Fieldkit does support it (§3, DND‑2 row), so this is a gap core has and fieldkit does not.

### 5.6 `RESET_ITEMS` is a no-op, so cancelling a drag restores nothing (DND‑10)

**High confidence; currently harmless.**

`resetItems({ items })` carries a payload (`state/actions/reset-items-action.ts:4-11`) that the reducer discards: `case "RESET_ITEMS": return { ...state };` (`state/reducer/reducer.ts:37-38`). `handleDragCancel` dispatches it (`hooks/use-reference-field.ts:241`) expecting a restore.

It is harmless *today* only because nothing mutates `state.items` during a drag — the value is written once, in `handleDragEnd` (`:235-236`). Any future mid-drag preview would silently lose its undo.

`SET_PAGE` has the same empty shape (`reducer.ts:63-64`), and its whole slice is dead: `state.currentPage` is written once at init (`hooks/use-reference-field.ts:58`) and read nowhere, and the `setPage` action creator (`state/actions/set-page-action.ts:9-12`) is never dispatched. The field paginates from a local `useState` instead (`reference-field.tsx:200`) — which, per §5.4, does not paginate.

### 5.7 "+ Add sibling of X" names the new item's *parent*, not a sibling

**High confidence; cosmetic.**

`buildRefDepthLabelMap` maps depth `d` to the ancestor at `ancestorIds[d - 1]` (`reference-field.tsx:318-333`), which for `d ≤ prevDepth` is the *parent* the new item would get. `getLabel` then renders that name under "+ Add sibling of {{name}}" (`add-reference-item.tsx:109-113`). Both branches of the label therefore name the prospective parent; only one of them says so.

### 5.8 `max_items: 0` read as unset — a third site

Same family as the two already recorded, at a site those two do not cover: `reference-drawer.tsx:221-224` computes `hasMaxItems = max_items !== undefined && max_items !== 0`, so a field capped at zero gets an unlimited drawer. Noted only so a fix for the recorded pair does not miss it.

### 5.9 Core's `DragOverlay` renders nothing, so an Author cannot see what they are dragging

**High confidence. Added 2026-08-05, from a second reading aimed at drag feedback.**

`reference-field.tsx:462-478` mounts a `DragOverlay` and passes it a `RelatedItem` with `isOverlay={true}`. But `RelatedItem` opens with `return (!isOverlay && (<HStack …>))` (`related-item.tsx:192-193`), so with that flag set it renders `false` — nothing. Every `isOverlay ? … : …` branch inside the component (`:196`, `:329`, `:351`) is unreachable, which is good evidence an overlay variant was written and then disabled rather than never attempted.

So core's entire mid-drag feedback is the **source row collapsed in place**: `& .relatedItem` goes to `height: 8px` with `backgroundColor: primary-500` and its contents to `opacity: 0, height: 0`, with a 12px circle at the left end and `paddingLeft: 32 × projectedDepth` (`:196-220`). That reads the landing depth clearly — it is a drop indicator in all but name, and the same shape fieldkit's editor canvas independently arrived at (3px accent line, end-dot).

The cost is that **the Reference in flight becomes anonymous**: its name, its Attributes count and its controls are all at zero height for the duration, and the overlay that would have carried them draws nothing. An Author dragging one of several similarly-named Contents has no confirmation of which one they picked up.

Fieldkit keeps the row visible and dimmed instead, which is why [the 2026-08-05 tree drag-feedback design](./superpowers/specs/2026-08-05-tree-drag-feedback-design.md) takes core's indicator idea without taking its collapse.

---

## 6. `manipulation_tree`, secondary

Core's structural sibling to the reference field. Kept secondary as instructed, but it matters for one reason: **it has tests** — `utils/dnd-projection.test.ts`, `utils/dnd-move.test.ts`, `utils/dnd-flow.test.ts`, `utils/tree-utils.test.ts`, `state/reducer.test.ts`, `__tests__/reducer.test.ts` — and it re-derived several of the same rules independently, disagreeing with the reference field twice.

It has two generations of drag code, both live:

| | reads | used by |
|---|---|---|
| `components/manipulation-tree/hooks/use-dnd.ts` | flat `ModelContentReferenceFlat[]` with `ancestor_ids`, like the reference field | `components/manipulation-tree/manipulation-tree.tsx:39` |
| `hooks/use-tree-dnd.ts` + `utils/dnd-projection.ts` + `utils/dnd-move.ts` | a genuinely nested `ManipulationTreeNode[]` with `parentId` and `position` | `components/tree-view/manipulation-tree-view.tsx:66` |

The newer generation is much closer to fieldkit's than to the reference field's, and its shape is worth noting: **pure functions over a node list, extracted for testability** (`dnd-move.ts:20-24` says so explicitly), with the React hook reduced to plumbing. That is the same split fieldkit made between `src/schema/reference-tree.ts` and `src/renderer/fields/reference-tree.tsx`.

Where it disagrees with the reference field:

- **In-place re-indent is supported.** `computeMove` handles `activeId === overId` when the projection changes the parent (`dnd-move.ts:38-55`) — the case the reference field discards (§5.5).
- **Cycles are checked, not designed away.** Two explicit guards: `if (parentId && descendantIds.has(parentId)) return null` (`dnd-projection.ts:152-155`) and `if (descendants.some(d => d.id === overNode.id)) return []` (`dnd-move.ts:59`, and again at `:43, :70`). The reference field relies on unmounting the rows instead (DND‑3).
- **The dragged branch is excluded from the neighbour search** by an explicit descendant set (`dnd-projection.ts:99-118`) — the same thing fieldkit does by slicing the branch out (`reference-tree.ts:248-250`), and something the reference field does only for `nextItem` (`hooks/use-reference-field.ts:357-364`) and not for `previousItem`.
- **The floor has a stated motivation.** `minDepth` applies only when the next visible node is a *trailing sibling*, "to limit to one level shallower (adoption)" (`dnd-projection.ts:132-140`) — the same intent the reference field's `nextDepth − 1` expresses without saying so.
- **Sibling adoption is deliberate and explicit.** `buildMoves` walks the ancestor chain and re-parents trailing siblings onto the moved node when the drop goes shallower (`dnd-move.ts:130-185`), returning them as separate `MoveInstruction`s. That is INS‑8's *intended* behaviour, expressed as an operation with a name, on the drag path where it belongs.

Where it agrees with the reference field, sometimes verbatim:

- `AddManipulationTreeItem` (`components/tree-view/add-manipulation-tree-item.tsx`) is `AddReferenceItem` copied — same 32px steps, same `min = nextDepth − 1` / `max = isPrevCollapsed ? prevDepth : prevDepth + 1`, same `maxDepthSetting − 1` clamp, same three labels, same `insertPos = index + 1 + prevChildrenCount` (`:52-73, 109-114`). The only substantive difference is a 28px offset for the chevron column (`:53-55`). So INS‑2 through INS‑5 are core's *house pattern* for tree insertion, not one field's quirk — which strengthens the case for porting them.
- `useDnd`'s older generation carries a guard that cannot fire: `const overAncestorIds = sourceData?.ancestorIds ?? []; if (overAncestorIds.includes(sourceId)) return;` (`components/manipulation-tree/hooks/use-dnd.ts:65-71`) reads the **source's** data and asks whether the source is its own ancestor. Presumably meant to read the target's. Dead code in a legacy path; recorded for completeness only.
- One `TODO JIW` marks a known defect in the same legacy path (`use-dnd.ts:415`): children should only be added to the over-index when the item is collapsed.

**Nothing in `manipulation_tree`'s drop rules is domain-coupled either.** Its domain lives in what a node *is* — releases, TI overlays, replacement modes, upgrade suggestions — not in where it may be dropped.

---

## 7. What would most change a design decision

1. **Core's drop rules contain no domain knowledge at all.** Not one of the ten in §3 reads a blueprint, a status, a release or a content kind; they read depths and neighbours. Whatever ADR-0002 makes hard elsewhere, it makes nothing hard here — the portability question for part (b) is purely "is fieldkit's version better", and for six of the ten it already is.
2. **The insert-between-items flow is two features, and only one of them is worth having.** The affordance (INS‑1–INS‑4: a strip between rows, depth from pointer x, a label naming the result) is generic, is core's house pattern across two field types, and is the real gap in fieldkit. The mechanism (INS‑7–INS‑9: a placeholder written into the value, silent child adoption, a one-selection rule to paper over it) is inseparable from core's flat value and contains a defect (§5.1) that its own UI mislabels. Fieldkit already owns every piece of arithmetic the affordance needs — `projectDropDepth`'s bounds with a different pair of neighbours, and `nestReferences` over a list with one entry spliced in. The work is the strip, not the model.
3. **Fieldkit and core disagree about folded branches, and neither is obviously right.** Core closes a collapsed Reference to drops entirely (DND‑6, `structuralMaxDepth = prevDepth`); fieldkit opens it, lands the drop at the end of its branch, and unfolds it so the Author can see where it went (`reference-tree.tsx:378-381`). This is the only rule where fieldkit is the more permissive one, it is a genuine product decision rather than an implementation gap, and it should be decided explicitly — including for whatever INS‑1 becomes, where core's `isPrevCollapsed` clause (`add-reference-item.tsx:70`) makes the same call for insertion.

## Caveats

- Read at one commit each, with both repos moving. Core's reference field last changed in a Chakra-migration commit (`8f6725057`, "fix(reference): migrate to dnd-kit/react and restore depth label map"); the surrounding history is mostly refactors, not behaviour.
- Nothing here was executed. With no tests in core's directory and no way to run its UI from this workspace, every core claim is a reading of source. The claims most worth re-verifying by hand are §5.1 (does adding a sibling below an expanded parent really steal its children?) and §5.2 (does a collapsed branch really drop past `max_depth`?), both of which are behavioural and both of which would be one manual test each.
- Core runs `@dnd-kit/react` (the newer package); fieldkit runs `@dnd-kit/core` + `@dnd-kit/sortable`. The two express targets and offsets differently — core reads `event.operation.transform?.x` (`hooks/use-reference-field.ts:86`), fieldkit `event.delta.x` (`reference-tree.tsx:328`) — so a rule stated in terms of one library's events may not port as written even when its intent does.
