Add the lab comment layer to every page of this site.

1. In the shared layout (the one every page uses), add this line just before </body>:

   <script is:inline src="https://<lab host>/_lab/comments.js" defer></script>

   In Astro keep `is:inline` so it isn't bundled; in Next.js use a plain <script> in the root layout, or `next/script` with `strategy="afterInteractive"`. Don't copy the file into the repo; it must load from <lab host> so it stays up to date.
2. Nothing else is needed: no package, no keys. The comment layer only switches on when the page is opened through <lab host>, so the .vercel.app address and local dev stay clean.
3. If the site sets a Content-Security-Policy, allow script-src, connect-src and font-src https://<lab host>.
4. Don't add anything with z-index above 2147483000, and don't stop click events on the whole page (e.g. a full-screen invisible overlay), or clients won't be able to pin comments.
5. Deploy, open one page through https://<lab host>/<slug>/..., and check: a "comments" button appears bottom right; press it (or c), then click on the page and an "add a comment" box opens.

Optional, makes comments more precise for agents:
6. Add `<meta name="lab-build" content="...">` to the layout with the short commit the page was built from (in Astro frontmatter: `const build = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);`, render the meta only if set).
7. Give key blocks a stable `data-lab="name"` (e.g. data-lab="hero", data-lab="pricing"); comments report the nearest one, so feedback is easy to find in the source.
8. Keep image file names meaningful (hero-gradient.jpg, not IMG_2031.jpg): comments report the file name.
