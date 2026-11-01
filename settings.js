/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

// Shared by the background script and the options page.

const DEFAULT_SETTINGS = {
  middleClick: false, // middle-click on links -> lazy tab
  ctrlClick: false, // Ctrl+click (Mac: Cmd+click) on links -> lazy tab
};

// Only needed for the click options and requested when one is switched on.
// Without it both options must be off (content.js relies on that).
const HOST_PERMISSION = { origins: ["<all_urls>"] };
