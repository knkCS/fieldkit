---
status: accepted
---

# A Reference links to its Content through an optional Adapter hook

Decided in a grilling in contenthub on 2026-11-06 (contenthub ADR 0029).

A Reference renders by its name — resolved through `adapters.reference` (ADR-0008) — in read mode and in the form's Reference Tree, but never as a link: fieldkit does not know where a Content lives in the Consumer's application. Following a law's parts from the law is the obvious next click on a read page, and as much a reviewer's next step in the form.

## The decision

- **`adapters.reference.hrefFor(id)`, optional**, answers the address of a referenced Content, or nothing. Where the Adapter has it and it answers, a Reference's name renders as a link, in read mode and in the form alike; where it has not, the name renders as text, as before.
- **An address, not a callback.** A real link opens in a new tab, can be copied and is announced as a link; an `onOpen` callback would make every Consumer rebuild that. A Consumer that must intercept navigation does it in its router, as for any other link.
- **The Consumer decides the address per page.** fieldkit passes the Reference's id and nothing else; whether it opens Main's Content or the Content's Branch in the Consumer's Change Set is the Consumer's to know, as everything about where a Content lives is (ADR-0002).
- **It answers synchronously.** It is asked once per rendered Reference, so it reads what the Consumer already holds; a Consumer that would need a request to answer leaves it out.

## Considered Options

- **fieldkit builds the address from a template.** Rejected: one Consumer's Change Set needs a Branch id per target, which no template over the Content id can express.
- **Links in read mode only.** Rejected by the Consumer that asked (contenthub ADR 0029): in a Change Set the link keeps the editor in their work; leaving with unsaved work is the Consumer's guard to make.
