/*!
 * Gumy chat widget loader — embed.js
 *
 * Drop ONE script tag on any website and a character-chat launcher appears, floating over the
 * page. Click it to open a NATIVE chat panel — its own message bubbles + composer, rendered in a
 * Shadow DOM, fully isolated from the host page. There is NO iframe: the panel talks straight to
 * gumy.ai's public embed API over HTTPS and streams the character's reply in.
 *
 *   <script src="https://gumy.ai/embed.js"
 *           data-character="taylor-swift" data-lang="en" data-theme="dark" async></script>
 *
 * Backend contract (served by gumy.ai, CORS-open so the widget works on any origin):
 *   GET  {origin}/api/embed/character?c=<slug>&lang=<lang>   → { name, image, accent, bio, … }
 *   POST {origin}/api/embed/chat  { c, messages, lang, theme } → NDJSON stream of
 *        {"t":"text","v":"…"}  text deltas, then {"t":"done"} (or {"t":"error","v":"…"}).
 *
 * The SAME file is served as https://gumy.ai/embed.js — gumy-widget is the source of truth,
 * gumy.ai is the origin that serves it AND hosts the /api/embed/* endpoints (see README).
 *
 * Config via data-* on the script tag (or window.GumyChatConfig):
 *   data-character  REQUIRED  character slug to chat with (e.g. "taylor-swift")
 *   data-lang       "en"|"ru"           default "en"
 *   data-theme      "dark"|"light"      default "dark"
 *   data-position   "right"|"left"      default "right"  (which corner the launcher sits in)
 *   data-title      short label shown in the panel header    default the character's name
 *   data-auto-open  "true" to open the panel on load          default false
 *   data-origin     base URL of the chat API                  default "https://gumy.ai"
 *   data-mount      CSS selector — mount the chat INLINE inside that element (showcase mode:
 *                   no floating launcher, panel fills the container, always open)
 *
 * Runtime API: window.GumyChat = { open(), close(), toggle(), setCharacter(slug) }.
 */
