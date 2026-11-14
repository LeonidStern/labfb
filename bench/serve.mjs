// Local lab for the benchmark: serves public/ and bench/site at /bench, runs api/lab-comments.mjs with an in-memory store.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { apiOn, callApi, sendFile } from '../lib/dev.mjs';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.env.LAB_HOST ??= 'localhost';
process.env.LAB_COMMENTS_ADMIN_TOKEN ??= 'admintoken';
const api = await apiOn(new Map(), REPO);
const port = Number(process.env.PORT || 4321);
export const ready = new Promise((r) => (globalThis.__ready = r));
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/_lab/api/comments' || url.pathname.startsWith('/_lab/agent/')) {
      const target = new URL(url);
      if (url.pathname.startsWith('/_lab/agent/')) {
        target.pathname = '/api/lab-comments';
        target.search = `?format=text&page=${encodeURIComponent(url.pathname.slice('/_lab/agent'.length))}`;
      }
      const out = api[req.method] ? await callApi(api[req.method], req, target) : new Response('method not allowed', { status: 405 });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    const bench = url.pathname === '/bench' || url.pathname.startsWith('/bench/');
    const root = bench ? path.join(REPO, 'bench/site') : path.join(REPO, 'public');
    let file = path.join(root, decodeURIComponent(bench ? url.pathname.slice('/bench'.length) || '/' : url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
    sendFile(req, res, file);
  } catch (e) {
    console.error(e);
    if (res.headersSent) res.destroy();
    else res.writeHead(500).end(String(e));
  }
}).listen(port, () => { console.log(`http://localhost:${port}/bench/`); globalThis.__ready(); });
