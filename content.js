/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

// Das Skript wird sowohl per contentScripts.register als auch beim Einschalten
// in schon offene Tabs eingefügt – doppelte Listener verhindern.
(() => {
  if (globalThis.lazyBackgroundTabsLoaded) return;
  globalThis.lazyBackgroundTabsLoaded = true;

  // Fängt Mittelklick und Strg+Klick (Mac: Cmd+Klick) auf Links ab und lässt das
  // Hintergrundskript stattdessen einen entladenen Tab öffnen.
  // Shift/Alt-Kombinationen (Vordergrund-Tab, neues Fenster, Speichern) bleiben
  // beim normalen Firefox-Verhalten.

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
    // SVG-<a> hat kein String-href, daher über das Attribut auflösen
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
        // Add-on wurde z. B. neu geladen und dieses Skript ist verwaist –
        // der Klick soll trotzdem nicht verloren gehen.
        window.open(url.href, "_blank", "noopener");
      });
  }

  // Einstellungen laden und Änderungen sofort übernehmen (ohne Seiten-Reload).
  // Bewusst ohne settings.js: Das Script wird als einzelne Datei eingefügt, und
  // ohne erteilte Berechtigung sind beide Optionen ohnehin aus, also false als Startwert.
  const settings = { middleClick: false, ctrlClick: false };
  browser.storage.local.get(settings).then((stored) => Object.assign(settings, stored));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue ?? false;
    }
  });

  // Bubble-Phase: Seiten, die den Klick selbst behandeln (preventDefault),
  // haben Vorrang.
  window.addEventListener("auxclick", (e) => handle(e, settings.middleClick && e.button === 1));
  window.addEventListener("click", (e) =>
    handle(e, settings.ctrlClick && e.button === 0 && (e.ctrlKey || e.metaKey)),
  );
})();
