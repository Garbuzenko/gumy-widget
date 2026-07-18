/*!
 * Gumy chat widget loader — embed.js
 *
 * Drop ONE script tag on any website and a character-chat launcher appears, floating
 * over the page. Click it to open a chat panel; expand it to full screen. The panel is
 * an <iframe> onto gumy.ai's chrome-less chat surface (`/{lang}/embed/chat?c=<slug>`),
 * so the actual conversation runs on gumy.ai — this file is only the launcher + panel
 * chrome that hosts it, fully isolated from the host page inside a Shadow DOM.
 *
 *   <script src="https://gumy.ai/embed.js"
 *           data-character="taylor-swift" data-lang="en" data-theme="dark" async></script>
 *
 * The SAME file is served as https://gumy.ai/embed.js — gumy-widget is the source of
 * truth, gumy.ai is the origin that serves it (see README).
 *
 * Config via data-* on the script tag (or window.GumyChatConfig):
 *   data-character  REQUIRED  character slug to chat with (e.g. "taylor-swift")
 *   data-lang       "en"|"ru"           default "en"
 *   data-theme      "dark"|"light"      default "dark"
 *   data-position   "right"|"left"      default "right"  (which corner the launcher sits in)
 *   data-title      short label shown in the panel header    default "Chat"
 *   data-auto-open  "true" to open the panel on load          default false
 *   data-origin     base URL of the chat app                  default "https://gumy.ai"
 *
 * Runtime API: window.GumyChat = { open(), close(), toggle(), setCharacter(slug) }.
 */
