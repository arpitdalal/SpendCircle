import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

const reactCompilerRules = reactHooks.configs.flat["recommended-latest"];

// Narrow compiler-safety gate only — Biome remains the primary linter/formatter.
// See ADR 0025 and vite.config.ts for the "use no memo" escape hatch.
export default [
  {
    ignores: ["**/node_modules/**", "**/build/**", "**/.react-router/**", "**/*.d.ts"],
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: reactCompilerRules.plugins,
    rules: {
      ...reactCompilerRules.rules,
      // Silent compiler bailouts must fail CI, not warn.
      "react-hooks/unsupported-syntax": "error",
    },
  },
];
