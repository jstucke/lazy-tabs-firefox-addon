/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Führt Aufgaben nacheinander aus. Das zurückgegebene Promise liefert das
 * Ergebnis bzw. den Fehler der jeweiligen Aufgabe; ein Fehler blockiert die
 * folgenden Aufgaben nicht.
 */
function createQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
}

// Tab-Erstellung serialisieren, damit schnelle Mehrfachklicks die Reihenfolge behalten
const enqueueTab = createQueue();

const logOpenError = (err) => console.error("Lazy-Tab konnte nicht geöffnet werden:", err);

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
    openLazyTab(info.linkUrl, info.linkText, tab).catch(logOpenError);
  } else if (info.menuItemId === BOOKMARK_MENU_ID && info.bookmarkId) {
    openBookmarkLazy(info.bookmarkId).catch(logOpenError);
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
  // Ein fehlerhaftes Lesezeichen soll die übrigen nicht verhindern
  const results = await Promise.allSettled(
    items.map((item) => enqueueTab(() => createLazyTab(item.url, item.title, null, win.id))),
  );
  for (const r of results) {
    if (r.status === "rejected") logOpenError(r.reason);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "openLazy" && message.url && sender.tab) {
    // Bei einem Fehler lehnt das Promise ab, und das Content-Script öffnet den
    // Link stattdessen selbst – so geht der Klick nicht verloren.
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

function openLazyTab(url, title, openerTab) {
  return enqueueTab(() => createLazyTab(url, title, openerTab));
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
// beim Einschalten danach. Hier wird das Script passend (de)registriert und
// die Berechtigung wieder abgegeben, sobald die letzte Option ausgeschaltet wird.

const CONTENT_SCRIPT = "content.js";
let registration = null;
const enqueueSync = createQueue();

/**
 * @param {object} [opts]
 * @param {boolean} [opts.startup] Browserstart: nur aktive Tabs nachrüsten
 * @param {boolean} [opts.settingsChanged] Auslöser war eine geänderte Einstellung
 */
function syncContentScript(opts = {}) {
  return enqueueSync(() => doSync(opts)).catch((err) =>
    console.error("Content-Script-Sync fehlgeschlagen:", err),
  );
}

async function doSync({ startup = false, settingsChanged = false }) {
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
      js: [{ file: CONTENT_SCRIPT }],
      allFrames: true,
      runAt: "document_start",
    });
    await injectIntoOpenTabs({ activeOnly: startup });
  } else if (!wanted && registration) {
    await registration.unregister();
    registration = null;
  }

  // Nur wenn gerade eine Option ausgeschaltet wurde – nicht bei permissions.onAdded,
  // denn beim Einschalten wird die Berechtigung erteilt, bevor die Einstellung
  // gespeichert ist. Von Hand in about:addons erteilter Zugriff bleibt bestehen.
  if (!wanted && granted && settingsChanged) {
    await browser.permissions.remove(HOST_PERMISSION);
  }
}

/**
 * Registrierte Scripts greifen erst beim nächsten Laden – offene Tabs nachrüsten.
 * Beim Browserstart nur die aktiven Tabs, um die Sitzungswiederherstellung nicht
 * auszubremsen; die übrigen bekommen das Script beim (Neu-)Laden.
 */
async function injectIntoOpenTabs({ activeOnly }) {
  const tabs = await browser.tabs.query(activeOnly ? { active: true } : { discarded: false });
  await Promise.all(
    tabs.map((tab) =>
      browser.tabs.executeScript(tab.id, { file: CONTENT_SCRIPT, allFrames: true }).catch(() => {
        // Geschützte Seiten (about:, addons.mozilla.org, …) – ignorieren
      }),
    ),
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) {
    syncContentScript({ settingsChanged: true });
  }
});
browser.permissions.onAdded.addListener(() => syncContentScript());
browser.permissions.onRemoved.addListener(() => syncContentScript());
syncContentScript({ startup: true });
