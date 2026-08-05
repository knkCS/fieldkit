# Find matches in the browser, over every name in the tree

A Reference Field may hold more than ten thousand References, and an Author has to be able to reach one by the name of the Content it points at — which a Reference does not store, since it stores only an id (ADR-0008). So Find matches **client-side**, over the display names of every Reference at every level, and fieldkit goes on resolving names for the whole tree rather than for the rows on screen. The tree's contents are a closed set the client already holds; searching it through the Adapter means shipping that set up the wire to ask a question about itself.

This makes deliberate something that was already true — `useResolvedContentNames` has always been handed every row, not the visible ones — and fixes it in place as the thing Find depends on rather than an incidental over-fetch to be tidied away later.

## Considered options

**A new optional adapter capability that searches within a set of ids** — an `includeIds` on `ReferenceSearchQuery`, or a method of its own. It would keep the payload on open small and let a Consumer bring its own collation or index. Rejected on two counts. It carries up to ten thousand ids on every keystroke, which is the same set the client already has, sent repeatedly instead of once. And under ADR-0009's degrade rule an optional method absent means the feature degrades — but there is no coherent lesser Find, so a Consumer that had not implemented it would get none at all, and whether the control exists would vary by Consumer. Optional adapter methods are for capabilities that have a graceful floor; this one has none.

**Reusing the existing `search()`** and intersecting its results with the tree. Rejected as unreliable in precisely the way `ReferenceSearchQuery.excludeIds` already documents: `search()` is catalogue-wide and paged, so a page of matches may contain none that are in this tree, and the Author would read that as "not here".

**Storing the display name in the value.** It would make Find free and remove the fetch entirely. Rejected because it reverses the rule the control is built on — it never stores a name, so a Content renamed elsewhere reads correctly everywhere that points at it. Denormalising would leave every tree stale until something rewrote them.

**Resolving names lazily** — the visible rows on open, the rest on the first keystroke. Rejected as the default not on cost but on honesty: Find would have to answer "nothing yet" for a query whose answer exists in the tree the Author is looking at, and knowing what the tree contains is the whole of what Find is for. The door is left open: it is a change of *when*, not of *where*, so it can be revisited if the resolution on open proves too expensive without disturbing anything else here.

## Consequences

`fetch()` is called with every id in the tree, **chunked by fieldkit** into batches and merged. The adapter interface is unchanged and the batch size is fieldkit's, not the Adapter's — so an Adapter written against a twenty-Reference Field keeps working at ten thousand without knowing it, and no Consumer is ever handed a call its transport or its query planner cannot serve.

Opening the field costs one resolution of the whole tree whether or not anyone searches. At ten thousand References that is a real cost paid on open, and it is the price of Find knowing the tree's contents rather than guessing at them.

Because names arrive in batches, Find must distinguish *no match* from *not yet resolved* and say so. A control that reported "no matches" while the set was still arriving would be lying about the tree, which is the one thing this decision buys.

Matching is fieldkit's, so its rules are fieldkit's: case-insensitive substring, diacritics folded, ids matched as well as names. A Consumer cannot substitute its own collation, stemming or fuzzy index — that is what the rejected adapter capability would have bought, and it is what this trades away for a Find that behaves identically everywhere.

Find degrades exactly as row display already does. With no Adapter, or after a failed lookup, there are no names and Find matches ids — which is precisely what is on screen in that state.
