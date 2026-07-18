# CLAUDE.md — gumy-widget

## What this repo is

The **embeddable character-chat widget** for the gumy.ai ecosystem. A single vanilla-JS file,
`embed.js`, that a third-party site drops in via one `<script>` tag to get a floating chat
launcher (with full-screen expand) that overlays their page and lets a visitor chat with a
gumy character.

This repo owns **only the overlay UX** (launcher, panel, expand/close, Shadow-DOM isolation,
the `window.GumyChat` API). It has **no chat backend and no character data** of its own — the
conversation runs inside an `<iframe>` onto gumy.ai's chrome-less chat surface
(`gumy.ai/{lang}/embed/chat?c=<slug>&theme=<theme>`). Cross-service contact is HTTP only.

## Files

- `embed.js` — the loader (browser IIFE; also exports its pure helpers for Node tests).
- `tests/embed.test.mjs` — `node --test` over `normalizeConfig` / `buildIframeSrc`.
- `demo/index.html` — standalone local demo.
- `README.md` — the public integration guide.

## Hard boundary — serving

`gumy-widget` is the **source of truth** for `embed.js`. It is **served** to the public at
`https://gumy.ai/embed.js` (gumy.ai is the origin, so the iframe chat is same-origin — no
CORS). Publishing a change means copying the file into gumy-ai and deploying gumy-ai:

```bash
npm test
npm run publish:gumy-ai      # cp embed.js -> ../gumy-ai/public/embed.js
bash ../gumy-ai/deploy/deploy.sh
```

Keep `embed.js` and `gumy-ai/public/embed.js` byte-identical. The `/embed/chat` route it
depends on lives in gumy-ai.

## Commands

```bash
npm test                 # loader unit tests (must stay green)
```
