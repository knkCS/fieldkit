# Unset stops at the rich-text document; inside it, knkeditor's rules apply

ADR-0021 stores Unset one way, as absent, and Go rejects anything else as `not_canonical`. Applied inside a rich-text document, that rejects ordinary editor output: ProseMirror writes `attrs` with explicit `null`s by design, and knkeditor's own documents carry `"attributes": {}`. Stripping them would change what a document says, turning "explicitly none" into "the default". So the Unset rule applies to a `rich_text` Field's **value**, where "no document" is stored as absent, and **stops at the document**. Inside it, knkeditor's rules apply: its normalisation (`textTypeNormalisation`) and its validation (`ValidateJSON`), which fieldkit already delegates to (knkeditor ADR 0003).

The same boundary holds for the value depth cap: it counts fieldkit's structure only, and knkeditor limits its own documents.

## Considered Options

- **knkeditor emits canonical documents.** Rejected: it changes attribute semantics and would force a conversion of every stored and imported document.
- **fieldkit strips Unset from documents before storing.** Rejected: the same semantic risk, and imports and APIs that bypass the form would still fail.
