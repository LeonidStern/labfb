// The quick model is on by default when the claude command is installed, off without it, and --no-fast turns it off.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = fileURLToPath(new URL('../local.mjs', import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'labfb-fast-'));
const BIN = path.join(DIR, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'claude'), '#!/bin/sh\necho "Done: nothing"\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'claude.cmd'), '@echo Done: nothing\r\n');
fs.mkdirSync(path.join(DIR, 'site'));
fs.writeFileSync(path.join(DIR, 'site', 'index.html'), '<!doctype html><h1>Hi</h1>');
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

let port = 4950 + Math.floor(Math.random() * 40);
const start = (args, PATH) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [LAB, 'site', '--no-open', '--port', String(port++), ...args], { cwd: DIR, env: { ...process.env, PATH } });
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (/quick model (on|off)/.test(out)) {
        p.kill();
        resolve(out);
      }
    });
    setTimeout(() => (p.kill(), resolve(out)), 8000);
  });
const plain = process.platform === 'win32' ? process.env.PATH : '/usr/bin:/bin';

test('on when the claude command is installed', async () => {
  assert.match(await start([], BIN + path.delimiter + plain), /quick model on/);
});
test('--no-fast turns it off', async () => {
  assert.match(await start(['--no-fast'], BIN + path.delimiter + plain), /quick model off/);
});
test('off without the claude command', { skip: process.platform === 'win32' }, async () => {
  assert.match(await start([], plain), /quick model off/);
});
