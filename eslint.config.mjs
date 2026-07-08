import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Warn on console.* in app code — server logs are production output, not a debug scratch pad
      'no-console': 'warn',
      // Force proper types; `as unknown as { ... }` casts are fine, bare `any` is not
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Worker is a long-running Node.js process — console is its intentional logging mechanism
    files: ['worker/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Tests legitimately use console for debug output and test assertions
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: { 'no-console': 'off' },
  },
]);

export default eslintConfig;
