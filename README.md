# labfb

Pin comments on live pages. Anyone with the link clicks anywhere and types a name, no account. Then press "copy link" and paste it into your agent. That's it: it reads every comment and goes to the file.

![Comments pinned on a demo page](docs/comments.png)

Works on text, code, photos and video files. Each comment records what's under it: the image file and the spot in its pixels, the quoted words, the video time, the section. So an agent finds it in the source without a screenshot.

![A person pins, the agent GETs one link as plain text, then opens the exact file, line, pixel or second](docs/how-agents-see-comments.png)

One domain, many repos. The lab domain is only a proxy: two rewrite lines send `/<name>/*` to each member's own repo and Vercel project, with their own pages, notes and knowledge base for their agent. Nobody shares a codebase, nobody waits on anybody.

## Setup: paste this into your agent

No guide to follow. This prompt is the whole setup.

```text
Set up labfb (https://github.com/leonidstern/labfb) for me on Vercel.

1. Fork the repo and import it into Vercel: framework preset "Other", no build command.
2. Add Upstash Redis from the Vercel Marketplace (free tier). It sets KV_REST_API_URL and KV_REST_API_TOKEN.
3. Set env vars: LAB_HOST=<lab domain, e.g. lab.example.com> and LAB_COMMENTS_ADMIN_TOKEN=<output of `openssl rand -hex 24`>. Tell me the token. Redeploy so the variables apply.
4. Add <lab domain> to the Vercel project and tell me the DNS record to create.
5. For each site that should get comments (slug = a short name, e.g. anna):
   - serve it under the base path /<slug> (Astro `base`, Next `basePath`, Vite `base`) from its own Vercel project; every page answers 200, no redirects
   - add two rewrites to labfb's vercel.json:
     { "source": "/<slug>", "destination": "https://<their-project>.vercel.app/<slug>" },
     { "source": "/<slug>/:path*", "destination": "https://<their-project>.vercel.app/<slug>/:path*" }
   - add this to the site's shared layout, before </body>:
     <script src="https://<lab domain>/_lab/comments.js" defer></script>
   - put pages at /<slug>/<project>/<secret>/<page>, where <secret> is 10 random characters per project; mark them noindex and link to them from nowhere
6. Once I confirm the DNS works: POST a test comment with curl to https://<lab domain>/_lab/api/comments
   ({"page":"/_lab/demo","name":"setup","text":"test"}, content-type application/json) and check that
   https://<lab domain>/_lab/agent/_lab/demo shows it as text. Then delete it with header x-lab-admin: <token>.
```

## Use

- **Comment:** open a page through the lab domain, press `c`, then click or drag.
- **Read:** `https://<lab domain>/_lab/agent/<page path>` returns every open comment as plain text.
- **Resolve or delete:** open any page once with `#lab-admin=<token>`.
- **Admins:** ask your agent "make a lab admin link for anna on /anna". With your token it gets a link that lets anna resolve and delete comments on `/anna` pages only. One browser can hold links for several labs. Nothing to set up per person (how: top of `api/lab-comments.mjs`).
- **Local:** `node local.mjs <folder>` puts comments on pages on your computer, no deploy. Claude runs `node local.mjs wait`, which ends with your next comment, fixes the file (the page reloads) and answers on the pin. `--wifi` lets a phone at home join. `node local.mjs --help`.
- **Theme:** set `--lab-accent`, `--lab-bg`, `--lab-fg`, `--lab-radius` or `--lab-font` on `[data-lab-comments]`.

Tested with Claude: on a page with a photo, code and a video, Fable, Sonnet and Haiku found every spot from the link alone (file, pixel, line, second), see [bench](bench/). Admin links and deleting are tested across three labs in [bench/labs](bench/labs/). The script is 17 KB gzipped and loads after the page. Links are hidden, not locked, so don't put anything confidential there.

MIT · Inter under the SIL OFL · made by [OOZE](https://ooze.design)
