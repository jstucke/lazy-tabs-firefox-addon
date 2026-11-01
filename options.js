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

async function init() {
  localize();
  const settings = await browser.storage.local.get(DEFAULT_SETTINGS);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const checkbox = document.getElementById(key);
    checkbox.checked = settings[key];
    checkbox.addEventListener("change", () => {
      browser.storage.local.set({ [key]: checkbox.checked });
    });
  }
}

init();