(function (global) {
  "use strict";

  var VERSION = "1.0.0";
  var LANGS = { en: 1, ru: 1 };
  var THEMES = { dark: 1, light: 1 };
  var SIDES = { left: 1, right: 1 };

  // ── Pure config helpers (also exported for tests; no DOM here) ──────────────────────
  function normalizeConfig(raw) {
    raw = raw || {};
    var lang = String(raw.lang || "").toLowerCase();
    var theme = String(raw.theme || "").toLowerCase();
    var position = String(raw.position || "").toLowerCase();
    var origin = String(raw.origin || "https://gumy.ai").replace(/\/+$/, "");
    return {
      origin: origin,
      character: raw.character ? String(raw.character).trim() : "",
      lang: LANGS[lang] ? lang : "en",
      theme: THEMES[theme] ? theme : "dark",
      position: SIDES[position] ? position : "right",
      title: raw.title ? String(raw.title) : "Chat",
      autoOpen: raw.autoOpen === true || raw.autoOpen === "true",
    };
  }

  // The chrome-less chat URL the iframe points at. Same shape gumy.ai's /embed/chat reads.
  function buildIframeSrc(cfg) {
    return (
      cfg.origin +
      "/" +
      cfg.lang +
      "/embed/chat?c=" +
      encodeURIComponent(cfg.character) +
      "&theme=" +
      cfg.theme
    );
  }

  var api = { normalizeConfig: normalizeConfig, buildIframeSrc: buildIframeSrc, VERSION: VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  var doc = global.document;
  if (!doc) return; // Node / test import: stop before touching the DOM.
  if (global.__gumyChatLoaded) return; // never double-mount
  global.__gumyChatLoaded = true;

  // ── Read config off the loader's own <script> tag ───────────────────────────────────
  var self = doc.currentScript || (function () {
    var s = doc.querySelectorAll("script[src*='embed.js']");
    return s[s.length - 1] || null;
  })();
  var d = (self && self.dataset) || {};
  var override = global.GumyChatConfig || {};
  var cfg = normalizeConfig({
    character: override.character || d.character,
    lang: override.lang || d.lang,
    theme: override.theme || d.theme,
    position: override.position || d.position,
    title: override.title || d.title,
    origin: override.origin || d.origin,
    autoOpen: override.autoOpen != null ? override.autoOpen : d.autoOpen,
  });

  if (!cfg.character) {
    // Nothing to chat with — fail loud in the console, stay invisible on the page.
    if (global.console) console.warn("[gumy] embed.js: missing data-character — widget not mounted");
    return;
  }

  var accent = "#6d5efc";
  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_EXPAND =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  var ICON_SHRINK =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';

  var side = cfg.position === "left" ? "left" : "right";
  var STYLE =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;width:58px;height:58px;border:0;border-radius:50%;" +
    "background:" + accent + ";box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;display:flex;align-items:center;" +
    "justify-content:center;z-index:2147483000;transition:transform .18s ease,opacity .18s ease}" +
    ".launcher:hover{transform:scale(1.06)}" +
    ".launcher.hidden{opacity:0;pointer-events:none;transform:scale(.6)}" +
    ".panel{position:fixed;bottom:20px;" + side + ":20px;width:min(410px,calc(100vw - 32px));" +
    "height:min(680px,calc(100vh - 40px));background:#0e0e12;border-radius:18px;overflow:hidden;" +
    "box-shadow:0 18px 60px rgba(0,0,0,.42);z-index:2147483001;display:none;flex-direction:column;" +
    "opacity:0;transform:translateY(12px) scale(.98);transition:opacity .2s ease,transform .2s ease}" +
    ".panel.open{display:flex;opacity:1;transform:none}" +
    ".panel.full{inset:0;width:100vw;height:100vh;border-radius:0;bottom:0;" + side + ":0}" +
    ".head{flex:0 0 auto;height:46px;display:flex;align-items:center;gap:8px;padding:0 8px 0 16px;" +
    "background:" + accent + ";color:#fff}" +
    ".head .name{flex:1;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".head button{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:#fff;" +
    "cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.9}" +
    ".head button:hover{opacity:1;background:rgba(255,255,255,.16)}" +
    ".frame{flex:1;border:0;width:100%;background:#0e0e12}" +
    "@media (prefers-reduced-motion:reduce){.launcher,.panel{transition:none}}";

  var host = doc.createElement("div");
  host.setAttribute("data-gumy-widget", VERSION);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var style = doc.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  var launcher = doc.createElement("button");
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = ICON_CHAT;
  root.appendChild(launcher);

  var panel = doc.createElement("div");
  panel.className = "panel";
  panel.innerHTML =
    '<div class="head">' +
    '<span class="name"></span>' +
    '<button class="expand" aria-label="Toggle full screen"></button>' +
    '<button class="close" aria-label="Close chat"></button>' +
    "</div>";
  root.appendChild(panel);

  var head = panel.querySelector(".head");
  head.querySelector(".name").textContent = cfg.title;
  var expandBtn = head.querySelector(".expand");
  var closeBtn = head.querySelector(".close");
  expandBtn.innerHTML = ICON_EXPAND;
  closeBtn.innerHTML = ICON_CLOSE;

  var frame = null; // lazily created on first open so the chat only loads when asked for
  function ensureFrame() {
    if (frame) return;
    frame = doc.createElement("iframe");
    frame.className = "frame";
    frame.setAttribute("title", cfg.title);
    frame.setAttribute("allow", "microphone; clipboard-write");
    frame.src = buildIframeSrc(cfg);
    panel.appendChild(frame);
  }

  var openState = false;
  function open() {
    ensureFrame();
    openState = true;
    panel.classList.add("open");
    launcher.classList.add("hidden");
  }
  function close() {
    openState = false;
    panel.classList.remove("open");
    panel.classList.remove("full");
    expandBtn.innerHTML = ICON_EXPAND;
    launcher.classList.remove("hidden");
  }
  function toggle() {
    openState ? close() : open();
  }
  function toggleFull() {
    var full = panel.classList.toggle("full");
    expandBtn.innerHTML = full ? ICON_SHRINK : ICON_EXPAND;
  }
  function setCharacter(slug) {
    if (!slug) return;
    cfg.character = String(slug).trim();
    if (frame) frame.src = buildIframeSrc(cfg);
  }

  launcher.addEventListener("click", toggle);
  closeBtn.addEventListener("click", close);
  expandBtn.addEventListener("click", toggleFull);
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openState) close();
  });

  function mount() {
    doc.body.appendChild(host);
    if (cfg.autoOpen) open();
  }
  if (doc.body) mount();
  else doc.addEventListener("DOMContentLoaded", mount);

  global.GumyChat = { open: open, close: close, toggle: toggle, setCharacter: setCharacter, VERSION: VERSION };
})(typeof window !== "undefined" ? window : this);
