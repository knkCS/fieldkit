# `rich_text` renders through knkeditor in an opt-in subpath, and `rich-text-spec` retires

fieldkit's `RichTextField` was a JSON textarea placeholder, while the Go side already delegates everything about a document to knkeditor. knkeditor's editor (`@knkcms/knkeditor-editor`) now takes a Text Type and configures and normalises itself to it, but it brings about 45 extension packages, TipTap, i18next and emotion as peers. So the knkeditor-backed field ships in its **own subpath, `@knkcs/fieldkit/rich-text`**, which a Consumer opts into the way it opts into the publishing package: `{ ...richText, fieldComponent: KnkRichTextField }`. Only Consumers who import it pay for the peers. The core renderer keeps a read-only fallback. The field reads its Text Type from the Resolved Spec's `parts`, falling back to the `textType` adapter, and its Editor Settings through an adapter.

The `/rich-text-spec` layer (`EditorSpec`, `EditorNodePlugin`, `EditorSpecEditor`) configured an editor in a way Text Types have replaced: knkeditor owns the vocabulary, blueprinthub owns Text Type Releases, and knkeditor generates the option forms. It is deprecated in 0.18 and removed in 0.19, so there is one configuration model, not two.

## Considered Options

- **`RichTextField` imports knkeditor directly, as an optional peer loaded lazily.** Rejected: every Consumer using rich text would need all the peers, and lazy-loading an optional peer is fragile in bundlers.
- **Each Consumer wires knkeditor itself.** Rejected: that is the drift fieldkit exists to prevent.

## Consequences

- knkeditor#608 (UniqueID not registered by default, although the vocabulary requires node ids) blocks this. Without node ids, saved documents fail knkeditor's own validation.
