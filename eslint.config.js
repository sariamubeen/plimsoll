import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Policy constraints from PROMPT §2.3 are enforced here rather than by review, so a
 * violation fails CI instead of relying on someone noticing it in a diff.
 */
const POLICY_RULES = {
  // MV3 forbids remotely hosted code. eval and new Function are also the fastest
  // route to a Chrome Web Store rejection.
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',

  'no-restricted-globals': [
    'error',
    {
      name: 'localStorage',
      message: 'Use the typed chrome.storage.local wrapper in packages/core/storage.ts (§2.3).',
    },
    {
      name: 'sessionStorage',
      message: 'Use the typed chrome.storage.local wrapper in packages/core/storage.ts (§2.3).',
    },
  ],

  'no-restricted-syntax': [
    'error',
    {
      // No telemetry, no analytics, no backend. The only network calls permitted are
      // same-origin requests to the provider the user is already signed into, and
      // those live in packages/adapters/ where this rule is relaxed.
      selector: 'CallExpression[callee.name="fetch"]',
      message:
        'Network calls are confined to packages/adapters/. No telemetry, no analytics, no backend (§2.3).',
    },
    {
      selector: 'NewExpression[callee.name="XMLHttpRequest"]',
      message: 'Network calls are confined to packages/adapters/ (§2.3).',
    },
    {
      selector: 'CallExpression[callee.object.name="navigator"][callee.property.name="sendBeacon"]',
      message: 'sendBeacon is telemetry by definition and is never permitted (§2.3).',
    },
    {
      // Layout tracking uses ResizeObserver / IntersectionObserver, never polling (§6.1).
      selector: 'CallExpression[callee.name="setInterval"]',
      message:
        'Use ResizeObserver / IntersectionObserver for layout tracking, not setInterval (§6.1).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['fixtures/**', 'node_modules/**', '.output/**', '.wxt/**', 'dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...POLICY_RULES,
      // "No `any` without a justifying comment" (§3) — the comment is the escape
      // hatch, applied per-line with an eslint-disable that has to state a reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // The adapter layer is the ONLY place a network call may appear. Everything else
    // in POLICY_RULES still applies here.
    files: ['packages/adapters/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="setInterval"]',
          message: 'Use observers, not polling (§6.1).',
        },
      ],
    },
  },
  {
    // Config files are plain JS and are not part of the TS project, so the
    // type-aware rules cannot run against them.
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Build and capture tooling runs in Node, outside the extension sandbox.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'eslint.config.js'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
);
