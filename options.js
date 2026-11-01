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
    // Muss direkt im Klick-Handler passieren (vor jedem anderen await),
    // sonst lehnt Firefox die Anfrage ab.
    const granted = await browser.permissions.request(HOST_PERMISSION);
    if (!granted) {
      box.checked = false;
      return;
    }
  }
  await browser.storage.local.set({ [key]: box.checked });

  // Keine Klick-Option mehr aktiv -> Zugriff auf alle Webseiten wieder abgeben
  if (!KEYS.some((k) => checkbox(k).checked)) {
    await browser.permissions.remove(HOST_PERMISSION);
  }
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
  }

  // Änderungen von außen übernehmen (z. B. Berechtigung in about:addons entzogen)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of KEYS) {
      if (key in changes) checkbox(key).checked = changes[key].newValue ?? DEFAULT_SETTINGS[key];
    }
  });
}

init();
