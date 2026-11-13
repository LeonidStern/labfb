// Pins three comments on bench/site (photo, code, video) the way a person would, then checks that the
// agent link alone is enough to find each spot in the source. Run: node bench/run.mjs  (needs playwright)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
process.env.PORT ||= '4390';
const { ready } = await import('./serve.mjs');
await ready;
const BASE = `http://localhost:${process.env.PORT}`;
const PAGE = '/bench';

// What a correct answer looks like. The agent has to get here from the link and the repo only.
export const truth = {
  photo: { file: 'media/shapes.jpg', box: [1700, 200, 2100, 600], ask: 'make this smaller' },
  code: { file: 'src/button.ts', line: 20, ask: 'less padding here' },
  video: { file: 'media/countdown.webm', from: 5, to: 6, box: [980, 80, 1180, 200], ask: 'remove this' },
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem('lab-name', 'Leo'));
await page.goto(BASE + PAGE + '/'); // trailing slash so media/ resolves; comments key on /bench
const lab = (sel) => page.locator(`[data-lab-comments] ${sel}`);
await lab('.toggle').click();
const say = async (text) => {
  await lab('.float textarea').fill(text);
  await lab('.float textarea').press('Enter');
  await lab('.card').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
};
const clickAt = async (x, y) => { await page.mouse.click(x, y); await lab('.float textarea').waitFor(); };

// 1. Photo: click the middle of the red circle.
const img = page.locator('img');
await img.scrollIntoViewIfNeeded();
let b = await img.boundingBox();
await clickAt(b.x + (1900 / 2400) * b.width, b.y + (400 / 1600) * b.height);
await say(truth.photo.ask);

// 2. Code: click the word "padding" on line 20 (the ghost button), not the same word on line 14.
const spot = await page.evaluate(() => {
  const node = document.querySelector('pre code').firstChild;
  const text = node.textContent;
  const at = text.indexOf('padding', text.indexOf('ghost:'));
  const r = document.createRange();
  r.setStart(node, at + 2);
  r.setEnd(node, at + 3);
  r.startContainer.parentElement.scrollIntoView({ block: 'center' });
  const box = r.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await clickAt(spot.x, spot.y);
await say(truth.code.ask);

// 3. Video: pause at 5.4 s, Alt-click the red box.
const video = page.locator('video');
await video.scrollIntoViewIfNeeded();
await video.evaluate(async (v) => {
  if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  v.pause();
  await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = 5.4; });
});
b = await video.boundingBox();
// A video with controls takes Alt/Option-click, so its play button still works.
await page.keyboard.down('Alt');
await clickAt(b.x + (1080 / 1280) * b.width, b.y + (140 / 720) * b.height);
await page.keyboard.up('Alt');
await say(truth.video.ask);
await browser.close();

// What the agent gets from the link: no login, no browser.
const res = await fetch(`${BASE}/_lab/agent${PAGE}`);
const text = await res.text();
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./results/lab-agent-text.txt', import.meta.url), text);

// Can each spot be found from the text alone? The same checks run on any link's text.
const src = fs.readFileSync(new URL('./site/src/button.ts', import.meta.url), 'utf8').split('\n');
function score(text) {
  const blocks = text.split('\n## ').slice(1);
  const find = (ask) => blocks.find((x) => x.includes(`comment: ${ask}`)) || '';
  const checks = [];
  const check = (name, ok, got) => checks.push({ name, ok: Boolean(ok), got });
  {
    const t = find(truth.photo.ask);
    const m = t.match(/pixels (\d+),(\d+)/) || t.match(/spot in original: ([\d.]+)% across, ([\d.]+)% down of (\d+)×(\d+)/);
    check('photo: file named', t.includes('"shapes"'), t.match(/on: .*/)?.[0]);
    let x, y;
    if (m && m[3]) [x, y] = [(m[1] / 100) * m[3], (m[2] / 100) * m[4]]; else if (m) [x, y] = [+m[1], +m[2]];
    const [x1, y1, x2, y2] = truth.photo.box;
    check('photo: spot inside the circle, in original pixels', x >= x1 && x <= x2 && y >= y1 && y <= y2, m?.[0]);
  }
  {
    const t = find(truth.code.ask);
    const label = t.match(/on: code "([^"]+)"/)?.[1];
    const m = t.match(/line: (\d+) of (\d+) in the block: (.*)/);
    check('code: file named', label === truth.code.file, t.match(/on: .*/)?.[0]);
    check('code: line number is the right one', m && +m[1] === truth.code.line && src[+m[1] - 1].trim() === m[3], m?.[0]);
    // The same line text is on line 14 too, so the text alone would be ambiguous: the number decides.
    const same = m ? src.filter((l) => l.trim() === m[3]).length : 0;
    check('code: line text matches the file', same >= 1, `${same} lines in the file read the same`);
  }
  {
    const t = find(truth.video.ask);
    const time = t.match(/video time: (\d+):(\d+(?:\.\d)?)/);
    const sec = time ? +time[1] * 60 + +time[2] : NaN;
    check('video: file named', t.includes('"countdown"'), t.match(/on: .*/)?.[0]);
    check('video: time within the second the box is on screen', sec >= truth.video.from && sec < truth.video.to, time?.[0]);
    const m = t.match(/spot in original: ([\d.]+)% across, ([\d.]+)% down of (\d+)×(\d+)/);
    const [x, y] = m ? [(m[1] / 100) * m[3], (m[2] / 100) * m[4]] : [];
    const [x1, y1, x2, y2] = truth.video.box;
    check('video: spot inside the red box, in frame pixels', x >= x1 && x <= x2 && y >= y1 && y <= y2, m?.[0]);
  }
  return checks;
}
const checks = score(text);
const bytes = Buffer.byteLength(text);
const summary = { link: `${BASE}/_lab/agent${PAGE}`, bytes, approxTokens: Math.round(bytes / 4), passed: checks.filter((c) => c.ok).length, total: checks.length, checks };
fs.writeFileSync(new URL('./results/lab-checks.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
for (const c of checks) console.log(c.ok ? 'ok  ' : 'FAIL', c.name, '·', c.got);

// Optional: the same page as a shared Claude artifact, fetched the way an agent without your login would.
if (process.env.ARTIFACT_URL) {
  const r = await fetch(process.env.ARTIFACT_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const art = score(visible);
  const comments = Object.values(truth).filter((t) => visible.includes(t.ask)).length;
  const result = { link: process.env.ARTIFACT_URL, status: r.status, bytes: Buffer.byteLength(html), visibleText: visible.slice(0, 200), commentsFound: comments, passed: art.filter((c) => c.ok).length, total: art.length, checks: art };
  fs.writeFileSync(new URL('./results/artifact-checks.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(`artifact: ${result.passed}/${result.total} · ${result.bytes} bytes · ${comments}/3 comments in the response · text: "${result.visibleText}"`);
}
console.log(`${summary.passed}/${summary.total} · ${bytes} bytes (~${summary.approxTokens} tokens) · ${summary.link}`);
if (process.env.KEEP) console.log('server stays up for agent runs (KEEP=1)');
else process.exit(summary.passed === summary.total ? 0 : 1);
