# gumy-widget

An **embeddable character-chat widget** for [gumy.ai](https://gumy.ai). Drop **one script
tag** on any website and a floating launcher appears in the corner. Click it to chat with a
gumy character in a panel that sits **over your page**; hit the expand button to take it
**full screen**.

```html
<script src="https://gumy.ai/embed.js"
        data-character="taylor-swift"
        data-lang="en"
        data-theme="dark"
        async></script>
```

That's the whole integration. No build step, no dependencies, no iframe — the widget is one
vanilla-JS file that isolates itself inside a Shadow DOM (it can't clash with your CSS) and
renders the chat **natively**: its own message bubbles and composer, streaming the character's
reply straight from gumy.ai over HTTPS.

## Configuration

Set on the `<script>` tag as `data-*` attributes:

| Attribute        | Values                | Default          | Meaning                                   |
|------------------|-----------------------|------------------|-------------------------------------------|
| `data-character` | character slug        | — (**required**) | who the visitor chats with                |
| `data-lang`      | `en` \| `ru`          | `en`             | UI + conversation language                |
| `data-theme`     | `dark` \| `light`     | `dark`           | panel theme                               |
| `data-position`  | `right` \| `left`     | `right`          | corner the launcher sits in               |
| `data-title`     | short string          | character's name | label in the panel header                 |
| `data-auto-open` | `true` \| `false`     | `false`          | open the panel on page load               |
| `data-origin`    | URL                   | `https://gumy.ai`| embed-API origin (for local/staging)      |
| `data-mount`     | CSS selector          | — (floating)     | render the chat INLINE inside that element instead of as a floating launcher |

Find a character's slug on its gumy.ai page: `gumy.ai/en/c/<slug>`.

## Runtime API

Once loaded, `window.GumyChat` lets the host page drive the widget:

```js
GumyChat.open();                    // open the panel
GumyChat.close();                   // close it (launcher returns)
GumyChat.toggle();
GumyChat.setCharacter("elon-musk"); // switch who you're talking to
```

## How it works

`embed.js` mounts a launcher + a native chat panel in a Shadow-DOM host, then talks to gumy.ai's
public **embed API** over HTTPS (CORS-open, so it works on any origin):

- on open it `GET`s `…/api/embed/character?c=<slug>&lang=<lang>` to paint the header (name, avatar,
  accent, bio);
- on each message it `POST`s `…/api/embed/chat` `{ c, messages, lang, theme }` and streams the
  reply back as NDJSON, filling the assistant bubble live.

The character's persona is resolved and assembled **server-side** on gumy.ai from the slug — it
never enters the browser. The conversation is anonymous (no login — subject to gumy.ai's per-IP
daily limit), so this repo owns only the **widget UX**, never the chat backend or the character
data. The floating panel header carries two controls: **expand / shrink** (full screen ↔ corner
card) and **close**.

## Where it's served

`gumy-widget` is the **source of truth** for `embed.js`. The file is served to the public at
`https://gumy.ai/embed.js` — gumy.ai is the origin that also hosts the `/api/embed/*` endpoints.
To publish a change:

```bash
npm test                 # keep the loader green
npm run publish:gumy-ai  # cp embed.js -> ../gumy-ai/public/embed.js
# then deploy gumy-ai (bash ../gumy-ai/deploy/deploy.sh)
```

## Develop

```bash
npm test                       # node --test — the loader's pure helpers
open demo/index.html           # local demo (uses ?origin / ?character overrides)
```

`demo/index.html` loads the local `embed.js` so you can eyeball the launcher/panel/full-screen
behaviour against the live gumy.ai embed API before publishing. Point `?origin=` at a local
gumy.ai dev server to test against unshipped `/api/embed/*` changes.
