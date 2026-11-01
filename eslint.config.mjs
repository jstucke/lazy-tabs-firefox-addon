/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Deliberately without imports (no @eslint/js, no globals package): pre-commit
// installs ESLint in its own environment, where imports from this file would
// not resolve. The rules below are the relevant part of eslint:recommended.

const rules = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-compare-neg-zero": "error",
  "no-cond-assign": "error",
  "no-const-assign": "error",
  "no-constant-condition": "error",
  "no-dupe-args": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-loss-of-precision": "error",
  "no-redeclare": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-undef": "error",
  "no-unreachable": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unused-vars": ["error", { caughtErrors: "none" }],
  "no-use-before-define": ["error", { functions: false, variables: false }],
  "no-useless-catch": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  eqeqeq: "error",
};

const browserGlobals = {
  browser: "readonly", // WebExtension API
  console: "readonly",
  document: "readonly",
  window: "readonly",
  Element: "readonly",
  URL: "readonly",
};

export default [
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: browserGlobals },
    rules,
  },
  {
    // Defined in settings.js, which is loaded before these scripts
    files: ["background.js", "options.js"],
    languageOptions: {
      globals: { DEFAULT_SETTINGS: "readonly", HOST_PERMISSION: "readonly" },
    },
  },
  {
    // Only defines shared globals for other scripts
    files: ["settings.js"],
    rules: { "no-unused-vars": "off" },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { console: "readonly", process: "readonly" },
    },
    rules,
  },
];
