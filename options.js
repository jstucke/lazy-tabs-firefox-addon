/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

function localize() {
  document.documentElement.lang = browser.i18n.getUILanguage();
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = browser.i18n.getMessage(el.dataset.i18n);
  }
}

const KEYS = Object.keys(DEFAULT_SETTINGS);
const checkbox = (key) => document.getElementById(key);

async function onToggle(key) {
  const box = checkbox(key);
  if (box.checked) {
    // Must happen directly in the click handler (before any other await),
    // otherwise Firefox rejects the request.
    const granted = await browser.permissions.request(HOST_PERMISSION);
    if (!granted) {
      box.checked = false;
      return;
    }
  }
  // The background script releases the access to all websites again
  // as soon as the last option is switched off.
  await browser.storage.local.set({ [key]: box.checked });
}

async function init() {
  localize();
  const [settings, granted] = await Promise.all([
    browser.storage.local.get(DEFAULT_SETTINGS),
    browser.permissions.contains(HOST_PERMISSION),
  ]);
  for (const key of KEYS) {
    checkbox(key).checked = granted && settings[key];
    checkbox(key).addEventListener("change", () => onToggle(key));
    checkbox(key).disabled = false; // only usable now, otherwise an early click would be lost
  }

  // Apply external changes (e.g. permission revoked in about:addons)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of KEYS) {
      if (key in changes) checkbox(key).checked = changes[key].newValue ?? DEFAULT_SETTINGS[key];
    }
  });
}

init();
