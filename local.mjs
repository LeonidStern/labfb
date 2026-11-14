#!/usr/bin/env node
// labfb local: pin comments on a folder of local pages, for you and your agent, with no deploy.
//
//   node local.mjs [folder] [--port 4400]      serve the folder at http://localhost:4400 with comments on every page
//   node local.mjs reply <id> "text"           answer a comment on the page, as Claude (LAB_AGENT_NAME to change)
//   node local.mjs resolve <id>                resolve a comment
//
// Comments are kept in <folder>/.lab/comments.json and written out as plain text to <folder>/.lab/comments.md
// after every change, so an agent reads them as a file. Every new comment or reply is also printed as one line
// on stdout and appended to <folder>/.lab/inbox.jsonl: an agent that started the server (or tails the file)
// hears about it the moment it is posted. Pages reload by themselves when a file in the folder changes.
// Same API and widget as the lab domain (api/lab-comments.mjs, public/_lab/comments.js). Node 20+, no packages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};

// ---------- CLI: reply / resolve, through the running server so open pages update ----------
if (args[0] === 'reply' || args[0] === 'resolve') {
  const [action, id, ...rest] = args;
  const dir = path.resolve(flag('--dir', process.env.LAB_DIR || '.'));
  const server = JSON.parse(fs.readFileSync(path.join(dir, '.lab/server.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(dir, '.lab/comments.json'), 'utf8'));
  const page = Object.keys(data).find((p) => data[p][id]);
  if (!page) {
    console.error(`no comment with id ${id}`);
    process.exit(1);
  }
  const body = action === 'reply'
    ? { page, parent: id, name: process.env.LAB_AGENT_NAME || 'Claude', text: rest.join(' ') }
    : { page, action: 'resolve', id };
  const res = await fetch(`http://localhost:${server.port}/_lab/api/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-lab-admin': server.token, 'x-lab-agent': '1' },
    body: JSON.stringify(body),
  });
  console.log(res.ok ? `${action === 'reply' ? 'replied' : 'resolved'} on ${page}` : await res.text());
  process.exit(res.ok ? 0 : 1);
}

// ---------- server ----------
const ROOT = path.resolve(args[0] || '.');
const PORT = Number(flag('--port', process.env.PORT || 4400));
const LAB = path.join(ROOT, '.lab');
fs.mkdirSync(LAB, { recursive: true });
const DATA = path.join(LAB, 'comments.json');
const TOKEN = randomBytes(12).toString('hex');

process.env.LAB_HOST = 'localhost';
process.env.LAB_COMMENTS_ALLOW_ANY_HOST = '1';
process.env.KV_REST_API_URL = 'http://lab.local';
process.env.KV_REST_API_TOKEN = 'local';
process.env.LAB_COMMENTS_ADMIN_TOKEN = TOKEN;

// The API talks to Upstash over REST; here the same commands run on a JSON file.
const saved = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : {};
const db = new Map(Object.entries(saved).map(([page, h]) => [`lab:comments:${page}`, new Map(Object.entries(h).map(([id, c]) => [id, JSON.stringify(c)]))]));
const hash = (k) => db.get(k) ?? (db.set(k, new Map()), db.get(k));
const cmds = {
  HSET: (k, f, v) => { const h = hash(k); const isNew = !h.has(f); h.set(f, v); return isNew ? 1 : 0; },
  HGET: (k, f) => db.get(k)?.get(f) ?? null,
  HDEL: (k, f) => (db.get(k)?.delete(f) ? 1 : 0),
  HVALS: (k) => [...(db.get(k)?.values() ?? [])],
  HLEN: (k) => db.get(k)?.size ?? 0,
  HEXISTS: (k, f) => (db.get(k)?.has(f) ? 1 : 0),
  INCR: (k) => { const v = (db.get(k) || 0) + 1; db.set(k, v); return v; },
  EXPIRE: () => 1,
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('http://lab.local')) return realFetch(url, init);
  const [name, ...rest] = JSON.parse(init.body);
  return Response.json({ result: cmds[name](...rest) });
};
const api = await import(path.join(REPO, 'api/lab-comments.mjs'));

// Which file each page came from, so the agent text can name it.
const FILES = path.join(LAB, 'pages.json');
const files = fs.existsSync(FILES) ? JSON.parse(fs.readFileSync(FILES, 'utf8')) : {};
const pages = () => [...db.keys()].filter((k) => k.startsWith('lab:comments:') && db.get(k).size).map((k) => k.slice('lab:comments:'.length));
const origin = `http://localhost:${PORT}`;
const agentText = async (page) => {
  const res = await api.GET(new Request(`${origin}/api?format=text&page=${encodeURIComponent(page)}`, { headers: { host: 'localhost' } }));
  const text = (await res.text()).replaceAll('https://localhost', origin);
  return files[page] ? text.replace(/^(page: .*)$/m, `$1\nfile: ${files[page]}`) : text;
};

async function persist() {
  const out = {};
  for (const page of pages()) out[page] = Object.fromEntries([...db.get(`lab:comments:${page}`)].map(([id, v]) => [id, JSON.parse(v)]));
  fs.writeFileSync(DATA, JSON.stringify(out, null, 2));
  const texts = await Promise.all(pages().map(agentText));
  const head = `<!-- labfb local: comments on pages in ${ROOT}. Reply: node ${path.join(REPO, 'local.mjs')} reply <id> "text" (run in ${ROOT}) -->\n\n`;
  fs.writeFileSync(path.join(LAB, 'comments.md'), head + (texts.join('\n') || 'No comments yet.\n'));
}
await persist();

// Pages are keyed like lab paths: /mockup.html and /mockup are one page, / is /index.
const pageKey = (p) =>
  '/' + (decodeURIComponent(p).replace(/\.html?$/, '').replace(/\/index$/, '').split('/').filter(Boolean)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[^a-z0-9_]+/, '')).filter(Boolean).join('/') || 'index');

// Live: one event stream per open page. "reload" when a file changes, "comments" when comments change.
const clients = new Set();
const broadcast = (msg) => { for (const res of clients) res.write(`data: ${msg}\n\n`); };
let reloadTimer;
fs.watch(ROOT, { recursive: true }, (_, file) => {
  if (!file || file.split(path.sep).some((s) => s.startsWith('.') || s === 'node_modules')) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => broadcast('reload'), 80);
});

function announce(page, comment, fromAgent) {
  if (fromAgent) return;
  const roots = [...db.get(`lab:comments:${page}`).values()].map((v) => JSON.parse(v)).filter((c) => !c.parent && !c.resolved)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const n = roots.findIndex((c) => c.id === (comment.parent || comment.id)) + 1;
  const what = comment.parent ? `reply on ${n}` : `comment ${n}`;
  console.log(`[lab] ${what} on ${page} · ${comment.name}: ${comment.text.replace(/\s+/g, ' ')}  (id ${comment.id}, details in .lab/comments.md)`);
  fs.appendFileSync(path.join(LAB, 'inbox.jsonl'), JSON.stringify({ page, n, ...comment }) + '\n');
}

const inject = `
<script>try{localStorage.setItem('lab-admin',${JSON.stringify(TOKEN)});if(localStorage.getItem('lab-on')===null)localStorage.setItem('lab-on','1')}catch{}</script>
<script src="/_lab/comments.js" data-enable="always" defer></script>
<script>(()=>{const k='lab-scroll:'+location.pathname;try{const y=sessionStorage.getItem(k);if(y!==null){sessionStorage.removeItem(k);addEventListener('load',()=>scrollTo(0,+y))}}catch{}
const busy=()=>document.querySelector('[data-lab-comments]')?.shadowRoot?.activeElement;
const reload=()=>{if(busy())return setTimeout(reload,500);try{sessionStorage.setItem(k,scrollY)}catch{}location.reload()};
const es=new EventSource('/_lab/live');es.onmessage=(e)=>e.data==='reload'?reload():dispatchEvent(new Event('lab:refresh'))})()</script>
`;

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/_lab/live') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hi\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/_lab/api/comments' || url.pathname.startsWith('/_lab/agent/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = Buffer.concat(chunks).toString();
      let page;
      if (url.pathname.startsWith('/_lab/agent/')) {
        page = pageKey(url.pathname.slice('/_lab/agent'.length));
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end(await agentText(page));
        return;
      }
      if (req.method === 'GET') url.searchParams.set('page', pageKey(url.searchParams.get('page') || '/'));
      else {
        const parsed = JSON.parse(body || '{}');
        page = parsed.page = pageKey(parsed.page || '/');
        body = JSON.stringify(parsed);
      }
      const headers = new Headers({ host: 'localhost', 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' });
      if (req.headers['x-lab-admin']) headers.set('x-lab-admin', req.headers['x-lab-admin']);
      const out = await api[req.method]?.(new Request(`${origin}/api${url.search}`, { method: req.method, headers, body: req.method === 'GET' ? undefined : body }));
      if (!out) return res.writeHead(405).end();
      const text = await out.text();
      if (req.method === 'POST' && out.ok) {
        await persist();
        broadcast('comments');
        const { comment } = JSON.parse(text);
        if (out.status === 201) announce(page, comment, req.headers['x-lab-agent'] === '1');
      }
      res.writeHead(out.status, { 'content-type': out.headers.get('content-type') || 'application/json' });
      res.end(text);
      return;
    }

    // The widget and its fonts come from this repo; everything else from the folder.
    const lab = url.pathname.startsWith('/_lab/');
    const base = lab ? path.join(REPO, 'public') : ROOT;
    let file = path.join(base, decodeURIComponent(url.pathname));
    if (!file.startsWith(base)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!fs.existsSync(path.join(file, 'index.html'))) return listing(res, file, url.pathname);
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (type.startsWith('text/html')) {
      const rel = path.relative(ROOT, file);
      if (!lab && files[pageKey(url.pathname)] !== rel) {
        files[pageKey(url.pathname)] = rel;
        fs.writeFileSync(FILES, JSON.stringify(files, null, 2));
      }
      let html = fs.readFileSync(file, 'utf8');
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${inject}</body>`) : html + inject;
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      return res.end(html);
    }
    const size = fs.statSync(file).size;
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) { // video seeking needs byte ranges
      const start = range[1] ? +range[1] : size - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  fs.writeFileSync(path.join(LAB, 'server.json'), JSON.stringify({ port: PORT, token: TOKEN }));
  console.log(`[lab] ${origin}  (pages from ${ROOT}; comments in .lab/comments.md)`);
});

function listing(res, dir, urlPath) {
  const items = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => !d.name.startsWith('.') && (d.isDirectory() || /\.html?$/.test(d.name)));
  const prefix = urlPath.endsWith('/') ? urlPath : urlPath + '/';
  const li = items.map((d) => `<li><a href="${prefix}${encodeURIComponent(d.name)}${d.isDirectory() ? '/' : ''}">${d.name}</a></li>`).join('');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset=utf-8><title>lab</title><body style="font:15px/1.6 system-ui;margin:40px"><ul>${li || '<li>no pages yet</li>'}</ul></body>`);
}
