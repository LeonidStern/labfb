# Benchmarks

Two questions: how well does an agent read client comments from a link, and how fast does a lab page open next to a Claude artifact. Measured on 2026-11-13. Rerun them with the scripts in [`bench/`](bench/).

## 1. Reading comments by link

`bench/agent-read.sh <url> ...` opens each link the way an agent's web fetch does: one plain request, no login, no JavaScript.

| Link | Status | Bytes | Visible text | Comments in it |
|---|---|---|---|---|
| Lab agent link, demo page with 2 comments and 2 replies | 200 | 936 | 933 chars (~230 tokens) | 2 of 2, with replies |
| Claude artifact link (shared to its owner only) | 200 | 37,362 | 57 chars: "Claude Artifact Content is user-generated and unverified." | 0 |

- The lab link is plain text, one fact per line: the comment, what it's on (image file, spot in the original pixels, quoted words, video time), the section, the viewport, the build, and the replies. One request, any agent, no keys.
- An artifact link gives a no-login agent an app shell. The page and its comments load later with JavaScript and a signed-in session.
- From the owner's own Claude session, an artifact can be read as raw HTML, but its comments aren't in that HTML. They need a separate comments call.
- Not measured yet: an artifact shared as "anyone with the link", and agents other than curl and Claude's web fetch.

## 2. Opening a page

`node bench/page-speed.mjs <url> ...`: a fresh browser context per load (empty cache), desktop 1440×900, median of 3 cold loads.

**A lab page** (a real client page: static Astro, CSS-only animation, one hero image), served by `astro preview` on the same machine:

| | |
|---|---|
| first paint / largest paint | 236 ms / 236 ms |
| load | 328 ms |
| requests | 4 |
| transferred | 85 KB, 0 KB of JS |

Lighthouse 12 on the same build: **100** desktop (FCP/LCP 0.6 s, TBT 0, CLS 0), **93** mobile with Moto G throttling (FCP/LCP 1.5 s, TBT 300 ms, CLS 0), 89 KB total.

The comment layer adds one script: 40 KB raw, 12.6 KB gzipped, loaded with `defer`, so it never blocks the first paint.

**A Claude artifact**, same browser, same settings: not comparable yet. Without a signed-in session, an owner-only artifact opens to "Couldn't load artifact" after 7 requests and 49 KB (17 KB of JS). A fair number needs an artifact shared as "anyone with the link".

**Caveats.** The lab page was served locally, so its numbers leave out the network and Vercel's CDN. On Vercel, add the round trip to the nearest edge. Check the live page with [PageSpeed Insights](https://pagespeed.web.dev/).

## Rerun

```sh
# comments: an agent link vs any other link
bench/agent-read.sh https://lab.example.com/_lab/agent/<page path> https://claude.ai/artifact/<id>

# page speed
npm i -D playwright && npx playwright install chromium
node bench/page-speed.mjs https://lab.example.com/<slug>/<project>/<secret>/<page> https://claude.ai/artifact/<id>

# Lighthouse
npx lighthouse https://lab.example.com/<page> --only-categories=performance --preset=desktop
```
