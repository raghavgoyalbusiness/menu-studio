// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/cdk.out/**",
      ".data/**",
      "packages/design-system/fonts/**",
      "**/__snapshots__/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { console: "readonly", process: "readonly", fetch: "readonly", window: "readonly", document: "readonly", navigator: "readonly", localStorage: "readonly", sessionStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", requestAnimationFrame: "readonly", crypto: "readonly", fetchPriority: "readonly", Buffer: "readonly", URL: "readonly", URLSearchParams: "readonly", FormData: "readonly", File: "readonly", Blob: "readonly", Headers: "readonly", Response: "readonly", Request: "readonly", AbortSignal: "readonly", Intl: "readonly", btoa: "readonly", atob: "readonly", structuredClone: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", destructuredArrayIgnorePattern: "^_" }],
      "@typescript-eslint/require-await": "off",
      // Zustand selectors hand back plain functions; this rule only adds noise for them.
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Never inject HTML: owner text is rendered as text." },
        { selector: "Literal[value=/^claude-(opus|sonnet|haiku|fable)/]", message: "The model id belongs in apps/api/src/config/ai.ts only." },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "react-hooks/exhaustive-deps": "warn" },
  },
  {
    // The renderer must stay pure so print, PNG and QR output are identical.
    files: ["packages/renderer/src/**/*.{ts,tsx}"],
    ignores: ["packages/renderer/src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: "The renderer is pure: take the time as the `now` prop." },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: "The renderer is deterministic: no randomness." },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "The renderer is pure: take the time as the `now` prop." },
        { selector: "CallExpression[callee.name='fetch']", message: "The renderer never fetches." },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Never inject HTML." },
      ],
    },
  },
  {
    files: ["apps/api/src/config/ai.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**", "e2e/**", "scripts/**", "evals/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off", "@typescript-eslint/no-floating-promises": "off", "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: null } },
  },
);
