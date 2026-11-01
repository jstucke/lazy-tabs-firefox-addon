/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Checks the translations in _locales/:
// - every messages.json is valid JSON and every entry has a non-empty "message"
// - every locale has exactly the same keys as the default locale
// - every key used in the code exists, and every defined key is used

import { readdirSync, readFileSync } from "node:fs";

const errors = [];
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    errors.push(`${path}: ${err.message}`);
    return null;
  }
};

const manifest = readJson("manifest.json");
const defaultLocale = manifest?.default_locale;
if (!defaultLocale) errors.push("manifest.json: default_locale is missing");

// --- load all locales
const locales = {};
for (const locale of readdirSync("_locales")) {
  const path = `_locales/${locale}/messages.json`;
  const messages = readJson(path);
  if (!messages) continue;
  for (const [key, entry] of Object.entries(messages)) {
    if (typeof entry?.message !== "string" || entry.message.trim() === "") {
      errors.push(`${path}: "${key}" has no message`);
    }
  }
  locales[locale] = new Set(Object.keys(messages));
}

// --- same keys everywhere
const reference = locales[defaultLocale];
if (defaultLocale && !reference)
  errors.push(`default locale "${defaultLocale}" not found in _locales/`);
if (reference) {
  for (const [locale, keys] of Object.entries(locales)) {
    for (const key of reference) if (!keys.has(key)) errors.push(`${locale}: missing "${key}"`);
    for (const key of keys)
      if (!reference.has(key)) errors.push(`${locale}: unknown "${key}" (not in ${defaultLocale})`);
  }
}

// --- keys used in the code
const used = new Set();
const patterns = [/__MSG_(\w+)__/g, /getMessage\(\s*"(\w+)"/g, /data-i18n="(\w+)"/g];
const sources = readdirSync(".").filter(
  (f) => /\.(js|html|json)$/.test(f) && !f.startsWith("package"),
);
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const re of patterns) for (const [, key] of text.matchAll(re)) used.add(key);
}
// Keys chosen at runtime, e.g. getMessage(isFolder ? "menuOpenFolder" : "menuOpenBookmark")
for (const file of sources.filter((f) => f.endsWith(".js"))) {
  const text = readFileSync(file, "utf8");
  for (const call of text.matchAll(/getMessage\(([^)]*)\)/g)) {
    for (const [, key] of call[1].matchAll(/"(\w+)"/g)) used.add(key);
  }
}

if (reference) {
  for (const key of used)
    if (!reference.has(key)) errors.push(`code uses "${key}", which is not defined`);
  for (const key of reference)
    if (!used.has(key)) errors.push(`"${key}" is defined but never used`);
}

if (errors.length) {
  console.error(errors.map((e) => `FAIL ${e}`).join("\n"));
  process.exit(1);
}
console.log(
  `ok   ${Object.keys(locales).length} locales, ${reference.size} messages, all keys consistent`,
);
