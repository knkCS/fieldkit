# @knkcms/knkeditor Reference for Fieldkit

This document describes the knkeditor packages and how fieldkit's `rich-text-spec` layer integrates with them. Read this before modifying `EditorSpec`, `EditorNodePlugin`, node plugins, or the `RichTextField` renderer.

## Current Integration Status

Fieldkit currently has **zero runtime imports** from `@knkcms/knkeditor-editor`. The integration is designed and specified but not yet wired:

- The `rich-text-spec` subpath export is **complete** — it defines the configuration layer (`EditorSpec`, `EditorNodePlugin`, `EditorSpecEditor`)
- The `RichTextField` renderer is a **placeholder** (renders a `<textarea>`)
- `@knkcms/knkeditor-editor` is declared as an optional peer dependency with no version range

## Packages

| Package | Version | Purpose |
|---|---|---|
| `@knkcms/knkeditor-editor` | 0.0.85 | Main React editor component + `useKnkEditor` hook |
| `@knkcms/knkeditor-core` | 0.0.31 | Constants (`KnkNodeType`), utilities, types |
| `@knkcms/knkeditor-extension-*` | various | Individual TipTap extension packages (39 total) |

## Editor Component API

```ts
// from @knkcms/knkeditor-editor
interface EditorProps {
  content?: Content;                          // TipTap Content (JSON | string)
  extensions?: Extensions;                   // Array of TipTap Extension objects
  editor?: TiptapEditor;                     // Pass externally-created editor
  viewMode?: "default" | "minimal" | "plain";
  readOnly?: boolean;
  pageOptions?: PageOptions;                 // { width: number; margin: number } (mm)
  hideToolbarOnBlur?: boolean;
  toolbarPosition?: "static" | "fixed";
  maxEditorHeight?: string;
  onUpdate?: (props: { editor: TiptapEditor }) => void;
  onBlur?: (props: { editor: TiptapEditor }) => void;
}
```

**View modes:**
- `"default"` — Full toolbar, page-sized editor, side menu, all floating menus
- `"minimal"` — Minimal toolbar, bordered box, floating menus, no side menu or page sizing
- `"plain"` — Renders `editor.getText()` directly (read-only display)

**Exports:**
- `Editor` (named) / `KnkEditor` (default) — Main component
- `useKnkEditor(content, extensions, onUpdate?, onBlur?)` — Returns `{ editor }` TipTap instance
- Types: `EditorProps`, `PageOptions`, `AttributeDrawerTarget`, `Editor` (from `@tiptap/core`), `Node` (from `@tiptap/pm/model`)

## Fieldkit's EditorSpec Types

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

## Built-In Plugins (18 total)

### Marks (6) — `isMark: true`, category `"formatting"`

| Plugin | `id` | Default Enabled |
|---|---|---|
| `boldPlugin` | `"bold"` | yes |
| `italicPlugin` | `"italic"` | yes |
| `underlinePlugin` | `"underline"` | yes |
| `strikePlugin` | `"strike"` | no |
| `subscriptPlugin` | `"subscript"` | no |
| `superscriptPlugin` | `"superscript"` | no |

### Structure Nodes (8) — category `"structure"`

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

### Media/Reference/Special Nodes (4)

| Plugin | `id` | Category | Default Enabled |
|---|---|---|---|
| `imagePlugin` | `"image"` | `"media"` | no |
| `contentLinkPlugin` | `"contentLink"` | `"reference"` | no |
| `weblinkPlugin` | `"weblink"` | `"reference"` | yes |
| `footnotePlugin` | `"footnote"` | `"special"` | no |

### Convenience arrays

- `builtInMarkPlugins` — 6 marks
- `builtInCoreNodePlugins` — 8 structure nodes
- `builtInMediaNodePlugins` — 4 media/reference/special
- `builtInNodePlugins` — core + media (12)
- `builtInEditorPlugins` — all 18

## ID Alignment Between Fieldkit and knkeditor

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

## knkeditor Extension Pattern

Each extension follows this options pattern:

```ts
interface ExtensionOptions {
  html_attributes: Record<string, any>;        // CSS attributes for rendered HTML
  additional_attributes?: { key: string; value: string }[];  // Custom ProseMirror attrs
  alias?: string;                              // Override display name in toolbar
}
```

Extensions with `additional_attributes` automatically get `EmphasisMarkView` wired by `useKnkEditor`.

## Toolbar Auto-Discovery

The knkeditor toolbar uses `requiredExtensions` on each button definition. A button is only rendered when all its required extension names are registered in the active editor. This means the `extensions` array directly controls toolbar visibility — mapping naturally from `EditorSpec.nodes/marks` keys.

## Planned Integration Contract

The `RichTextField` renderer will:

1. Read `field.settings.editor_spec` (a string ID) to look up an `EditorSpec` via an adapter
2. Convert `EditorSpec.nodes` and `EditorSpec.marks` into a TipTap `Extensions` array
3. Pass `extensions` to the knkeditor `<Editor>` component
4. Map `view_mode`: `"full"` → `"default"`, `"compact"` → `"minimal"`
5. Wire `formField.value` as `content` and `formField.onChange` via `onUpdate`

The `editor_spec` stores only a string ID, implying the actual `EditorSpec` is fetched through an adapter — consistent with fieldkit's adapter pattern.

## Required Peer Dependencies for Consumers

To use the `rich_text` field type with a real editor:

```
@knkcms/knkeditor-editor ^0.0.85
@knkcms/knkeditor-core ^0.0.31
@tiptap/core ^3.20.0
@tiptap/pm ^3.20.0
@tiptap/react ^3.20.0
i18next
react-i18next
react-icons
```

Plus individual `@knkcms/knkeditor-extension-*` packages for each enabled node/mark.