(function (global) {
  "use strict";

  var VERSION = "2.0.0";
  var LANGS = { en: 1, ru: 1 };
  var THEMES = { dark: 1, light: 1 };
  var SIDES = { left: 1, right: 1 };

  // ── Pure config/URL helpers (also exported for tests; no DOM here) ──────────────────────
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
      title: raw.title ? String(raw.title) : "",
      autoOpen: raw.autoOpen === true || raw.autoOpen === "true",
      mount: raw.mount ? String(raw.mount) : "",
    };
  }

  // Public hero read — name, avatar, accent, bio for the panel header/greeting.
  function buildCharUrl(cfg) {
    return (
      cfg.origin +
      "/api/embed/character?c=" +
      encodeURIComponent(cfg.character) +
      "&lang=" +
      cfg.lang
    );
  }

  // Streaming chat endpoint (POST). The transcript + slug go in the body.
  function buildChatUrl(cfg) {
    return cfg.origin + "/api/embed/chat";
  }

  var api = {
    normalizeConfig: normalizeConfig,
    buildCharUrl: buildCharUrl,
    buildChatUrl: buildChatUrl,
    VERSION: VERSION,
  };
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
    mount: override.mount || d.mount,
  });

  if (!cfg.character) {
    // Nothing to chat with — fail loud in the console, stay invisible on the page.
    if (global.console) console.warn("[gumy] embed.js: missing data-character — widget not mounted");
    return;
  }

  var DEFAULT_ACCENT = "#6d5efc";
  var accent = DEFAULT_ACCENT;
  var GREETING = { en: "Hi! Ask me anything 😊", ru: "Привет! Спроси меня о чём угодно 😊" };
  var PLACEHOLDER = { en: "Message…", ru: "Сообщение…" };
  var ERR = { en: "Something went wrong. Try again.", ru: "Что-то пошло не так. Попробуйте снова." };
  var LIMIT = {
    en: "Daily free messages are used up — come back tomorrow.",
    ru: "Бесплатные сообщения на сегодня кончились — загляните завтра.",
  };
  var t = function (map) { return map[cfg.lang] || map.en; };

  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_EXPAND =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  var ICON_SHRINK =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
  var ICON_SEND =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  var inline = !!cfg.mount;
  var side = cfg.position === "left" ? "left" : "right";
  var light = cfg.theme === "light";

  // Theme tokens — the panel paints itself; nothing leaks in from the host page (`:host{all:initial}`).
  var C = light
    ? { bg: "#ffffff", head: "#f4f4f7", fg: "#16161c", muted: "#6a6a78", line: "#e6e6ec", bot: "#f1f1f6", botFg: "#16161c", field: "#f4f4f7" }
    : { bg: "#0e0e12", head: "#16161f", fg: "#f2f2f7", muted: "#9a9aa8", line: "#26263a", bot: "#1c1c26", botFg: "#f2f2f7", field: "#1c1c26" };

  // Layout differs for inline (fills its container) vs floating (fixed corner card).
  var panelBox = inline
    ? ".panel{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit}"
    : ".panel{position:fixed;bottom:20px;" + side + ":20px;width:min(410px,calc(100vw - 32px));" +
      "height:min(680px,calc(100vh - 40px));border-radius:18px;" +
      "opacity:0;transform:translateY(12px) scale(.98);transition:opacity .2s ease,transform .2s ease;display:none}" +
      ".panel.open{display:flex;opacity:1;transform:none}" +
      ".panel.full{inset:0;width:100vw;height:100vh;border-radius:0;bottom:0;" + side + ":0}";

  var STYLE =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;width:58px;height:58px;border:0;border-radius:50%;" +
    "background:" + accent + ";box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;display:flex;align-items:center;" +
    "justify-content:center;z-index:2147483000;transition:transform .18s ease,opacity .18s ease}" +
    ".launcher:hover{transform:scale(1.06)}" +
    ".launcher.has-avatar{background-size:cover;background-position:center;border:2px solid #ffffffe0;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.32),0 0 0 3px " + accent + "55}" +
    ".launcher.hidden{opacity:0;pointer-events:none;transform:scale(.6)}" +
    panelBox +
    ".panel{background:" + C.bg + ";color:" + C.fg + ";overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.42);" +
    "z-index:2147483001;flex-direction:column;" + (inline ? "display:flex;" : "") + "}" +
    ".head{flex:0 0 auto;min-height:56px;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;" +
    "background:" + C.head + ";border-bottom:1px solid " + C.line + "}" +
    ".head img{width:34px;height:34px;border-radius:50%;object-fit:cover;background:" + C.line + ";flex:0 0 auto;display:none}" +
    ".head .meta{flex:1;min-width:0}" +
    ".head .name{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:" + C.fg + "}" +
    ".head .sub{font-size:11px;color:" + C.muted + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".head button{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:" + C.muted + ";" +
    "cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".head button:hover{background:" + C.line + ";color:" + C.fg + "}" +
    ".msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}" +
    ".row{display:flex;max-width:100%}" +
    ".row.user{justify-content:flex-end}" +
    ".bubble{max-width:82%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".row.bot .bubble{background:" + C.bot + ";color:" + C.botFg + ";border-bottom-left-radius:5px}" +
    ".row.user .bubble{background:" + accent + ";color:#fff;border-bottom-right-radius:5px}" +
    ".bubble.err{background:transparent;color:#e5484d;border:1px solid #e5484d55;font-size:13px}" +
    ".dots{display:inline-flex;gap:4px;padding:4px 2px}" +
    ".dots i{width:6px;height:6px;border-radius:50%;background:" + C.muted + ";opacity:.5;animation:gb 1s infinite}" +
    ".dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}" +
    "@keyframes gb{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    ".composer{flex:0 0 auto;display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid " + C.line + ";background:" + C.head + "}" +
    ".composer textarea{flex:1;resize:none;border:0;outline:0;background:" + C.field + ";color:" + C.fg + ";" +
    "border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4;max-height:120px;min-height:40px}" +
    ".composer textarea::placeholder{color:" + C.muted + "}" +
    ".send{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:12px;background:" + accent + ";cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;transition:opacity .15s ease}" +
    ".send:disabled{opacity:.45;cursor:default}" +
    ".foot{flex:0 0 auto;text-align:center;font-size:10px;color:" + C.muted + ";padding:0 0 8px}" +
    ".foot a{color:" + C.muted + ";text-decoration:none}" +
    "@media (prefers-reduced-motion:reduce){.launcher,.panel,.dots i{transition:none;animation:none}}";

  var host = doc.createElement("div");
  host.setAttribute("data-gumy-widget", VERSION);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var style = doc.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  var launcher = null;
  if (!inline) {
    launcher = doc.createElement("button");
    launcher.className = "launcher";
    launcher.setAttribute("aria-label", "Open chat");
    launcher.innerHTML = ICON_CHAT;
    root.appendChild(launcher);
  }

  var panel = doc.createElement("div");
  panel.className = "panel" + (inline ? " open" : "");
  panel.innerHTML =
    '<div class="head">' +
    '<img alt="" />' +
    '<div class="meta"><div class="name"></div><div class="sub"></div></div>' +
    (inline ? "" : '<button class="expand" aria-label="Toggle full screen"></button>') +
    '<button class="close" aria-label="Close chat"></button>' +
    "</div>" +
    '<div class="msgs" role="log" aria-live="polite"></div>' +
    '<div class="composer">' +
    '<textarea rows="1" aria-label="Message"></textarea>' +
    '<button class="send" aria-label="Send"></button>' +
    "</div>" +
    '<div class="foot">powered by <a href="https://gumy.ai" target="_blank" rel="noopener">gumy.ai</a></div>';
  root.appendChild(panel);

  var head = panel.querySelector(".head");
  var avatarEl = head.querySelector("img");
  var nameEl = head.querySelector(".name");
  var subEl = head.querySelector(".sub");
  var expandBtn = head.querySelector(".expand");
  var closeBtn = head.querySelector(".close");
  var msgsEl = panel.querySelector(".msgs");
  var textarea = panel.querySelector("textarea");
  var sendBtn = panel.querySelector(".send");

  nameEl.textContent = cfg.title || "…";
  if (expandBtn) expandBtn.innerHTML = ICON_EXPAND;
  closeBtn.innerHTML = ICON_CLOSE;
  sendBtn.innerHTML = ICON_SEND;
  textarea.placeholder = t(PLACEHOLDER);

  // ── State ──────────────────────────────────────────────────────────────────────────
  var messages = []; // [{role:"user"|"assistant", content:String}]
  var loadedChar = false;
  var busy = false;
  var abort = null;

  function scrollDown() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // Append a bubble; returns the .bubble element so a streaming reply can keep filling it.
  function addBubble(role, text, cls) {
    var row = doc.createElement("div");
    row.className = "row " + (role === "user" ? "user" : "bot");
    var bubble = doc.createElement("div");
    bubble.className = "bubble" + (cls ? " " + cls : "");
    if (text != null) bubble.textContent = text;
    row.appendChild(bubble);
    msgsEl.appendChild(row);
    scrollDown();
    return bubble;
  }

  function typingBubble() {
    var row = doc.createElement("div");
    row.className = "row bot";
    var bubble = doc.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    row.appendChild(bubble);
    msgsEl.appendChild(row);
    scrollDown();
    return bubble;
  }

  // Repaint the accent (character-supplied) into the two accented styles + the launcher.
  function applyAccent(hex) {
    if (!hex || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return;
    accent = hex;
    if (launcher) launcher.style.background = hex;
    sendBtn.style.background = hex;
    // user-bubble background is set inline as bubbles are created (see addBubble usage below)
    var rules = root.querySelector("style");
    // Cheap targeted override appended once — avoids reflowing the whole stylesheet string.
    rules.textContent += ".row.user .bubble{background:" + hex + "!important}.send{background:" + hex + "!important}";
  }

  // Put the character's face on the corner launcher (floating mode) — preload so it only swaps in
  // once the image is ready, otherwise keep the default chat glyph.
  function paintLauncher(url) {
    if (!launcher || !url) return;
    var img = new global.Image();
    img.onload = function () {
      launcher.innerHTML = "";
      launcher.classList.add("has-avatar");
      // Set the background longhands INLINE: applyAccent() writes `launcher.style.background` (a
      // shorthand that resets size/position to their defaults), and inline wins over the stylesheet
      // — so cover/center must be inline too, applied here (after the async load) to stick.
      launcher.style.backgroundImage = "url('" + url.replace(/'/g, "%27") + "')";
      launcher.style.backgroundSize = "cover";
      launcher.style.backgroundPosition = "center";
      launcher.style.backgroundRepeat = "no-repeat";
    };
    img.src = url;
  }

  function fetchCharacter() {
    if (loadedChar) return;
    loadedChar = true;
    try {
      global.fetch(buildCharUrl(cfg), { method: "GET" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          if (!c || c.error) return;
          if (c.name) {
            if (!cfg.title) nameEl.textContent = c.name;
            avatarEl.setAttribute("alt", c.name);
          }
          if (c.image) {
            avatarEl.src = c.image;
            avatarEl.style.display = "block";
            paintLauncher(c.image); // show the character's face on the corner bubble
          }
          if (c.bio) subEl.textContent = c.bio;
          if (c.accent) applyAccent(c.accent);
        })
        .catch(function () {});
    } catch (e) {}
  }

  // Seed the opening greeting bubble once, when the panel first shows.
  function ensureGreeting() {
    if (msgsEl.childNodes.length) return;
    addBubble("assistant", t(GREETING));
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    textarea.disabled = on;
  }

  function send() {
    if (busy) return;
    var text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";
    autoGrow();
    addBubble("user", text);
    messages.push({ role: "user", content: text });

    setBusy(true);
    var typingRow = typingBubble().parentNode; // the row that holds the typing dots
    var replyBubble = null;
    var acc = "";
    var errText = null;
    var done = false;
    abort = ("AbortController" in global) ? new global.AbortController() : null;

    function removeTyping() {
      if (typingRow && typingRow.parentNode) msgsEl.removeChild(typingRow);
      typingRow = null;
    }
    function finish(errMsg) {
      if (done) return;
      done = true;
      removeTyping();
      if (errMsg) addBubble("assistant", errMsg, "err");
      else if (acc) messages.push({ role: "assistant", content: acc });
      setBusy(false);
      abort = null;
      textarea.focus();
    }
    function pushDelta(v) {
      if (!replyBubble) {
        removeTyping(); // first delta — swap the dots for a real bubble
        replyBubble = addBubble("assistant", "");
      }
      acc += v;
      replyBubble.textContent = acc;
      scrollDown();
    }
    function handle(line) {
      var s = line.trim();
      if (!s) return;
      var ev;
      try { ev = JSON.parse(s); } catch (e) { return; }
      if (ev.t === "text" && typeof ev.v === "string") pushDelta(ev.v);
      else if (ev.t === "error" && typeof ev.v === "string") errText = ev.v;
    }

    global.fetch(buildChatUrl(cfg), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        c: cfg.character,
        messages: messages,
        lang: cfg.lang,
        theme: cfg.theme,
      }),
      signal: abort ? abort.signal : undefined,
    })
      .then(function (res) {
        if (res.status === 429) return finish(t(LIMIT));
        if (!res.ok) return finish(t(ERR));
        if (!res.body || !res.body.getReader) {
          // No streaming support in this browser — read the whole NDJSON body, then parse.
          return res.text().then(function (txt) {
            txt.split("\n").forEach(handle);
            finish(acc ? undefined : t(ERR));
          });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              buf.split("\n").forEach(handle);
              finish(acc ? undefined : t(ERR));
              return;
            }
            buf += decoder.decode(r.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(handle);
            return pump();
          });
        }
        return pump();
      })
      .catch(function () {
        if (abort && abort.signal && abort.signal.aborted) { done = true; setBusy(false); return; }
        finish(t(ERR));
      });
  }

  function autoGrow() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  // ── Open / close / expand ────────────────────────────────────────────────────────────
  var openState = inline;
  function open() {
    fetchCharacter();
    ensureGreeting();
    openState = true;
    if (!inline) {
      panel.classList.add("open");
      if (launcher) launcher.classList.add("hidden");
    }
    setTimeout(function () { textarea.focus(); }, 50);
  }
  function close() {
    if (inline) return;
    openState = false;
    panel.classList.remove("open", "full");
    if (expandBtn) expandBtn.innerHTML = ICON_EXPAND;
    if (launcher) launcher.classList.remove("hidden");
    if (abort) try { abort.abort(); } catch (e) {}
  }
  function toggle() { openState ? close() : open(); }
  function toggleFull() {
    var full = panel.classList.toggle("full");
    if (expandBtn) expandBtn.innerHTML = full ? ICON_SHRINK : ICON_EXPAND;
  }
  function setCharacter(slug) {
    if (!slug) return;
    cfg.character = String(slug).trim();
    loadedChar = false;
    messages = [];
    msgsEl.innerHTML = "";
    nameEl.textContent = cfg.title || "…";
    subEl.textContent = "";
    avatarEl.removeAttribute("src");
    avatarEl.style.display = "none";
    if (launcher) {
      launcher.classList.remove("has-avatar");
      launcher.style.backgroundImage = "";
      launcher.innerHTML = ICON_CHAT;
    }
    fetchCharacter();
    ensureGreeting();
  }

  if (launcher) launcher.addEventListener("click", toggle);
  closeBtn.addEventListener("click", close);
  if (expandBtn) expandBtn.addEventListener("click", toggleFull);
  sendBtn.addEventListener("click", send);
  textarea.addEventListener("input", autoGrow);
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openState && !inline) close();
  });

  function mount() {
    if (inline) {
      var target = typeof cfg.mount === "string" ? doc.querySelector(cfg.mount) : cfg.mount;
      if (!target) {
        if (global.console) console.warn("[gumy] embed.js: data-mount target not found: " + cfg.mount);
        return;
      }
      // The inline host needs a positioning context so the absolutely-filled panel sits inside it.
      if (getComputedStyle(target).position === "static") target.style.position = "relative";
      target.appendChild(host);
      fetchCharacter();
      ensureGreeting();
      setTimeout(function () { textarea.focus(); }, 50);
    } else {
      doc.body.appendChild(host);
      fetchCharacter(); // load early so the corner launcher wears the character's face before opening
      if (cfg.autoOpen) open();
    }
  }
  if (doc.body) mount();
  else doc.addEventListener("DOMContentLoaded", mount);

  global.GumyChat = { open: open, close: close, toggle: toggle, setCharacter: setCharacter, VERSION: VERSION };
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
