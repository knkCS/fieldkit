import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Deduplicate React: ensure anker's linked package uses fieldkit's React
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-runtime",
      ),
      "react/jsx-dev-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-dev-runtime",
      ),
      "@tanstack/react-table": path.resolve(
        __dirname,
        "node_modules/@tanstack/react-table",
      ),
      "@chakra-ui/react": path.resolve(
        __dirname,
        "node_modules/@chakra-ui/react",
      ),
      "react-hook-form": path.resolve(
        __dirname,
        "node_modules/react-hook-form",
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    passWithNoTests: true,
    // Agent worktrees live inside the checkout; their copies of the suite
    // are theirs to run, never this checkout's.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
