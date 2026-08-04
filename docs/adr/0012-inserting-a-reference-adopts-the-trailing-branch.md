# Inserting a Reference adopts the trailing branch, and dragging one may too

A Reference inserted between two rows takes the rows that follow it at its own depth, and their branches, as its children. A drag may land one level shallower than the row below it — when the dragged Reference is a leaf — and adopts on the same terms. Both paths announce it: the insertion strip names the rows that would move before the click, and the drag highlights them before the release.

This matches knkCMS core, whose reference field does the same on both paths (`hooks/use-reference-field.ts:450` on insert, `:224-230` on drag), so an Author working in either system gets one answer rather than two. It also settles a disagreement fieldkit would otherwise carry inside itself: an insert that restructures and a drag that refuses to would make adoption a thing that exists on one path and not the other.

The behaviour is adopted; the implementation is not. Core's insert path calls `updateNewChildren` unconditionally while its drag path guards the same helper, its strip says "+ Add sibling of A" while re-parenting A's whole branch, and both label branches name the prospective parent rather than what they claim. Those are recorded as defects in [the core comparison](../core-reference-tree-comparison.md) §5.1 and §5.7. Fieldkit takes the semantics and states them: the label reads what will happen, and says which rows move when any would.

> Where this note cites core, it cites the comparison rather than core's source, which moves independently of this repo.

## Considered options

**A pure splice — insert one Reference, move nothing else.** The least surprising rule, the least code, and what the strip's label would say without qualification. Rejected because it diverges from core on a behaviour Authors use, and because it leaves the drag path's floor to be argued separately: `projectDropDepth` currently forbids adoption by construction, so "no adoption" would have to be defended twice rather than decided once.

**Adopting only when inserting as a child** — the case core's helper reads as if it was written for. Rejected as the worst of both: it still restructures rows the Author did not point at, while being harder to describe than either of the whole answers.

**Core's one-selection rule (INS-9)** was not considered at length: it exists to decide which of several newly inserted Contents keeps the adopted children, and fieldkit's picker settles on one Content and writes once (`reference-picker-drawer.tsx:273`). The ambiguity it guards is unreachable here.

## Consequences

**Adoption is not a new operation.** In a nested value it falls out of the round trip the tree model already performs: flatten the visible rows, splice the new entry at its position and depth, re-nest. `nestReferences` reads order and depth alone, so rows that follow a shallower entry become its children with nothing asked for. Core needs `updateNewChildren` and `replaceAncestor` to rewrite ancestor-id strings (§4.3); fieldkit needs neither, and the state those helpers clean up — a row naming an absent ancestor — stays unrepresentable (ADR-0008).

**The depth cap interacts with adoption — but not in the way this record first claimed.**

> **Erratum, 2026-08-04.** As first written, this consequence asserted that inserting a child which adopts rows already at that depth "pushes them to depth 2, and their descendants deeper again", and that an unguarded insert could therefore produce a tree that renders and then refuses to submit. **That is false**, and it was found false while implementing it. Splicing an entry moves no other row, and a row is adopted only when it is *already* strictly deeper than the arrival — so re-nesting can never push an existing row deeper, and an insert cannot breach `max_depth` by adopting. Checked exhaustively over every well-formed depth list to length six, across all slots, ceilings and offsets. The paragraph below replaces the claim; the decision it sat under is unchanged.

Adoption cannot deepen an existing row, so the cap needs no defending against it. What the clamp does bind on is a tree that **already** breaks the cap: there it withdraws the offer to rearrange a branch that no placement can make legal, rather than pretending a move would help.

It therefore sits on the projection's **floor**, not its ceiling. Adoption is reachable at exactly one depth — one level shallower than the row below — so spending the adopted branch's height against the ceiling, the way a dragged branch's own height is spent, would forbid depths that adopt nothing at all. The two heights answer different questions and belong on different bounds.

Since [ADR-0007's blast radius](0007-container-plugins-compose-their-own-children.md) put these caps in the generated Schema, the failure this guards against is real even if its cause was misdiagnosed: a value that submits today can stop submitting once a cap is enforced, and the UI should not offer moves that cannot help.

**The announcement is part of the decision, not decoration.** This rule restructures rows the Author did not point at, which is exactly why core's silent version reads as a bug. Removing the label's adoption clause, or the drag's highlight, would not be a cosmetic regression — it would leave the behaviour indistinguishable from the defect it was modelled on.

**One written rationale is reversed.** `projectDropDepth`'s doc comment argues that "the Reference below sets the floor, since landing shallower than it would silently adopt it and its branch", and that where the ceiling and the floor disagree "a drop that adopts the Reference below it is a shrug". The floor moves from the row below's depth to one level shallower when the dragged Reference is a leaf, and the comment goes with it. The ceiling still wins over the floor; that half stands.

**Insertion is no longer expressible as "append".** `reference-field.mdx` recorded "The drawer always adds at the root; a new Reference is nested by dragging it" as a known limitation, and `handleAdd` was one `onChange` with a spread. Position and depth now travel from the affordance into the write, which is what makes every other decision in this record reachable.
