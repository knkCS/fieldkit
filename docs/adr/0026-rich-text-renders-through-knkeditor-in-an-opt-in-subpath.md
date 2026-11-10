# `rich_text` renders through knkeditor in an opt-in subpath, and `rich-text-spec` retires

fieldkit's `RichTextField` was a JSON textarea placeholder, while the Go side already delegates everything about a document to knkeditor. knkeditor's editor (`@knkcms/knkeditor-editor`) now takes a Text Type and configures and normalises itself to it, but it brings about 45 extension packages, TipTap, i18next and emotion as peers. So the knkeditor-backed field ships in its **own subpath, `@knkcs/fieldkit/rich-text`**, which a Consumer opts into the way it opts into the publishing package: `{ ...richText, fieldComponent: KnkRichTextField }`. Only Consumers who import it pay for the peers. The core renderer keeps a read-only fallback. The field reads its Text Type from the Resolved Spec's `parts`, falling back to the `textType` adapter, and its Editor Settings through an adapter.

The `/rich-text-spec` layer (`EditorSpec`, `EditorNodePlugin`, `EditorSpecEditor`) configured an editor in a way Text Types have replaced: knkeditor owns the vocabulary, blueprinthub owns Text Type Releases, and knkeditor generates the option forms. It is deprecated in 0.18 and removed in 0.19, so there is one configuration model, not two.

## Considered Options

- **`RichTextField` imports knkeditor directly, as an optional peer loaded lazily.** Rejected: every Consumer using rich text would need all the peers, and lazy-loading an optional peer is fragile in bundlers.
- **Each Consumer wires knkeditor itself.** Rejected: that is the drift fieldkit exists to prevent.

## Consequences

- knkeditor#608 (UniqueID not registered by default, although the vocabulary requires node ids) blocks this. Without node ids, saved documents fail knkeditor's own validation.

## Amended: knkeditor renders in its own scoped Chakra system, at its document's height (2026-11-10)

knkeditor draws its toolbar, menus and dialogs with Chakra and is styled against **Chakra's default theme**. In the subpath it rendered inside the Consumer's theme, which is anker's for every knkCS app. There, anker's recipes restyle knkeditor's controls: toolbar buttons pick up anker's primary outline, button groups get stray underline strips, and selects render empty ("None"). Found in contenthub's Branch editor (contenthub's grilling of 2026-11-10). knkcms core met the same thing and wraps its editor in a scoped system of its own.

- **`KnkDocumentEditor` renders knkeditor inside its own Chakra system**, in the edit field and the read view alike: `createSystem(defaultConfig, { preflight: false, globalCss: {}, cssVarsRoot: <a class on the wrapper> })` with a gray `colorPalette`. With `preflight` and `globalCss` off, nothing leaks out: the Consumer's page, reset and anker tokens stay as they are, and anker's recipes stop at the wrapper. The system is created once per module, not per render.
- **knkeditor, not anker, owns the editor's look.** This is the one place in fieldkit where an anker-themed surface is deliberately not anker. Rich text looks the same in every Consumer, and the same as in core, whose editors these are.
- **The editor grows with its document.** The `maxEditorHeight` cap (60vh) goes, so a long document no longer scrolls inside a page that scrolls too. The toolbar stays at the top of the field while you edit (`toolbarPosition="fixed"`, as core uses it). The page is as wide as the Text Type says (`page_width`, A4 by default), as in core.

### Considered options

- **Theme knkeditor through anker** (anker recipes for its controls). Rejected: knkeditor's controls are Chakra primitives styled for the default theme. Matching every one under anker would be a second skin to keep in step with each knkeditor release.
- **Let each Consumer wrap the field.** Rejected: that's the drift this ADR already rejects, and each app's rich text would look different.
- **Keep the 60vh cap.** Rejected: nested scrolling and a cramped long § in exchange for compactness only a form with several rich-text fields needs.
