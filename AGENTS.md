# AGENTS.md

Firefox add-on (Manifest V2, no build step) that opens tabs discarded, so they load only when selected.
See `README.md` for features and the release process.

## Commits

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): summary`, e.g. `fix(options): keep checkbox state after permission prompt`.
  Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `ci`, `build`, `chore`.
- Stage files explicitly by path. The working tree often holds the maintainer's own files
  (screenshots, notes) that must stay out of the repository.

## Checks

- All checks are pre-commit hooks (`.pre-commit-config.yaml`); CI runs the same hooks.
  Finish every change with `pre-commit run --all-files` passing.
- `--all-files` only sees files known to git: `git add` new files first.
- Prettier rewrites files in place; re-stage after it runs.
- The system Node.js may be older than 20, which `web-ext` requires. The pre-commit hooks bring
  their own Node 24; for `npm` scripts use Node 20+.
- The `web-ext` version is pinned twice: `package.json` (build) and `.pre-commit-config.yaml`
  (lint). Update both together.

## Code conventions

- New `.js` / `.html` files start with the MPL-2.0 header used in the existing files.
- Code comments and log messages are in English.
- Every user-facing string lives in `_locales/*/messages.json` (English is the default locale).
  Add each new key to every locale; the `check-locales` hook enforces this.
- GitHub Actions are pinned to a full commit SHA with a `# vX.Y.Z` comment.

## Permission model (easy to break)

- `<all_urls>` is an _optional_ permission, needed only for the middle-click / Ctrl+click options.
  Both options therefore default to `false`; enabling one requests the permission.
- `browser.permissions.request()` must be the first `await` in the user-input handler, otherwise
  Firefox rejects it.
- The background script releases the permission only when a setting was switched off (storage
  change), never on `permissions.onAdded`: when enabling, the permission is granted _before_ the
  setting is stored.
- `content.js` is registered at runtime (`contentScripts.register`) and also injected into open
  tabs, so it is self-contained (no `settings.js`) and guards against double injection.
- The manifest declares that no data is collected (`data_collection_permissions`). Any feature
  that sends data anywhere must update that declaration and the AMO listing.

## Manual testing

- There are no automated tests. Headless Firefox automation (WebDriver BiDi / Puppeteer) cannot
  open `moz-extension://` pages, so the options page has to be tested by hand.
- Load via `about:debugging#/runtime/this-firefox` → _Load Temporary Add-on…_ → `manifest.json`.
- After changing permissions in the manifest: remove the temporary add-on, load it again and
  reopen `about:addons`; otherwise Firefox may show a stale options page.
