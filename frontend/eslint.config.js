import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // API payloads are progressively typed at feature boundaries. Keeping this
      // rule disabled avoids hiding valid legacy integration shapes behind casts.
      "@typescript-eslint/no-explicit-any": "off",
      // Provider and rendering modules intentionally export hooks and helpers
      // alongside components; Vite still preserves fast refresh for consumers.
      "react-refresh/only-export-components": "off",
    },
  },
]);
