import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "schema/index": "src/schema/index.ts",
    "editor/index": "src/editor/index.ts",
    "renderer/index": "src/renderer/index.ts",
    "table/index": "src/table/index.ts",
    "rich-text-spec/index": "src/rich-text-spec/index.ts",
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
    "@knkcms/knkeditor-editor",
  ],
  treeshake: true,
  sourcemap: true,
  minify: false,
});
