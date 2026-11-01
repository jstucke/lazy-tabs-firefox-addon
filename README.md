<img src="icons/icon.svg" width="96" alt="">

# Lazy Background Tabs

A Firefox add-on that opens tabs in the background **without loading them** until you click on them.
Useful for opening many tabs at once (e.g. a whole bookmark folder) without hogging CPU, memory and bandwidth.

## Features

- **Bookmark folders:** right-click a folder → *Open All in Lazy Tabs*.
  Like Firefox's own *Open All in Tabs*, but the tabs are only loaded when selected.
- **Single bookmarks:** right-click → *Open in Lazy Tab*.
- **Links:** right-click → *Open Link in Lazy Tab*.
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
2. Click *Load Temporary Add-on…* and select `manifest.json`

Or use [web-ext](https://github.com/mozilla/web-ext):

```bash
npx web-ext run      # start Firefox with the add-on, auto-reload on changes
npx web-ext lint     # validate
npx web-ext build    # create ZIP in web-ext-artifacts/
```

(With Node.js < 20 use `npx web-ext@7.12.0 …`.)

## How it works

The add-on uses `browser.tabs.create({ discarded: true, … })`, which creates a tab in the unloaded state.
If middle-click or Ctrl+click is enabled, a content script is registered on demand (`contentScripts.register`)
that intercepts these clicks on links and asks the background script to open them.

## License

[Mozilla Public License 2.0](LICENSE)
