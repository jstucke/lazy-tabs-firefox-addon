# Lazy Background Tabs

A Firefox add-on that opens tabs in the background **without loading them** until you click on them.
Useful for opening many tabs at once (e.g. a whole bookmark folder) without hogging CPU, memory and bandwidth.

## Features

- **Bookmark folders:** right-click a folder → *Alle in Lazy-Tabs öffnen* (open all in lazy tabs).
  Like Firefox's own *Open All in Tabs*, but the tabs are only loaded when selected.
- **Single bookmarks:** right-click → *In Lazy-Tab öffnen*.
- **Links:** right-click → *Link in Lazy-Tab öffnen*.
- **Optional:** middle-click and/or Ctrl+click on links open lazy tabs (configurable in the add-on settings,
  middle-click is off by default).

New tabs are placed next to the current tab in click order and keep the current tab's container.

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
A content script intercepts middle-/Ctrl-clicks on links (only if enabled) and asks the background script to open them.

## License

[Mozilla Public License 2.0](LICENSE)
