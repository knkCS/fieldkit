import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "schema/index": "src/schema/index.ts",
    "editor/index": "src/editor/index.ts",
    "renderer/index": "src/renderer/index.ts",
    "table/index": "src/table/index.ts",
    "rich-text-spec/index": "src/rich-text-spec/index.ts",
    "publishing/index": "src/publishing/index.ts",
    "rich-text/index": "src/rich-text/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@chakra-ui/react",
    "@knkcs/anker",
    "react-hook-form",
    "@hookform/resolvers",
    "zod",
    "@tanstack/react-table",
    "@dnd-kit/core",
    "@dnd-kit/sortable",
    "react-router-dom",
    "react-i18next",
    "lucide-react",
    // knkeditor and what it brings — TipTap, i18next — are the /rich-text
    // subpath's optional peers (ADR-0026): never bundled, and imported by no
    // other subpath (scripts/verify-peers.ts checks the built dist).
    /^@knkcms\//,
    /^@tiptap\//,
  ],
  treeshake: true,
  sourcemap: true,
  minify: false,
});
