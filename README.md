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

That's the whole integration. No build step, no dependencies, no CORS setup — the widget is
one vanilla-JS file that isolates itself inside a Shadow DOM (it can't clash with your CSS)
and hosts the real conversation in an `<iframe>` onto gumy.ai's chat.

## Configuration

Set on the `<script>` tag as `data-*` attributes:

| Attribute        | Values                | Default          | Meaning                                   |
|------------------|-----------------------|------------------|-------------------------------------------|
| `data-character` | character slug        | — (**required**) | who the visitor chats with                |
| `data-lang`      | `en` \| `ru`          | `en`             | UI + conversation language                |
| `data-theme`     | `dark` \| `light`     | `dark`           | panel theme                               |
| `data-position`  | `right` \| `left`     | `right`          | corner the launcher sits in               |
| `data-title`     | short string          | `Chat`           | label in the panel header                 |
| `data-auto-open` | `true` \| `false`     | `false`          | open the panel on page load               |
| `data-origin`    | URL                   | `https://gumy.ai`| chat app origin (for local/staging)       |

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

`embed.js` mounts a launcher + panel in a Shadow-DOM host attached to `document.body`, then
points the panel's `<iframe>` at `https://gumy.ai/{lang}/embed/chat?c=<slug>&theme=<theme>` —
a **chrome-less** version of the gumy.ai chat (no site nav, no footer). The conversation runs
on gumy.ai (anonymous, no login required — subject to gumy.ai's per-visitor daily limit), so
this repo owns only the **overlay UX**, never the chat backend or the character data.

The panel header carries the two controls the overlay adds on top of the chat: **expand /
shrink** (full screen ↔ corner card) and **close**. Everything else is the chat itself.

## Where it's served

`gumy-widget` is the **source of truth** for `embed.js`. The file is served to the public at
`https://gumy.ai/embed.js` — gumy.ai is the CDN origin (same origin as the chat the iframe
loads, which is why there's no CORS to configure). To publish a change:

```bash
npm test                 # keep the loader green
npm run publish:gumy-ai  # cp embed.js -> ../gumy-ai/public/embed.js
# then deploy gumy-ai (bash ../gumy-ai/deploy/deploy.sh)
```

## Develop

```bash
npm test                       # node --test tests/ — the loader's pure helpers
open demo/index.html           # local demo (uses ?origin / ?character overrides)
```

`demo/index.html` loads the local `embed.js` so you can eyeball the launcher/panel/full-screen
behaviour against the live gumy.ai chat before publishing.
