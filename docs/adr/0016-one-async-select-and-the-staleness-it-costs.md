# One async select, and the staleness it costs

`SingleReferenceField` renders through anker's `LookupSelect`, the same atom
`LookupField` uses. There is **one** async select implementation in fieldkit and
this is it; the hand-rolled machinery that used to sit on `BaseSelect` — query
state, menu-open gating, a cancellation flag, the loading flag, the
resolved → just-picked → raw-id name chain — is gone, because the atom owns all
of it (anker ADR-0002, and [ADR-0015](0015-lookup-is-generic-and-keyed-by-source.md)
for the Lookup half).

"Cancellation" throughout this record means what the atom means by it: the atom
aborts the request it no longer wants and **discards the answer**. It does not
mean the Adapter's own call is stopped, because it never is —
`ReferenceSearchQuery` has nowhere to carry a signal, exactly as
`LookupSearchQuery` has not (ADR-0015). What fieldkit does with the signal it is
handed is decline to report a failure nobody can act on: `report(error)` runs
only when `signal.aborted` is false, which is the guard the effect this replaced
spelled `if (cancelled) return;`. Both pickers do this, identically.

The reason this was not deferred is that the two pickers are **adjacent fields in
one form** in Boorberg's export drawer: an Ausgabe (Single Reference) beside a
stylesheet (Lookup). Two hand-rolled async selects side by side differ in exactly
the places hand-rolled async selects always differ — how long typing settles
before a request goes out, what the menu says while it waits, what it says when
nothing came back, whether it pages at all — and none of those differences is
visible in a diff. Shipping them in one version off one atom is what makes them
agree by construction.

What is left in the field is the half the atom deliberately does not have:
asking the reference Adapter, translating between the `page`/`page_size` its
surface asks in and the opaque cursor the atom pages by (ADR-0015 decided that
translation and it is unchanged here), keeping the Content already held out of
the menu, and reporting a failure on the Consumer's `onError`.

**The pin select stays a `BaseSelect`.** `listPinTargets` answers with
everything one Content offers in a single call the moment a Content is chosen,
so there is no query to debounce, no page to fetch and no stored id to resolve.
An async select there would orchestrate nothing. "One async select" is a claim
about the async ones.

## What this costs, and why it is accepted

**A menu left open across a change of the value goes stale.** The Content the
Field already holds is withheld from the picker — its id travels with the search
as `excludeIds`, and the Adapter (or fieldkit's backstop) drops it. Clearing the
Reference should put it back on offer, and it does: on the next **fresh** search
— one that starts from page one, which is a menu opening or a typed query
settling. It no longer happens instantly, because the atom re-asks on those and
on a scroll to the end, and **never because a prop underneath it changed**. The
old hand-rolled effect listed `excludeIds` among its dependencies and so re-ran
the moment the value moved.

The window is small and self-healing: **typing, or closing and reopening the
menu**, corrects it, and one of those is what a person does next anyway. What
must not happen — the exclusion outliving the Reference — does not.

**Scrolling does not correct it, and must not try to.** The atom's
`loadNextPage` *appends* the next page to what is on screen; it never re-fetches
page one. So a cursor'd page is a continuation of a sequence, and the exclusion
it is cut with has to be the one that cut page one — otherwise page two comes
from a differently-filtered list, slides by one, and hands back a Content page
one already showed: a duplicated option, and a duplicated React key. The field
therefore pins the exclusion to the sequence rather than reading the current one
on every page, and a fresh search — a menu opening, a query settling — is what
starts a new sequence with a new exclusion. Paging stays coherent with what is
on screen; correcting the staleness is the other two paths' job.

It is accepted rather than worked around because every workaround is worse than
the staleness:

- **Remounting the select on the value** (a `key` over `excludeIds`) closes the
  open menu, and reopens it after every pick, since picking changes the value
  too. It also drops the atom's per-mount resolved-name cache, so the name just
  picked flashes as a raw id while it is fetched again.
- **Controlling `menuIsOpen`** means owning open, close, blur, Escape and
  select-closes-the-menu — re-hand-rolling the interaction this ADR exists to
  stop hand-rolling, in order to trigger one request.
- **Hiding the option with a custom `Option` renderer** leaves it in
  `options`, so it stays keyboard-focusable and selectable while invisible. A
  control that can be made to pick something nobody can see is worse than one
  whose menu is a moment out of date.

The clean fix is not fieldkit's to make: the atom would need to accept an opaque
token whose change re-runs the current query — "the meaning of `search` moved,
ask again" — which nothing in `LookupSelectProps` offers today. That is filed
against anker rather than smuggled in here.

## Consequences

**The picker pages, where it used to stop at fifty.** The old effect asked for
`page: 1` and never asked again, so a workspace with more than fifty Contents
matching a Field's Blueprints silently truncated: the rest were reachable only
by typing a query narrow enough to bring them inside the first fifty, and
nothing on screen said so. Scrolling the menu to its end now asks for the next
page. This is a fix, and it is a live change in a shipping drawer.

**Typing settles through a debounce.** The control asked the Adapter on every
keystroke; the atom waits 300 ms. Fewer requests, and a superseded answer can no
longer overwrite a fresh one — but the menu narrows a moment after the typing
does, which one existing test had to be taught to wait for.

**One message where there were two.** The old control said "No content
available" on an empty query and "No content matches" on a typed one; the atom
takes a single `emptyMessage`, and it is "No content matches" — the string the
Reference picker drawer already uses.

`useResolvedContentName` is no longer what names the Content *in this control* —
the atom's `resolve` calls `reference.fetch` directly. The hook stays, because
`single-reference-read.tsx` reads through it, and read mode has no select to
resolve anything for it.

One trigger is lost with it, and deliberately not replaced. The hook listed the
Adapter among its dependencies, so swapping the reference Adapter under a mounted
control re-fetched the name; the atom's resolved-name map is a per-mount cache
and nothing re-fetches now. `LookupField` guards the same thing with
`key={sourceId}` — but a Lookup's Source is a *Field setting* an Author edits
live in the editor's preview, where the reference Adapter is provider-level and
does not move under a mounted control. There is nothing here to key on that a
Consumer replacing its whole provider would not already remount.
