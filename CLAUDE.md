# CLAUDE.md — gumy-widget

## What this repo is

The **embeddable character-chat widget** for the gumy.ai ecosystem. A single vanilla-JS file,
`embed.js`, that a third-party site drops in via one `<script>` tag to get a floating chat
launcher (with full-screen expand) that overlays their page and lets a visitor chat with a
gumy character.

The widget is **NATIVE**: it renders its own message bubbles + composer inside a Shadow DOM and
streams the character's reply straight from gumy.ai's public embed API. There is **no iframe** —
the widget IS the chat UI, not a frame around gumy.ai's site.

This repo owns **only the widget UX** (launcher, panel, message bubbles, composer, expand/close,
Shadow-DOM isolation, the `window.GumyChat` API). It has **no chat backend and no character data**
of its own — it talks to gumy.ai over HTTP only:

- `GET  {origin}/api/embed/character?c=<slug>&lang=<lang>` → hero fields (`name`, `image`,
  `accent`, `bio`, …) to paint the panel header. Never returns the persona.
- `POST {origin}/api/embed/chat` `{ c, messages, lang, theme, mcp?, widgetContext? }` → NDJSON
  stream of `{"t":"text","v":"…"}` deltas, then `{"t":"done"}` (or `{"t":"error","v":"…"}`); with
  MCP servers selected also `{"t":"widget",server,uri,data,args?,prefersBorder?}` and
  `{"t":"photo",url,alt?}`. The persona is resolved and assembled **server-side** from the slug,
  so it never enters the browser.
- `GET {origin}/api/mcp/widget?server=&uri=` → an MCP Apps UI bundle for a `widget` event,
  rendered in a **sandboxed iframe** (no `allow-same-origin`; the route's own CSP also carries
  `frame-ancestors *` + a `sandbox` directive so cross-origin framing stays safe). The widget
  implements the HOST side of the MCP Apps postMessage handshake (protocol 2026-01-26):
  `ui/initialize` → `initialized` → `tool-input` + `tool-result`; obeys `size-changed`, forwards
  `ui/message` as a real visitor turn, snapshots `ui/update-model-context` into `widgetContext`.

Both endpoints are **CORS-open** (`Access-Control-Allow-Origin: *`) so the widget works on any
origin. Embed visitors are always **anonymous** (cross-origin → no gumy.ai cookies), metered by
gumy.ai's per-IP daily quota. **MCP tools are opt-in per embed**: `data-mcp="wikipedia,chess"`
pre-selects servers at connection time; the backend intersects that with the character's own
mascot binding (client can only narrow, `cast` always excluded). The widget still deliberately
does NOT carry voice, artifacts, wallet/sign-in or the age wall.

## Files

- `embed.js` — the loader + native chat UI (browser IIFE; also exports its pure helpers for Node
  tests). Config via `data-*` on the script tag or `window.GumyChatConfig`; `data-mount="<sel>"`
  renders the chat INLINE inside an element (showcase mode) instead of as a floating launcher.
- `tests/embed.test.mjs` — `node --test` over `normalizeConfig` / `buildCharUrl` / `buildChatUrl`.
- `demo/index.html` — standalone local demo (floating launcher).
- `site/index.html` — the public showcase served at `widget.gumy.ai` (mounts the widget inline).
- `README.md` — the public integration guide.

## Hard boundary — serving + the gumy-ai contract

`gumy-widget` is the **source of truth** for `embed.js`. It is **served** to the public at
`https://gumy.ai/embed.js` (gumy.ai is the origin that also hosts the `/api/embed/*` endpoints).
Publishing a change means copying the file into gumy-ai and deploying gumy-ai:

```bash
npm test
npm run publish:gumy-ai      # cp embed.js -> ../gumy-ai/public/embed.js
bash ../gumy-ai/deploy/deploy.sh
```

Keep `embed.js` and `gumy-ai/public/embed.js` byte-identical. The `/api/embed/character` and
`/api/embed/chat` routes it depends on live in **gumy-ai** (`src/app/api/embed/*`) — a change to
the request/response shape is **cross-cutting** and must be coordinated across both repos (drive it
from the umbrella OpenSpec, see `../CLAUDE.md`). The legacy `/{lang}/embed/chat` iframe page still
exists in gumy-ai but the widget no longer uses it.

`widget.gumy.ai` (the showcase in `site/`) is a separate static nginx container — see
`deploy/` and `docker-compose.yml`.

## Commands

```bash
npm test                 # loader unit tests (must stay green)
```
