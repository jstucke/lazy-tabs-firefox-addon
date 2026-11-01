/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Runs tasks one after another. The returned promise resolves or rejects with
 * the result of the respective task; an error does not block the following
 * tasks.
 */
function createQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
}

// Serialize tab creation so that quick successive clicks keep their order
const enqueueTab = createQueue();

const logOpenError = (err) => console.error("Could not open lazy tab:", err);

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

// Adjust the menu title for bookmark vs. folder
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
    // e.g. root folder – just leave the menu unchanged
  }
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) {
    openLazyTab(info.linkUrl, info.linkText, tab).catch(logOpenError);
  } else if (info.menuItemId === BOOKMARK_MENU_ID && info.bookmarkId) {
    openBookmarkLazy(info.bookmarkId).catch(logOpenError);
  }
});

/** Like Firefox's "Open All in Tabs": only the folder's direct bookmarks. */
async function openBookmarkLazy(bookmarkId) {
  const [node] = await browser.bookmarks.get(bookmarkId);
  const items =
    node.type === "folder"
      ? (await browser.bookmarks.getChildren(bookmarkId)).filter(
          (c) => c.type === "bookmark" && c.url,
        )
      : [node];

  const win = await browser.windows.getLastFocused();
  // A failing bookmark must not prevent the others from opening
  const results = await Promise.allSettled(
    items.map((item) => enqueueTab(() => createLazyTab(item.url, item.title, null, win.id))),
  );
  for (const r of results) {
    if (r.status === "rejected") logOpenError(r.reason);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "openLazy" && message.url && sender.tab) {
    // On error the promise rejects and the content script opens the link
    // itself instead – so the click is not lost.
    return openLazyTab(message.url, message.title, sender.tab).then(() => true);
  }
  return undefined;
});

// --- Tab order like Firefox itself -----------------------------------------
// Several links opened one after another from the same tab end up behind the
// current tab in click order. Switching tabs starts a new chain.

/** openerTabId -> tab we inserted last */
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
      // Tab no longer exists
    }
  }
  // Fetch the opener's index again, it may have moved since the click
  const opener = await browser.tabs.get(openerTab.id);
  return opener.index + 1;
}

function openLazyTab(url, title, openerTab) {
  return enqueueTab(() => createLazyTab(url, title, openerTab));
}

/**
 * With openerTab: insert next to the opener (links).
 * Without openerTab: append at the end of windowId (bookmarks).
 */
async function createLazyTab(url, title, openerTab, windowId) {
  const base = { url, active: false };
  if (openerTab) {
    base.windowId = openerTab.windowId;
    base.index = await insertionIndex(openerTab);
    base.openerTabId = openerTab.id;
    if (openerTab.cookieStoreId) {
      base.cookieStoreId = openerTab.cookieStoreId; // same container
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
    // Some URLs (about:, file:, …) cannot be created discarded –
    // then at least open them normally in the background.
    console.warn("Cannot create discarded tab, opening normally:", err);
    created = await browser.tabs.create(base);
  }
  if (openerTab) lastInserted.set(openerTab.id, created.id);
}

// --- Content script only when needed ---------------------------------------
// Middle-click/Ctrl+click need a content script on all pages and therefore the
// <all_urls> permission. It is optional: the options page requests it when an
// option is switched on. Here the script is (un)registered accordingly and the
// permission is released again once the last option is switched off.

const CONTENT_SCRIPT = "content.js";
let registration = null;
const enqueueSync = createQueue();

/**
 * @param {object} [opts]
 * @param {boolean} [opts.startup] browser start: only inject into active tabs
 * @param {boolean} [opts.settingsChanged] triggered by a changed setting
 */
function syncContentScript(opts = {}) {
  return enqueueSync(() => doSync(opts)).catch((err) =>
    console.error("Content script sync failed:", err),
  );
}

async function doSync({ startup = false, settingsChanged = false }) {
  const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
  const wanted = settings.middleClick || settings.ctrlClick;
  const granted = await browser.permissions.contains(HOST_PERMISSION);

  if (wanted && !granted) {
    // Permission missing (e.g. revoked in about:addons): switch the options
    // off so that the options page and the behavior match.
    await browser.storage.local.set({ middleClick: false, ctrlClick: false });
    return; // storage.onChanged triggers the next sync
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

  // Only when an option was just switched off – not on permissions.onAdded,
  // because when switching on, the permission is granted before the setting is
  // stored. Access granted manually in about:addons is kept.
  if (!wanted && granted && settingsChanged) {
    await browser.permissions.remove(HOST_PERMISSION);
  }
}

/**
 * Registered scripts only apply on the next page load – inject into open tabs.
 * On browser start only into the active tabs, so session restore is not slowed
 * down; the other tabs get the script when they (re)load.
 */
async function injectIntoOpenTabs({ activeOnly }) {
  const tabs = await browser.tabs.query(activeOnly ? { active: true } : { discarded: false });
  await Promise.all(
    tabs.map((tab) =>
      browser.tabs.executeScript(tab.id, { file: CONTENT_SCRIPT, allFrames: true }).catch(() => {
        // Protected pages (about:, addons.mozilla.org, …) – ignore
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
