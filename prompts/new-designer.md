Set up this site to be served at https://<lab host>/<slug>/ through the lab proxy.

1. Serve everything under the base path `/<slug>`: CSS, JS, images and links.
   - Astro: `base: '/<slug>'` in astro.config.mjs; use `import.meta.env.BASE_URL` for links and public files.
   - Next.js: `basePath: '/<slug>'` in next.config.js.
   - Vite or plain static: `base: '/<slug>/'`, or put the files in a `<slug>/` folder.
2. Every page answers 200 directly. No redirects, no trailing-slash redirects: the proxy can't follow them and the browser would land on the wrong host.
3. Every page sends `<meta name="robots" content="noindex, nofollow">` and the header `X-Robots-Tag: noindex, nofollow` (Vercel: a `headers` entry in vercel.json).
4. Client pages live at `/<slug>/<project>/<secret>/<page>`. `<secret>` is 10 random lowercase letters and digits (`openssl rand -hex 5`), one per project. Nothing links to secret pages from `/<slug>` or `/<slug>/<project>`. No sitemap.
5. Deploy to your own Vercel project and check `https://<your-project>.vercel.app/<slug>` returns 200. Send that production URL (not a preview URL) to the lab owner.

The secret path only hides a page. Anyone with the link can open it, so nothing truly confidential goes there.
