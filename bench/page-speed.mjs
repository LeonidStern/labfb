// Cold-load timing for one or more pages, the same way for each.
// Usage: node bench/page-speed.mjs <url> [<url> ...]   (needs Playwright: npm i -D playwright && npx playwright install chromium)
// Each URL gets a fresh browser context (empty cache), desktop 1440×900. Runs 3 times and prints the median.
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('usage: node bench/page-speed.mjs <url> [<url> ...]');
  process.exit(1);
}
const RUNS = 3;
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch();
for (const url of urls) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    let requests = 0, bytes = 0, js = 0;
    page.on('requestfinished', async (req) => {
      requests++;
      const sizes = await req.sizes().catch(() => null);
      const n = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
      bytes += n;
      if (req.resourceType() === 'script') js += n;
    });
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const idle = Date.now() - t0;
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { ttfb: nav.responseStart, fcp: fcp ? fcp.startTime : NaN, lcp: window.__lcp, load: nav.loadEventEnd };
    });
    runs.push({ ...m, idle, requests, kb: bytes / 1024, jsKb: js / 1024 });
    await ctx.close();
  }
  const pick = (k) => Math.round(median(runs.map((r) => r[k])));
  console.log(url);
  console.log(
    `  ttfb ${pick('ttfb')} ms · first paint ${pick('fcp')} ms · largest paint ${pick('lcp')} ms · load ${pick('load')} ms · network idle ${pick('idle')} ms`,
  );
  console.log(`  ${pick('requests')} requests · ${pick('kb')} KB · ${pick('jsKb')} KB of JS  (median of ${RUNS} cold loads)\n`);
}
await browser.close();
