// End-to-end check of local mode with no browser: serve a folder, post a comment, `wait` hears it, `reply` answers it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-test-'));
const PORT = String(4600 + Math.floor(Math.random() * 300));
const B = `http://localhost:${PORT}`;
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><title>t</title><h1 id="t">Hello</h1>');

const run = (args, opts = {}) =>
  new Promise((resolve) => execFile(process.execPath, [LAB, ...args], { cwd: DIR, ...opts }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, out: stdout + stderr })));
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--no-fast', '--port', PORT], { cwd: DIR, env: { ...process.env, PORT } });
after(() => {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});

const up = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(B + '/');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
};
const post = (body) =>
  fetch(B + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify(body) }).then((r) => r.json());

test('--version prints the package version', async () => {
  const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal((await run(['--version'])).out.trim(), version);
});

test('pages get the comment layer', async () => {
  const html = await (await up()).text();
  assert.match(html, /_lab\/comments\.js/);
  assert.match(html, /Hello/);
});

test('wait hears a new comment, reply answers it, the text file has both', async () => {
  await up();
  const waiting = run(['wait', '--timeout', '10']);
  await new Promise((r) => setTimeout(r, 400));
  const { comment } = await post({ page: '/index', name: 'Leo', text: 'make the title red', anchor: { selector: '#t', x: 0.1, y: 0.5, docX: 0.1, docY: 20, width: 1000, element: '<h1 id="t">' } });
  assert.ok(comment?.id, 'comment saved');
  const heard = await waiting;
  assert.match(heard.out, /make the title red/);
  assert.match(heard.out, new RegExp(comment.id));
  const replied = await run(['reply', comment.id, 'Done: the title is red', '--resolve']);
  assert.equal(replied.code, 0, replied.out);
  const list = await (await fetch(B + '/_lab/api/comments?page=/index')).json();
  const all = list.comments || list;
  assert.ok(all.some((c) => c.parent === comment.id && /title is red/.test(c.text)), 'reply stored under the comment');
});

test('unknown options are refused', async () => {
  const { code, out } = await run(['--nope']);
  assert.notEqual(code, 0);
  assert.match(out, /Unknown option --nope/);
});
