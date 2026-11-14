// Running labfb in a project: it finds the project's own dev server, and never serves a project's source as pages.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-onboard-')));
fs.mkdirSync(path.join(DIR, 'src'));
fs.writeFileSync(path.join(DIR, 'package.json'), JSON.stringify({ name: 'app', scripts: { dev: 'vite' } }));
const kids = [];
after(() => {
  kids.forEach((k) => k.kill());
  fs.rmSync(DIR, { recursive: true, force: true });
});

const run = (args) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: DIR }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));
const hasLsof = (() => {
  try {
    execFileSync('lsof', ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return e.code !== 'ENOENT';
  }
})();

test('a project whose dev server is not running is refused, not served as files', async () => {
  const { code, out } = await run(['--no-open', '--port', '4999']);
  assert.equal(code, 1, out);
  assert.match(out, /dev server, and it isn't running/);
  assert.ok(!fs.existsSync(path.join(DIR, '.lab')), 'no .lab left behind');
});

test('in a project, a bare run finds the dev server running in that folder', { skip: !hasLsof && 'needs lsof' }, async () => {
  const devPort = 5600 + Math.floor(Math.random() * 300);
  const labPort = String(4700 + Math.floor(Math.random() * 200));
  // A stand-in dev server, running in the project like `npm run dev` would.
  const dev = spawn(process.execPath, ['-e', `require('http').createServer((q,s)=>{s.setHeader('content-type','text/html');s.end('<h1>dev page</h1>')}).listen(${devPort},'127.0.0.1')`], { cwd: DIR });
  kids.push(dev);
  await new Promise((r) => setTimeout(r, 400));
  const lab = spawn(process.execPath, [LAB, '--no-open', '--no-fast', '--port', labPort], { cwd: DIR });
  kids.push(lab);
  let out = '';
  lab.stdout.on('data', (d) => (out += d));
  lab.stderr.on('data', (d) => (out += d));
  let html = '';
  for (let i = 0; i < 50 && !html; i++) {
    try {
      html = await (await fetch(`http://localhost:${labPort}/`)).text();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.match(out, new RegExp(`dev server for this project on :${devPort}`), out);
  assert.match(html, /dev page/);
  assert.match(html, /_lab\/comments\.js/);
});

test('a folder with no index.html at the top lists its pages, not its folders, and opens the first one', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-pages-')));
  fs.mkdirSync(path.join(dir, 'site/about'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib/x.js'), '');
  fs.writeFileSync(path.join(dir, 'site/index.html'), '<title>Home</title><h1>home</h1>');
  fs.writeFileSync(path.join(dir, 'site/about/team.html'), '<h1>team</h1>');
  const port = String(4900 + Math.floor(Math.random() * 90));
  const lab = spawn(process.execPath, [LAB, '--no-open', '--port', port], { cwd: dir });
  kids.push(lab);
  let out = '';
  lab.stdout.on('data', (d) => (out += d));
  let html = '';
  for (let i = 0; i < 50 && !html; i++) {
    try {
      html = await (await fetch(`http://localhost:${port}/`)).text();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.match(html, /href="\/site\/">Home</);
  assert.match(html, /href="\/site\/about\/team\.html">site\/about\/team\.html</);
  assert.doesNotMatch(html, /lib/);
  assert.match(out, /opening site\/index\.html/);
  assert.match(await (await fetch(`http://localhost:${port}/site/`)).text(), /_lab\/comments\.js/);
  fs.rmSync(dir, { recursive: true, force: true });
});
