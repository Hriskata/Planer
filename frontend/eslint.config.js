import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// Minimal setup — flags real bugs (unused vars, undefined refs, Svelte-specific
// footguns like reactivity mistakes) without imposing a formatting style opinion on
// top of a large existing codebase. Not wired into CI (see CLAUDE.md — no CI exists
// yet); run manually via `npm run lint`.
export default [
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    // Everything in this repo runs in a browser (the app itself, PWA service worker,
    // Electron-widget renderer via widget.html) EXCEPT the two Node-side config/tooling
    // files and the CommonJS test-backend script, overridden below.
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
  {
    files: ['vite.config.js', 'playwright.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.commonjs } },
  },
  {
    ignores: ['dist/', 'dev-dist/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
];
