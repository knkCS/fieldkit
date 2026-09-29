# @knkcms/knkeditor Reference for Fieldkit

How fieldkit integrates knkeditor, the rich-text editor a `rich_text` Field's document is written in. Read this before modifying the `/rich-text` subpath, the core `RichTextField`, the `rich_text` field type, its Go delegation, or the deprecated `rich-text-spec` layer.

## The integration in one paragraph

A `rich_text` Field pins a **Text Type Release** in `settings.text_type` (ADR-0020, #216). Resolving the Spec fetches the Text Type once and carries it in the Resolved Spec's `parts.text_type`, keyed by Release id. In the browser, the opt-in subpath **`@knkcs/fieldkit/rich-text`** renders the Field through knkeditor's editor under that Text Type (ADR-0026, #278); without it, the core renderer shows the document read-only. In Go, fieldkit delegates every reading of a document — validation, edges, text, Compare, Merge — to knkeditor's Go module under the same Text Type. knkeditor owns the vocabulary, blueprinthub owns Text Type Releases, and fieldkit never looks inside a document or a Text Type (ADR-0025).

## Packages

| Package | Version fieldkit needs | Used by | Purpose |
|---|---|---|---|
| `@knkcms/knkeditor-editor` | `^1.8.0` | `/rich-text` | The React editor (`Editor`, default export). 1.8.0 is the floor: it registers `UniqueID` on every editor it builds, and loading a document's ids is not an edit (knkeditor#608) — without that, saved documents fail knkeditor's validation (the vocabulary requires a node id on every block) |
| `@knkcms/knkeditor-vocabulary` | `^0.1.0` | `/rich-text` | `ResolvedTextType`, `EditorSettings`, `needsNewerVocabulary`; the tests also use its `validate` |
| `github.com/knkcms/knkeditor/go` | `go/go.mod` | fieldkit's Go module | Validation, edges, text, Compare, Merge (below) |

All three packages live in GitHub Packages (`@knkcms:registry=https://npm.pkg.github.com/`). Both npm packages are **optional peers** of `@knkcs/fieldkit`, needed only by `/rich-text`, and devDependencies here, for its tests and stories.

`@knkcms/knkeditor-editor` declares its own peers, which a Consumer importing `/rich-text` installs too (npm 7+ does so itself): TipTap 3 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/react` ^3.20), `i18next`, `i18next-browser-languagedetector`, `react-i18next`, `react-icons`, `@emotion/react`, and its ~45 `@knkcms/knkeditor-extension-*` packages. That weight is the reason for the subpath.

**No other subpath imports any of it.** tsup keeps `@knkcms/*` and `@tiptap/*` external, and `npm run verify-peers` (`scripts/verify-peers.ts`, part of `npm run verify`) walks the built `dist` from every entry but `rich-text` and fails if one reaches knkeditor's world through any chunk.

## `@knkcs/fieldkit/rich-text`

| Export | What it is |
|---|---|
| `knkRichTextPlugin` | `{ ...richTextPlugin, fieldComponent: KnkRichTextField, readComponent: KnkRichTextRead }` — pass it in place of the built-in `rich_text` plugin |
| `KnkRichTextField` | The form field: knkeditor's editor over the form value (`FieldProps`) |
| `KnkRichTextRead` | SpecForm's read mode: the editor, read-only (`ReadProps`) |

```tsx
import { builtInFieldTypes, resolveSpec } from "@knkcs/fieldkit/schema";
import { FieldKitProvider, SpecForm } from "@knkcs/fieldkit/renderer";
import { knkRichTextPlugin } from "@knkcs/fieldkit/rich-text";

const plugins = builtInFieldTypes.map((p) =>
  p.id === "rich_text" ? knkRichTextPlugin : p,
);
const resolved = await resolveSpec(
  spec,
  { blueprint: adapters.blueprint, parts: { text_type: adapters.textType.get } },
  { plugins },
);

<FieldKitProvider plugins={plugins} adapters={adapters} parts={resolved.parts}>
  <SpecForm schema={resolved.fields} />
</FieldKitProvider>;
```

### Where the field's configuration comes from

- **Text Type** — `FieldKitProvider`'s `parts` prop (the Resolved Spec's `parts`, #278) at `parts.text_type[<the Field's text_type>]`. For a Pin they do not hold, `adapters.textType.get(releaseId)`, fetched once per adapter object and Release id however many Fields ask. A Field without `text_type` runs under the whole vocabulary, which is what Go's `ValidateValue` checks it against too.
- **Editor Settings** — `adapters.editorSettings.get()`, fetched once per adapter object. Without the adapter, or when it rejects (reported through `onError`), the editor runs with knkeditor's defaults: Editor Settings change how the editor helps, not what a document may hold.
- **Document** — the form value, as `content`. knkeditor loads `content` once, when it mounts, and takes `textType` and `editorSettings` only then, so the field waits for both before mounting it (a skeleton meanwhile). The editor's own edits come back through `onUpdate` as `editor.getJSON()`; a value set from outside — a reset, Discard, another row in the EditDrawer — remounts the editor over it.
- **`view_mode`** — `full` is knkeditor's `default` view, `compact` its `minimal` one. `readOnly` is `editingMode: "readOnly"`.

### When the field opens no editor

It never edits under a Text Type it cannot trust, and never writes the value when it can't edit it. It shows the document read-only instead — the same view as the core renderer's fallback — with a line saying why:

- **The Text Type needs a newer vocabulary** than the bundled one (`needsNewerVocabulary`): the page predates a deploy, so it says to reload. Not an error, so nothing goes to `onError`.
  fieldkit says so itself rather than handing the stale Text Type to knkeditor, whose own stale view builds an editor it never attaches — tiptap destroys that editor if React's effects run more than a millisecond after render, and `useKnkEditor`'s effect then crashes on it (reliably in jsdom).
- **The Text Type can't be loaded**: not in `parts` and no `textType` adapter, or `get` rejected. The failure goes to `onError`.
- **The stored value isn't a document** — a string the old JSON textarea wrote, say. An empty editor over it would replace it with the first keystroke.

The editor tells its own edits from a value set from outside **by content**, not identity: React Hook Form hands a value back as a deep clone, so an identity check would remount the editor — losing cursor, selection and undo history — on every keystroke.

In read mode the same cases show the document's text.

## The core renderer's `rich_text` field

Without `/rich-text`, `rich_text` renders `RichTextField` from `/renderer`: the document's text read-only, with a line saying it can't be edited here. It only watches the value, never registers or writes it, so a form keeps a document exactly as it came. It replaced a JSON textarea that let anyone write documents knkeditor refuses. The table cell (`RichTextCell`) shows the same text preview (`rich-text-preview.ts`).

## Adapters

```ts
textType?: {
  get: PartFetcher;                           // (releaseId) => Promise<unknown>: a ResolvedTextType
  list?: () => Promise<TextTypeSummary[]>;    // the config panel's Text Type picker
};
editorSettings?: {
  get: () => Promise<unknown>;                // an EditorSettings
};
```

`textType.get` is the same `PartFetcher` `resolveSpec()` takes as `parts.text_type`, so one function serves both. The values are typed `unknown` in `/renderer`: they are knkeditor's types, and `/renderer` must not reference knkeditor even in its declarations. These replaced the `EditorSpec`-era `getEditorSpec`, `getGlobalSettings` and `listEditorSpecs` in 0.18 (#278, [`migration-0.18.md`](migration-0.18.md)).

## knkeditor's editor, as `/rich-text` uses it

`EditorProps` (knkeditor-editor 1.8) that fieldkit sets: `content`, `textType` (a `ResolvedTextType`: the editor configures its extensions with it — `configureForTextType` — and normalises what is pasted, inserted or created to it — `textTypeNormalisation` — while `content` loads as it is), `editorSettings`, `viewMode` (`"default" | "minimal"`), `editingMode` (`"content" | "readOnly"`), `sections: { devMenu: false }`, `maxEditorHeight`, `onUpdate`, `onBlur`. It leaves `extensions` at knkeditor's defaults, which the Text Type configures.

The editor import is the package's **default** export: its named `Editor` export is TipTap's `Editor` type, which shadows the component for TypeScript.

### Testing it in jsdom

`src/rich-text/__tests__/knk-rich-text-field.test.tsx` mounts the real editor in fieldkit's jsdom environment. The TipTap editor sits on the `.ProseMirror` element as `.editor`; edit through its commands (`insertContentAt`), since jsdom has no `contenteditable` typing. Each test mounts a whole editor, so keep them few.

## Validation, edges, text, Compare and Merge (#216)

fieldkit's **Go** module delegates every reading of a `rich_text` value to knkeditor's Go module, `github.com/knkcms/knkeditor/go` (`go/rich_text.go`), under the Text Type in the Resolved Spec's `parts`:

| Operation | knkeditor | fieldkit's answer |
|---|---|---|
| `ValidateResolvedValue` | `Validator.Validate`, the stored JSON text scanned for `invalid-json-value` first | `invalid_rich_text` at the Field's path + knkeditor's JSON Pointer, knkeditor's code in `params.code`; `ValidateValue` (no Resolved Spec) validates against the vocabulary alone |
| `Edges` | `Edges` | `link` (Content, Anchor), `footnote` (Content), `media` (Asset), at the Field |
| `Texts` | `Text`, with the Text Type's Symbol Set | its reading text |
| Compare | `Compare` | `equal` is `unchanged`; detail is its `Comparison` unchanged |
| Merge | `NewMerger(...).MergeJSON` | conflicts are node ids below the Field's path |
| `Resolve` | `ParseTextType`, `CompareVersions` | a `text_type` part must parse (`resolve_invalid_release`); `vocabulary` is the highest `minimumVocabularyVersion` |


**TS does not** — `/schema` has no dependency on `@knkcms/knkeditor-vocabulary`, whose peer is `@tiptap/pm`. TS checks a rich_text value's shape only (an object), yields no text or edges for it, and computes `vocabulary` itself. The shared fixtures that need knkeditor's answers are marked `goOnly` (`conformance/README.md`). Only `/rich-text` imports the vocabulary package, for the editor.

### The editor's documents pass Go (#278)

`conformance/unreleased/validate-value/rich-text-saved-by-editor.json` holds a document **the knkeditor-backed field saved**: `knk-rich-text-field.test.tsx` edits a document under a Text Type from a Resolved Spec's `parts`, builds the whole fixture from what the form holds, and compares it with the committed file; Go's `ValidateResolvedValue` replays that file under the same Text Type (`go/conformance_test.go`). So the TS test pins the file to the editor's output, and Go pins the file to knkeditor's validation — neither side runs the other's toolchain.

When a knkeditor bump changes what the editor saves, the TS test fails with the diff; regenerate with `FIELDKIT_UPDATE_FIXTURES=1 npx vitest run src/rich-text` and let `npm run verify:go` judge the new document. The only normalisation is the node ids, which knkeditor mints at random: they are renumbered in document order, which keeps what Go checks of them — every block carries one, no two alike.

## The deprecated `/rich-text-spec` layer

> **Deprecated in 0.18, removed in 0.19 (ADR-0026).** Text Types replace it: knkeditor owns the vocabulary and generates the option forms, blueprinthub owns Text Type Releases, and a `rich_text` Field pins one in `settings.text_type`. What follows describes that retiring layer, not the integration. Migration: [`migration-0.18.md`](migration-0.18.md#deprecations).

### Fieldkit's EditorSpec Types

Defined in `src/rich-text-spec/types.ts`:

```ts
interface EditorSpec {
  id: string;
  name: string;
  description?: string;
  page_width?: number;              // mm, for print-oriented editing
  nodes: Record<string, NodeOptions>;  // key = enabled node ID, value = settings
  marks: Record<string, NodeOptions>;  // key = enabled mark ID, value = settings
}

interface EditorNodePlugin {
  id: string;                       // MUST match TipTap extension name
  name: string;                     // Display label
  description: string;
  category: EditorNodeCategory;     // "formatting" | "structure" | "media" | "reference" | "special"
  isMark: boolean;                  // true → stored in spec.marks; false → spec.nodes
  defaultEnabled: boolean;
  settingsSpec?: Field[];           // Configurable options (uses fieldkit's own Field type)
  defaultSettings?: NodeOptions;
  icon?: React.ComponentType<{ size?: number | string }>;
}

type NodeOptions = { [key: string]: unknown };
```

**Data contract:** Presence of a plugin ID as a key in `spec.nodes` or `spec.marks` means it is **enabled**. Removing the key disables it.

### Built-In Plugins (18 total)

#### Marks (6) — `isMark: true`, category `"formatting"`

| Plugin | `id` | Default Enabled |
|---|---|---|
| `boldPlugin` | `"bold"` | yes |
| `italicPlugin` | `"italic"` | yes |
| `underlinePlugin` | `"underline"` | yes |
| `strikePlugin` | `"strike"` | no |
| `subscriptPlugin` | `"subscript"` | no |
| `superscriptPlugin` | `"superscript"` | no |

#### Structure Nodes (8) — category `"structure"`

| Plugin | `id` | Default Enabled | Settings |
|---|---|---|---|
| `headingPlugin` | `"heading"` | yes | `levels` field (default `[1,2,3]`) |
| `paragraphPlugin` | `"paragraph"` | yes | — |
| `blockquotePlugin` | `"blockquote"` | no | — |
| `bulletListPlugin` | `"bulletList"` | yes | — |
| `orderedListPlugin` | `"orderedList"` | yes | — |
| `tablePlugin` | `"table"` | no | — |
| `horizontalRulePlugin` | `"horizontalRule"` | no | — |
| `codeBlockPlugin` | `"codeBlock"` | no | — |

#### Media/Reference/Special Nodes (4)

| Plugin | `id` | Category | Default Enabled |
|---|---|---|---|
| `imagePlugin` | `"image"` | `"media"` | no |
| `contentLinkPlugin` | `"contentLink"` | `"reference"` | no |
| `weblinkPlugin` | `"weblink"` | `"reference"` | yes |
| `footnotePlugin` | `"footnote"` | `"special"` | no |

#### Convenience arrays

- `builtInMarkPlugins` — 6 marks
- `builtInCoreNodePlugins` — 8 structure nodes
- `builtInMediaNodePlugins` — 4 media/reference/special
- `builtInNodePlugins` — core + media (12)
- `builtInEditorPlugins` — all 18

### ID Alignment Between Fieldkit and knkeditor

The `EditorNodePlugin.id` must match the TipTap extension `name` for the planned integration to work. Current alignment status:

| Fieldkit ID | knkeditor Extension Name | Status |
|---|---|---|
| `"bold"` | `"bold"` | Aligned |
| `"italic"` | `"italic"` | Aligned |
| `"underline"` | `"underline"` | Aligned |
| `"strike"` | `"strike"` | Aligned |
| `"subscript"` | `"sub"` | **MISALIGNED** |
| `"superscript"` | `"super"` | **MISALIGNED** |
| `"heading"` | `"heading"` | Aligned |
| `"paragraph"` | `"paragraph"` | Aligned |
| `"weblink"` | `"weblink"` | Aligned |
| `"contentLink"` | `"contentLink"` | Aligned |
| `"footnote"` | `"footnote"` | Aligned |
| `"table"` | `"table"` | Aligned (needs row/header/cell companions) |
| `"horizontalRule"` | `"horizontalLine"` | **MISALIGNED** |
| `"image"` | `"image"` | Aligned (needs wrapper nodes) |
| `"bulletList"` | — | No knkeditor extension (use TipTap standard) |
| `"orderedList"` | — | No knkeditor extension (use TipTap standard) |
| `"blockquote"` | — | No knkeditor extension (use TipTap standard) |
| `"codeBlock"` | — | No knkeditor extension (use TipTap standard) |

