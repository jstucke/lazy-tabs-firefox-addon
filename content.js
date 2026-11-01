/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

// The script is injected both via contentScripts.register and, when an option
// is switched on, into already open tabs – prevent duplicate listeners.
(() => {
  if (globalThis.lazyBackgroundTabsLoaded) return;
  globalThis.lazyBackgroundTabsLoaded = true;

  // Intercepts middle-click and Ctrl+click (Mac: Cmd+click) on links and lets the
  // background script open a discarded tab instead.
  // Shift/Alt combinations (foreground tab, new window, save) keep the normal
  // Firefox behavior.

  function findLink(event) {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue;
      const name = node.localName;
      if ((name === "a" || name === "area") && node.hasAttribute("href")) {
        return node;
      }
    }
    return null;
  }

  function linkUrl(link) {
    // SVG <a> has no string href, so resolve it via the attribute
    const raw = typeof link.href === "string" ? link.href : link.getAttribute("href");
    try {
      return new URL(raw, document.baseURI);
    } catch (_) {
      return null;
    }
  }

  function handle(event, isOpenInTabClick) {
    if (!isOpenInTabClick || event.defaultPrevented) return;
    if (event.shiftKey || event.altKey) return;

    const link = findLink(event);
    if (!link || link.hasAttribute("download")) return;

    const url = linkUrl(link);
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return;

    event.preventDefault();
    event.stopPropagation();

    const title = (link.textContent || link.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    browser.runtime
      .sendMessage({ type: "openLazy", url: url.href, title })
      .catch(() => {
        // E.g. the add-on was reloaded and this script is orphaned, or opening
        // the lazy tab failed – the click must not be lost anyway.
        window.open(url.href, "_blank", "noopener");
      });
  }

  // Load the settings and apply changes immediately (without a page reload).
  // Deliberately without settings.js: the script is injected as a single file,
  // and without the granted permission both options are off anyway, so false
  // is the initial value.
  const settings = { middleClick: false, ctrlClick: false };
  browser.storage.local.get(settings).then((stored) => Object.assign(settings, stored));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue ?? false;
    }
  });

  // Bubble phase: pages that handle the click themselves (preventDefault)
  // take precedence.
  window.addEventListener("auxclick", (e) => handle(e, settings.middleClick && e.button === 1));
  window.addEventListener("click", (e) =>
    handle(e, settings.ctrlClick && e.button === 0 && (e.ctrlKey || e.metaKey)),
  );
})();
