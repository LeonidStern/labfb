// Shared by local.mjs and bench/serve.mjs: the comments API without Upstash, and plain file serving.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// api/lab-comments.mjs talks to Upstash over REST. This answers the same commands from `db`, a Map of hashes,
// and returns the API module. Call it before anything else uses fetch for that URL.
export async function apiOn(db, repo) {
  process.env.KV_REST_API_URL = 'http://lab.store';
  process.env.KV_REST_API_TOKEN = 'local';
  const hash = (k) => db.get(k) ?? (db.set(k, new Map()), db.get(k));
  const cmds = {
    HSET: (k, f, v) => { const h = hash(k); const isNew = !h.has(f); h.set(f, v); return isNew ? 1 : 0; },
    HGET: (k, f) => db.get(k)?.get(f) ?? null,
    HDEL: (k, ...fs) => fs.filter((f) => db.get(k)?.delete(f)).length,
    HVALS: (k) => [...(db.get(k)?.values() ?? [])],
    HLEN: (k) => db.get(k)?.size ?? 0,
    HEXISTS: (k, f) => (db.get(k)?.has(f) ? 1 : 0),
    INCR: (k) => { const v = (db.get(k) || 0) + 1; db.set(k, v); return v; },
    EXPIRE: () => 1,
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('http://lab.store')) return realFetch(url, init);
    const [name, ...args] = JSON.parse(init.body);
    if (!cmds[name]) return Response.json({ error: `ERR unknown ${name}` }, { status: 400 });
    return Response.json({ result: cmds[name](...args) });
  };
  return import(pathToFileURL(path.join(repo, 'api/lab-comments.mjs')).href);
}

// Runs a Node request through a Web-style handler (the API's GET / POST).
export async function callApi(fn, req, url, extraHeaders = {}) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || 'unknown');
  return fn(new Request(url, { method: req.method, headers, body: /GET|HEAD/.test(req.method) ? undefined : Buffer.concat(chunks) }));
}

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// One file, with byte ranges (video seeking). A bad range gets 416, never a crash.
export function sendFile(req, res, file) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = fs.statSync(file).size;
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  let start = 0;
  let end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    if (range[1]) [start, end] = [+range[1], range[2] ? Math.min(+range[2], size - 1) : size - 1];
    else start = Math.max(size - +range[2], 0);
    if (start > end || start >= size) return res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
  } else res.writeHead(200, { ...head, 'content-length': size });
  if (!size) return res.end();
  fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}
