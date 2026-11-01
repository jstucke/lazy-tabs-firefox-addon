/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

// Gemeinsam genutzt von Hintergrundskript, Content-Script und Einstellungsseite.
// `var` statt `const`, damit erneutes Einfügen ins selbe Frame keinen
// Redeklarationsfehler auslöst.

/* eslint-disable no-unused-vars, no-var */
var DEFAULT_SETTINGS = {
  middleClick: false, // Mittelklick auf Links -> Lazy-Tab
  ctrlClick: false, // Strg+Klick (Mac: Cmd+Klick) auf Links -> Lazy-Tab
};

// Wird nur für die Klick-Optionen gebraucht und erst beim Einschalten erfragt.
var HOST_PERMISSION = { origins: ["<all_urls>"] };
