// Closing every page ends the open wait after a grace period, so closed pages don't keep a session listening.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-close-'));
const PORT = String(4600 + Math.floor(Math.random() * 300) + 300);
fs.writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><h1>Hi</h1>');
const server = spawn(process.execPath, [LAB, '.', '--no-open', '--port', PORT], { cwd: DIR, env: { ...process.env, LAB_CLOSE_GRACE: '1' } });
after(() => {
  server.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = () =>
  new Promise((resolve) => {
    const t0 = Date.now();
    execFile(process.execPath, [LAB, 'wait', '--timeout', '20'], { cwd: DIR }, (err, stdout) => resolve({ out: stdout, ms: Date.now() - t0 }));
  });
// A page is open while it holds the live stream.
const openPage = () =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/_lab/live', headers: { host: `localhost:${PORT}` } }, (res) => resolve(() => res.destroy()));
    req.on('error', () => {});
  });

test('server starts', async () => {
  for (let i = 0; i < 50 && !fs.existsSync(path.join(DIR, '.lab/server.json')); i++) await sleep(100);
  await sleep(200);
  assert.ok(fs.existsSync(path.join(DIR, '.lab/server.json')));
});

test('with no page open, wait ends after the grace and says the page was closed', async () => {
  const { out, ms } = await wait();
  assert.match(out, /page was closed/);
  assert.ok(ms < 8000, `ended in ${ms} ms`);
});

test('while a page is open, wait keeps listening; closing it ends the wait', async () => {
  const close = await openPage();
  const pending = wait();
  await sleep(2500); // longer than the grace: still listening
  let done = false;
  pending.then(() => (done = true));
  await sleep(50);
  assert.equal(done, false, 'still listening while the page is open');
  close();
  const { out } = await pending;
  assert.match(out, /page was closed/);
});

test('a reload (close then reopen within the grace) keeps listening', async () => {
  let close = await openPage();
  const pending = wait();
  await sleep(300);
  close();
  await sleep(300);
  close = await openPage();
  let done = false;
  pending.then(() => (done = true));
  await sleep(1500);
  assert.equal(done, false, 'still listening after a reload');
  close();
  await pending;
});
