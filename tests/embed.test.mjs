import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// embed.js is a browser IIFE that also assigns its pure helpers to `module.exports` when a CJS
// `module` is present (it stops before touching `document`). This package is `type: module`, so a
// bare `require()` would load embed.js as ESM — where there is no `module` and the export is
// skipped. Evaluate it in a real CommonJS sandbox instead: a `module`/`exports` pair the file can
// write to, with `globalThis` (no `document`) as the runtime global so the IIFE returns early.
function loadEmbed() {
  const src = readFileSync(new URL("../embed.js", import.meta.url), "utf8");
  const mod = { exports: {} };
  new Function("module", "exports", src)(mod, mod.exports);
  return mod.exports;
}
const { normalizeConfig, parseMcpList, buildCharUrl, buildChatUrl, buildWidgetUrl, VERSION } =
  loadEmbed();

test("normalizeConfig fills defaults", () => {
  const c = normalizeConfig({ character: "taylor-swift" });
  assert.equal(c.character, "taylor-swift");
  assert.equal(c.lang, "en");
  assert.equal(c.theme, "dark");
  assert.equal(c.position, "right");
  assert.equal(c.origin, "https://gumy.ai");
  assert.equal(c.title, ""); // empty → runtime falls back to the character's own name
  assert.equal(c.autoOpen, false);
  assert.equal(c.mount, "");
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

test("normalizeConfig carries a mount selector for inline (showcase) mode", () => {
  assert.equal(normalizeConfig({ character: "x", mount: "#demo" }).mount, "#demo");
});

test("autoOpen accepts the string 'true' (data-* attributes are always strings)", () => {
  assert.equal(normalizeConfig({ character: "x", autoOpen: "true" }).autoOpen, true);
  assert.equal(normalizeConfig({ character: "x", autoOpen: "false" }).autoOpen, false);
  assert.equal(normalizeConfig({ character: "x" }).autoOpen, false);
});

test("buildCharUrl targets the public hero read with slug + lang", () => {
  const c = normalizeConfig({ character: "taylor-swift", lang: "ru" });
  assert.equal(buildCharUrl(c), "https://gumy.ai/api/embed/character?c=taylor-swift&lang=ru");
});

test("buildCharUrl url-encodes the slug", () => {
  const c = normalizeConfig({ character: "a b/c" });
  assert.equal(buildCharUrl(c), "https://gumy.ai/api/embed/character?c=a%20b%2Fc&lang=en");
});

test("buildChatUrl targets the streaming chat endpoint (slug rides the POST body, not the URL)", () => {
  const c = normalizeConfig({ character: "taylor-swift" });
  assert.equal(buildChatUrl(c), "https://gumy.ai/api/embed/chat");
});

test("both URLs respect a custom origin", () => {
  const c = normalizeConfig({ character: "x", origin: "http://localhost:3000" });
  assert.equal(buildCharUrl(c), "http://localhost:3000/api/embed/character?c=x&lang=en");
  assert.equal(buildChatUrl(c), "http://localhost:3000/api/embed/chat");
});

test("VERSION is exported", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("parseMcpList splits a data-mcp string, trims, lowercases and dedupes", () => {
  assert.deepEqual(parseMcpList("wikipedia,chess"), ["wikipedia", "chess"]);
  assert.deepEqual(parseMcpList(" Wikipedia ,  CHESS , wikipedia "), ["wikipedia", "chess"]);
  assert.deepEqual(parseMcpList("wikipedia chess"), ["wikipedia", "chess"]); // space-separated too
  assert.deepEqual(parseMcpList(""), []);
  assert.deepEqual(parseMcpList(undefined), []);
});

test("parseMcpList accepts an array (GumyChatConfig.mcp)", () => {
  assert.deepEqual(parseMcpList(["Chess", "", "chess"]), ["chess"]);
});

test("normalizeConfig carries the mcp selection (default: none)", () => {
  assert.deepEqual(normalizeConfig({ character: "x" }).mcp, []);
  assert.deepEqual(normalizeConfig({ character: "x", mcp: "wikipedia,chess" }).mcp, [
    "wikipedia",
    "chess",
  ]);
  assert.deepEqual(normalizeConfig({ character: "x", mcp: ["dns"] }).mcp, ["dns"]);
});

test("buildWidgetUrl targets the bundle route and url-encodes server + uri", () => {
  const c = normalizeConfig({ character: "x" });
  assert.equal(
    buildWidgetUrl(c, "chess", "ui://chess/board-v1"),
    "https://gumy.ai/api/mcp/widget?server=chess&uri=ui%3A%2F%2Fchess%2Fboard-v1",
  );
});
