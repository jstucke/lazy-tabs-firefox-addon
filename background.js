/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const MENU_ID = "open-link-lazy";

browser.menus.create({
  id: MENU_ID,
  title: browser.i18n.getMessage("menuOpenLink"),
  contexts: ["link"],
});

const BOOKMARK_MENU_ID = "open-bookmark-lazy";

browser.menus.create({
  id: BOOKMARK_MENU_ID,
  title: browser.i18n.getMessage("menuOpenBookmark"),
  contexts: ["bookmark"],
});

// Menütext je nach Lesezeichen / Ordner anpassen
browser.menus.onShown.addListener(async (info) => {
  if (!info.contexts.includes("bookmark") || !info.bookmarkId) return;
  try {
    const [node] = await browser.bookmarks.get(info.bookmarkId);
    const isFolder = node.type === "folder";
    const isSeparator = node.type === "separator";
    await browser.menus.update(BOOKMARK_MENU_ID, {
      title: browser.i18n.getMessage(isFolder ? "menuOpenFolder" : "menuOpenBookmark"),
      visible: !isSeparator,
    });
    browser.menus.refresh();
  } catch (_) {
    // z. B. Wurzelordner – Menü einfach unverändert lassen
  }
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) {
    openLazyTab(info.linkUrl, info.linkText, tab);
  } else if (info.menuItemId === BOOKMARK_MENU_ID && info.bookmarkId) {
    openBookmarkLazy(info.bookmarkId);
  }
});

/** Wie Firefox' „Alle in Tabs öffnen“: nur direkte Lesezeichen des Ordners. */
async function openBookmarkLazy(bookmarkId) {
  const [node] = await browser.bookmarks.get(bookmarkId);
  const items =
    node.type === "folder"
      ? (await browser.bookmarks.getChildren(bookmarkId)).filter((c) => c.type === "bookmark" && c.url)
      : [node];

  const win = await browser.windows.getLastFocused();
  for (const item of items) {
    queue = queue
      .then(() => createLazyTab(item.url, item.title, null, win.id))
      .catch((err) => console.error("Lazy-Tab konnte nicht geöffnet werden:", err));
  }
  return queue;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "openLazy" && message.url && sender.tab) {
    return openLazyTab(message.url, message.title, sender.tab).then(() => true);
  }
  return undefined;
});

// --- Tab-Reihenfolge wie bei Firefox selbst -------------------------------
// Mehrere Links nacheinander aus demselben Tab geöffnet landen in Klick-
// Reihenfolge hinter dem aktuellen Tab. Beim Tab-Wechsel beginnt die Kette neu.

/** openerTabId -> zuletzt von uns eingefügter Tab */
const lastInserted = new Map();

browser.tabs.onActivated.addListener(() => lastInserted.clear());
browser.tabs.onRemoved.addListener((tabId) => {
  lastInserted.delete(tabId);
  for (const [opener, inserted] of lastInserted) {
    if (inserted === tabId) lastInserted.delete(opener);
  }
});

async function insertionIndex(openerTab) {
  const lastId = lastInserted.get(openerTab.id);
  if (lastId !== undefined) {
    try {
      const last = await browser.tabs.get(lastId);
      if (last.windowId === openerTab.windowId) return last.index + 1;
    } catch (_) {
      // Tab existiert nicht mehr
    }
  }
  // Index des Openers frisch holen, er kann sich seit dem Klick verschoben haben
  const opener = await browser.tabs.get(openerTab.id);
  return opener.index + 1;
}

// Aufrufe serialisieren, damit schnelle Mehrfachklicks die Reihenfolge behalten
let queue = Promise.resolve();

function openLazyTab(url, title, openerTab) {
  queue = queue
    .then(() => createLazyTab(url, title, openerTab))
    .catch((err) => console.error("Lazy-Tab konnte nicht geöffnet werden:", err));
  return queue;
}

/**
 * Mit openerTab: neben dem Opener einfügen (Links).
 * Ohne openerTab: am Ende von windowId anhängen (Lesezeichen).
 */
async function createLazyTab(url, title, openerTab, windowId) {
  const base = { url, active: false };
  if (openerTab) {
    base.windowId = openerTab.windowId;
    base.index = await insertionIndex(openerTab);
    base.openerTabId = openerTab.id;
    if (openerTab.cookieStoreId) {
      base.cookieStoreId = openerTab.cookieStoreId; // gleicher Container
    }
  } else {
    base.windowId = windowId;
  }

  let created;
  try {
    created = await browser.tabs.create({
      ...base,
      discarded: true,
      title: (title && title.trim()) || url,
    });
  } catch (err) {
    // Manche URLs (about:, file:, …) dürfen nicht entladen erstellt werden –
    // dann wenigstens normal im Hintergrund öffnen.
    console.warn("Entladener Tab nicht möglich, öffne normal:", err);
    created = await browser.tabs.create(base);
  }
  if (openerTab) lastInserted.set(openerTab.id, created.id);
}

// --- Content-Script nur bei Bedarf -----------------------------------------
// Mittelklick/Strg+Klick brauchen ein Content-Script auf allen Seiten und damit
// die Berechtigung <all_urls>. Die ist optional: Die Einstellungsseite fragt
// beim Einschalten danach, hier wird das Script passend (de)registriert.

const CONTENT_SCRIPTS = [{ file: "settings.js" }, { file: "content.js" }];
let registration = null;
let syncQueue = Promise.resolve();

function syncContentScript() {
  syncQueue = syncQueue.then(doSync).catch((err) => console.error("Content-Script-Sync fehlgeschlagen:", err));
  return syncQueue;
}

async function doSync() {
  const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
  const wanted = settings.middleClick || settings.ctrlClick;
  const granted = await browser.permissions.contains(HOST_PERMISSION);

  if (wanted && !granted) {
    // Berechtigung fehlt (z. B. in about:addons entzogen): Optionen abschalten,
    // damit Einstellungsseite und Verhalten übereinstimmen.
    await browser.storage.local.set({ middleClick: false, ctrlClick: false });
    return; // storage.onChanged stößt den nächsten Sync an
  }

  if (wanted && !registration) {
    registration = await browser.contentScripts.register({
      matches: HOST_PERMISSION.origins,
      js: CONTENT_SCRIPTS,
      allFrames: true,
      runAt: "document_start",
    });
    await injectIntoOpenTabs();
  } else if (!wanted && registration) {
    await registration.unregister();
    registration = null;
  }
}

/** Registrierte Scripts greifen erst beim nächsten Laden – offene Tabs nachrüsten. */
async function injectIntoOpenTabs() {
  const tabs = await browser.tabs.query({ discarded: false });
  await Promise.all(
    tabs.map(async (tab) => {
      try {
        for (const { file } of CONTENT_SCRIPTS) {
          await browser.tabs.executeScript(tab.id, { file, allFrames: true });
        }
      } catch (_) {
        // Geschützte Seiten (about:, addons.mozilla.org, …) – ignorieren
      }
    }),
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) {
    syncContentScript();
  }
});
browser.permissions.onAdded.addListener(syncContentScript);
browser.permissions.onRemoved.addListener(syncContentScript);
syncContentScript();
