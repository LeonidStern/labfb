# lab

One domain for client pages from many designers, with pin comments clients can leave without an account and agents can read as plain text.

We built it for [OOZE](https://ooze.design) and run it at `lab.ooze.design`. This repo is the whole thing: the proxy setup, the comment layer, its API and the prompts we hand to a designer's agent.

## How it works

```
lab.example.com/anna/acme/k3v9qz7mtp/landing
                 │    │    │          └ page
                 │    │    └ secret: 10 random characters per project, hides the page
                 │    └ project
                 └ designer slug → rewritten to anna's own Vercel project
```

- **One domain, many owners.** Each designer keeps their own repo and their own deploys. Two rewrite lines in `vercel.json` send `/<slug>/*` to their project. Clients only ever see your domain.
- **One script for comments.** `<script src="https://lab.example.com/_lab/comments.js" defer>` in a site's layout. It only switches on when the page is opened through the lab domain.
- **One link for agents.** `lab.example.com/_lab/agent/<page path>` returns every open comment as plain text: the image file and spot in the original pixels, the quoted words, the video time, the nearest section, the viewport and the build commit.

The flow:

1. A designer builds a page with their agent, in any framework, under `/<slug>`.
2. The client opens the link, presses `c`, clicks anywhere (or drags an area) and writes. Just a name, no login.
3. The designer gives their agent the agent link. It reads the comments, fixes the source and pushes.
4. The client reloads. The designer resolves the pins.

## Setup

1. **Fork and deploy.** Import this repo into Vercel. Framework preset: Other. No build command.
2. **Storage.** Add Upstash Redis from the Vercel Marketplace (Storage tab). It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The free tier is plenty.
3. **Environment variables.**
   - `LAB_HOST`: your lab domain, e.g. `lab.example.com`
   - `LAB_COMMENTS_ADMIN_TOKEN`: a long random string (`openssl rand -hex 24`)
   - optional `LAB_COMMENTS_PER_HOUR`: new comments per IP per hour (default 60)
4. **Domain.** Add `lab.example.com` to the Vercel project and the DNS record Vercel shows. If your DNS is on Cloudflare, keep the record DNS only (grey cloud).
5. **Try it.** Open `https://lab.example.com/_lab/demo`, press `c` and pin a comment.

## Add a designer

1. Give them a slug and paste [`prompts/new-designer.md`](prompts/new-designer.md) into their agent.
2. When their site answers at `https://their-project.vercel.app/<slug>`, add two rewrites to `vercel.json`:

   ```json
   { "source": "/<slug>", "destination": "https://their-project.vercel.app/<slug>" },
   { "source": "/<slug>/:path*", "destination": "https://their-project.vercel.app/<slug>/:path*" }
   ```

3. To cut someone off, delete their two lines.

The proxy can't follow redirects. If `/<slug>` on their side answers 307 to somewhere else, the browser ends up on the wrong host. Every page must answer 200 directly.

## Add comments to a site

Paste [`prompts/add-comments.md`](prompts/add-comments.md) into the site's agent. In short:

- the script tag above in the shared layout
- a CSP that allows `script-src`, `connect-src` and `font-src` for the lab domain
- optional `<meta name="lab-build" content="<short commit>">` so comments say which build they were left on
- optional `data-lab="hero"` on key blocks, so comments name the section
- meaningful image file names (`hero-gradient.jpg`, not `IMG_2031.jpg`): comments report them

Script options: `data-host` (if the script is served from another host than the pages), `data-api`, `data-font="Name"` (a font the page already loads) or `data-font-url` (a woff2 to load), `data-enable="always"` (on everywhere, for testing).

The layer is set in [Inter](https://rsms.me/inter/) (400 and 500, latin), served from `public/_lab/fonts/` next to the script, with the system font as fallback.

## Theme

The layer follows the visitor's light or dark setting and takes its colours from a few CSS custom properties. Set them on the layer's host element (or on `:root`) in the site's own CSS:

```css
[data-lab-comments] {
  --lab-accent: #ff5a1f;     /* pins, send button, marked areas. default #6b57ff */
  --lab-accent-fg: #fff;     /* text on the accent. default #fff */
  --lab-bg: #fff;            /* cards, bar, hint. default #fff, dark: #1c1c1e */
  --lab-fg: #141414;         /* text. default #141414, dark: #f4f4f5 */
  --lab-radius: 14px;        /* cards and fields. default 14px */
  --lab-font: 'Inter', sans-serif;
}
```

Borders, muted text and field backgrounds are mixed from `--lab-bg` and `--lab-fg`, so two colours are enough. Setting `--lab-bg` and `--lab-fg` also pins the layer to one look whatever the visitor's setting; set both, not one.

## Admin

Open any lab page once with `?lab-admin=<LAB_COMMENTS_ADMIN_TOKEN>`. The token stays in that browser and is removed from the URL. Admins see **resolve**, **delete** and **copy for agent** on every comment.

## The agent link

```
# Client comments
page: https://lab.example.com/anna/acme/k3v9qz7mtp/landing
open: 1

## 1. Sam · 2026-11-11 14:53 UTC · id 3f9c0a1b2d4e
comment: make this area calmer
on: image "hero-gradient.jpg" (search the repo's src/ and public/ for it)
area in original: 34–70% across, 6–40% down of 1600×1000
section: "hero"
type: area comment, 720×440 px on screen
viewport: 1440×900 @2x
build: a1b2c3d
selector (at comment time): main > figure > img
```

JSON is at `/_lab/api/comments?page=<page path>`.

## Limits

- The secret path hides a page. It doesn't protect it: anyone with the link can open it and comment. Don't put anything truly confidential there.
- Comments are stored per page path, up to 500 per page.
- Posting is limited per IP per hour. There's no captcha.
- No email notifications yet. Unread comments show a "new" marker.

## Files

```
public/_lab/comments.js   the comment layer: one file, no dependencies, shadow DOM
public/_lab/fonts/        Inter 400 and 500 (latin, woff2) and its license (SIL OFL 1.1)
public/_lab/demo.html     demo page
api/lab-comments.mjs      GET comments (JSON or agent text), POST comment / reply / resolve / delete
vercel.json               API and agent rewrites, one example designer
prompts/                  for designers' agents
```

How fast the pages open and how well agents read the comments: [BENCHMARKS.md](BENCHMARKS.md).

MIT. Inter is by The Inter Project Authors, under the SIL Open Font License 1.1 (`public/_lab/fonts/OFL.txt`). Made by [OOZE](https://ooze.design).
