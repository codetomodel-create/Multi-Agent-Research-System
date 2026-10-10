import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright artifacts.
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // Playwright specs run in Node, not the browser, and the React hook rules
    // do not apply to them.
    files: ["e2e/**/*.js", "playwright.config.mjs"],
    languageOptions: {
      globals: { process: "readonly", Buffer: "readonly", console: "readonly" },
    },
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);

export default eslintConfig;
