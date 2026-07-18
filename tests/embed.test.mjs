import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// embed.js is a browser IIFE that also exports its pure helpers via module.exports when
// required under Node (it stops before touching `document`). Load it as CommonJS.
const require = createRequire(import.meta.url);
const { normalizeConfig, buildIframeSrc, VERSION } = require("../embed.js");

test("normalizeConfig fills defaults", () => {
  const c = normalizeConfig({ character: "taylor-swift" });
  assert.equal(c.character, "taylor-swift");
  assert.equal(c.lang, "en");
  assert.equal(c.theme, "dark");
  assert.equal(c.position, "right");
  assert.equal(c.origin, "https://gumy.ai");
  assert.equal(c.title, "Chat");
  assert.equal(c.autoOpen, false);
});

test("normalizeConfig validates enums, falling back on garbage", () => {
  const c = normalizeConfig({ character: "x", lang: "de", theme: "neon", position: "top" });
  assert.equal(c.lang, "en");
  assert.equal(c.theme, "dark");
  assert.equal(c.position, "right");
});

test("normalizeConfig honours valid values and is case-insensitive", () => {
  const c = normalizeConfig({ character: " x ", lang: "RU", theme: "Light", position: "LEFT" });
  assert.equal(c.character, "x"); // trimmed
  assert.equal(c.lang, "ru");
  assert.equal(c.theme, "light");
  assert.equal(c.position, "left");
});

test("normalizeConfig strips trailing slash from origin", () => {
  assert.equal(normalizeConfig({ character: "x", origin: "https://gumy.ai/" }).origin, "https://gumy.ai");
});

test("autoOpen accepts the string 'true' (data-* attributes are always strings)", () => {
  assert.equal(normalizeConfig({ character: "x", autoOpen: "true" }).autoOpen, true);
  assert.equal(normalizeConfig({ character: "x", autoOpen: "false" }).autoOpen, false);
  assert.equal(normalizeConfig({ character: "x" }).autoOpen, false);
});

test("buildIframeSrc targets the chrome-less chat surface with lang + theme + slug", () => {
  const c = normalizeConfig({ character: "taylor-swift", lang: "ru", theme: "light" });
  assert.equal(buildIframeSrc(c), "https://gumy.ai/ru/embed/chat?c=taylor-swift&theme=light");
});

test("buildIframeSrc url-encodes the slug", () => {
  const c = normalizeConfig({ character: "a b/c" });
  assert.equal(buildIframeSrc(c), "https://gumy.ai/en/embed/chat?c=a%20b%2Fc&theme=dark");
});

test("buildIframeSrc respects a custom origin", () => {
  const c = normalizeConfig({ character: "x", origin: "http://localhost:3000" });
  assert.equal(buildIframeSrc(c), "http://localhost:3000/en/embed/chat?c=x&theme=dark");
});

test("VERSION is exported", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
