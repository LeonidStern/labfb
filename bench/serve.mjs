// Local lab for the benchmark: serves public/ and bench/site at /bench, runs api/lab-comments.mjs, fakes Upstash in memory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.env.LAB_HOST ??= 'localhost';
process.env.KV_REST_API_URL = 'http://upstash.mock';
process.env.KV_REST_API_TOKEN = 't';
process.env.LAB_COMMENTS_ADMIN_TOKEN ??= 'admintoken';
const db = new Map();
const hash = (k) => db.get(k) ?? (db.set(k, new Map()), db.get(k));
const cmds = {
  HSET: (k, f, v) => { const h = hash(k); const isNew = !h.has(f); h.set(f, v); return isNew ? 1 : 0; },
  HGET: (k, f) => (db.get(k)?.get(f) ?? null),
  HDEL: (k, f) => (db.get(k)?.delete(f) ? 1 : 0),
  HVALS: (k) => [...(db.get(k)?.values() ?? [])],
  HLEN: (k) => db.get(k)?.size ?? 0,
  HEXISTS: (k, f) => (db.get(k)?.has(f) ? 1 : 0),
  INCR: (k) => { const v = (db.get(k) || 0) + 1; db.set(k, v); return v; },
  EXPIRE: () => 1,
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('http://upstash.mock')) {
    const [name, ...args] = JSON.parse(init.body);
    const fn = cmds[name];
    if (!fn) return Response.json({ error: `ERR unknown ${name}` }, { status: 400 });
    return Response.json({ result: fn(...args) });
  }
  return realFetch(url, init);
};
const api = await import(path.join(REPO, 'api/lab-comments.mjs'));
const types = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ts': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const port = Number(process.env.PORT || 4321);
export const ready = new Promise((r) => (globalThis.__ready = r));
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let handlerUrl = null;
    if (url.pathname === '/_lab/api/comments') handlerUrl = url;
    else if (url.pathname.startsWith('/_lab/agent/')) {
      handlerUrl = new URL(url);
      handlerUrl.pathname = '/api/lab-comments';
      handlerUrl.search = `?format=text&page=${encodeURIComponent(url.pathname.slice('/_lab/agent'.length))}`;
    }
    if (handlerUrl) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress);
      const request = new Request(handlerUrl, { method: req.method, headers, body: /GET|HEAD/.test(req.method) ? undefined : Buffer.concat(chunks) });
      const fn = api[req.method];
      const out = fn ? await fn(request) : new Response('method not allowed', { status: 405 });
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
    const type = types[path.extname(file)] || 'application/octet-stream';
    const size = fs.statSync(file).size;
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) { // video seeking needs byte ranges
      const start = range[1] ? +range[1] : size - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500).end(String(e)); }
}).listen(port, () => { console.log(`http://localhost:${port}/bench/`); globalThis.__ready(); });
