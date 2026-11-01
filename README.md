<img src="icons/icon.svg" width="96" alt="">

# Lazy Background Tabs

A Firefox add-on that opens tabs in the background **without loading them** until you click on them.
Useful for opening many tabs at once (e.g. a whole bookmark folder) without hogging CPU, memory and bandwidth.

## Features

- **Bookmark folders:** right-click a folder → _Open All in Lazy Tabs_.
  Like Firefox's own _Open All in Tabs_, but the tabs are only loaded when selected.
- **Single bookmarks:** right-click → _Open in Lazy Tab_.
- **Links:** right-click → _Open Link in Lazy Tab_.
- **Optional:** middle-click and/or Ctrl+click on links open lazy tabs (both off by default,
  enable them in the add-on settings).

New tabs are placed next to the current tab in click order and keep the current tab's container.

## Permissions

At install the add-on only asks for access to your bookmarks.
Access to all websites is requested only when you enable middle-click or Ctrl+click in the settings
(the add-on needs it to detect clicks on links) and is released again when both are turned off.

## Languages

English (default) and German. The UI follows Firefox's language setting.
To add a language, copy `_locales/en/messages.json` to `_locales/<code>/messages.json` and translate the `message` values.

## Development

Load the add-on temporarily:

1. Open `about:debugging#/runtime/this-firefox`
2. Click _Load Temporary Add-on…_ and select `manifest.json`

Or use [web-ext](https://github.com/mozilla/web-ext) (requires Node.js 20+):

```bash
npm ci               # install web-ext (pinned in package-lock.json)
npm start            # start Firefox with the add-on, auto-reload on changes
npm run build        # create ZIP in web-ext-artifacts/
```

### Checks

All checks are [pre-commit](https://pre-commit.com) hooks: ESLint, Prettier, a translation
consistency check, `web-ext lint`, GitHub Actions validation ([zizmor](https://docs.zizmor.sh)),
spelling and general file hygiene. They bring their own Node.js, so only pre-commit is needed:

```bash
pre-commit install          # run the checks automatically before every commit
pre-commit run --all-files  # run them manually
```

CI runs the same hooks for every push and pull request.

## Releasing

1. Bump `version` in `manifest.json` and commit.
2. Create a GitHub release with the tag `v<version>` (e.g. `v1.2.0`).
3. The release workflow checks that tag and manifest version match, builds the ZIP
   and attaches it to the release – ready to upload to addons.mozilla.org.

## How it works

The add-on uses `browser.tabs.create({ discarded: true, … })`, which creates a tab in the unloaded state.
If middle-click or Ctrl+click is enabled, a content script is registered on demand (`contentScripts.register`)
that intercepts these clicks on links and asks the background script to open them.

## License

[Mozilla Public License 2.0](LICENSE)
