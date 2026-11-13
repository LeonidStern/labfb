// Pin comments for client pages on a lab domain (see public/_lab/comments.js).
// https://github.com/leonidstern/labfb · MIT
// Storage: Upstash Redis over its REST API, one hash per page: field = comment id, value = JSON.
// Env: KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN),
// LAB_HOST (e.g. lab.example.com), LAB_COMMENTS_ADMIN_TOKEN for resolving and deleting (see adminFor()).

import { createHmac, timingSafeEqual } from 'node:crypto';

const LAB_HOST = process.env.LAB_HOST || '';
const MAX = { name: 60, text: 2000, path: 300, selector: 600, context: 400, perPage: 500 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return async (...command) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `store ${res.status}`);
    return data.result;
  };
}

// Only pages proxied under <lab host>/<slug>/... can carry comments.
function pagePath(raw) {
  if (typeof raw !== 'string' || raw.length > MAX.path) return null;
  if (!/^\/[a-z0-9_][a-z0-9_-]*(\/[A-Za-z0-9._~-]+)*\/?$/.test(raw)) return null;
  return raw.replace(/\/+$/, '') || null;
}

const hostOf = (request) => (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();

function fromLab(request) {
  return (LAB_HOST && hostOf(request).split(':')[0] === LAB_HOST) || process.env.LAB_COMMENTS_ALLOW_ANY_HOST === '1';
}

// Admins. LAB_COMMENTS_ADMIN_TOKEN is the owner's key and works on every page.
// Other people get keys signed with it, so nothing to configure per person: the owner (or their agent) asks
//   POST /_lab/api/comments  {"action":"invite","name":"anna","page":"/anna/acme/k3v9qz7mtp/home"}  with header x-lab-admin: <owner token>
// and gets back a link with ?lab-admin=<key>. The key works only under that page's slug (/anna); "scope":"*" for every page.
// Take keys away: LAB_REVOKED="anna, sam" and redeploy, or change the owner token (ends them all).
const NAME = /^[a-z0-9][a-z0-9-]{0,29}$/;
const sign = (name, scope) =>
  createHmac('sha256', process.env.LAB_COMMENTS_ADMIN_TOKEN).update(`lab-admin:${name}:${scope}`).digest('base64url').slice(0, 24);

const sameKey = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The admin this request speaks for on this page, or null.
function adminFor(request, path) {
  const owner = process.env.LAB_COMMENTS_ADMIN_TOKEN;
  const sent = request.headers.get('x-lab-admin');
  if (!owner || !sent) return null;
  if (sameKey(sent, owner)) return { name: 'owner', owner: true };
  const [name, scope, sig, extra] = sent.split('.');
  if (extra !== undefined || !NAME.test(name || '') || !(scope === '*' || NAME.test(scope || '')) || !sig) return null;
  if (!sameKey(sig, sign(name, scope))) return null;
  const revoked = (process.env.LAB_REVOKED || '').split(',').map((s) => s.trim().toLowerCase());
  if (revoked.includes(name)) return null;
  if (scope !== '*' && path !== '/' + scope && !path.startsWith('/' + scope + '/')) return null;
  return { name };
}

const isAdmin = (request, path) => Boolean(adminFor(request, path));

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

const int = (v, max = 100000) => (Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : undefined);
const sec = (v) => (Number.isFinite(v) ? Math.min(Math.max(Math.round(v * 10) / 10, 0), 86400) : undefined);
const KINDS = ['image', 'video', 'canvas', 'svg', 'text', 'background', 'element'];

// Only known fields, each capped, so a page can't stuff arbitrary data into the store.
function cleanAnchor(a) {
  const out = {
    selector: clean(a.selector, MAX.selector),
    x: num(a.x),
    y: num(a.y),
    docX: num(a.docX),
    docY: int(a.docY) ?? 0,
    width: int(a.width, 10000) ?? 0,
    height: int(a.height, 10000),
    dpr: Number.isFinite(a.dpr) ? Math.min(Math.max(a.dpr, 0.5), 8) : undefined,
    kind: KINDS.includes(a.kind) ? a.kind : undefined,
    element: clean(a.element, 200) || undefined,
    inside: clean(a.inside, 100) || undefined,
    section: clean(a.section, 100) || undefined,
    build: clean(a.build, 40) || undefined,
    src: clean(a.src, 500) || undefined,
    file: clean(a.file, 120) || undefined,
    alt: clean(a.alt, 120) || undefined,
    fit: clean(a.fit, 20) || undefined,
    nw: int(a.nw),
    nh: int(a.nh),
    imgX: Number.isFinite(a.imgX) ? num(a.imgX) : undefined,
    imgY: Number.isFinite(a.imgY) ? num(a.imgY) : undefined,
    imgX2: Number.isFinite(a.imgX2) ? num(a.imgX2) : undefined,
    imgY2: Number.isFinite(a.imgY2) ? num(a.imgY2) : undefined,
    zoneText: clean(a.zoneText, 300) || undefined,
    zw: Number.isFinite(a.zw) && a.zw > 0 ? num(a.zw) : undefined,
    zh: Number.isFinite(a.zh) && a.zh > 0 ? num(a.zh) : undefined,
    docW: int(a.docW),
    docH: int(a.docH),
    time: sec(a.time),
    duration: sec(a.duration),
    context: clean(a.context, MAX.context) || undefined, // older widget versions
  };
  if (a.quote && typeof a.quote === 'object') {
    const exact = clean(a.quote.exact, 80);
    if (exact) {
      const edge = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 40) : '');
      out.quote = { exact, prefix: edge(a.quote.prefix), suffix: edge(a.quote.suffix) };
    }
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

export async function GET(request) {
  if (!fromLab(request)) return json({ error: 'not found' }, 404);
  const run = store();
  if (!run) return json({ error: 'comments are not set up yet' }, 503);
  const path = pagePath(new URL(request.url).searchParams.get('page'));
  if (!path) return json({ error: 'bad page' }, 400);

  const values = (await run('HVALS', `lab:comments:${path}`)) || [];
  const comments = values
    .map((v) => {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (new URL(request.url).searchParams.get('format') === 'text') return text(asText(path, comments, hostOf(request)));
  return json({ comments, admin: isAdmin(request, path) });
}

const text = (body) =>
  new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });

const stamp = (iso) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

const area = (x = 0, y = 0) => {
  const v = y < 1 / 3 ? 'top' : y < 2 / 3 ? 'middle' : 'bottom';
  const h = x < 1 / 3 ? 'left' : x < 2 / 3 ? 'center' : 'right';
  return v === 'middle' && h === 'center' ? 'center' : `${v} ${h}`;
};

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${t % 1 ? `.${Math.round((t % 1) * 10)}` : ''}`;

// Plain text for an agent: <lab host>/_lab/agent/<page path> (see vercel.json).
// Short lines, one fact each, so tools that summarise pages keep them intact.
// Numbers match the pins clients see: open comments, oldest first.
function asText(path, comments, host) {
  const origin = `https://${LAB_HOST || host}`;
  // Continuation lines are indented, so a comment can't start a line that reads like a heading or a field.
  const body = (v) => v.replace(/\r?\n/g, '\n  ');
  const roots = comments.filter((c) => !c.parent);
  const open = roots.filter((c) => !c.resolved);
  const resolved = roots.length - open.length;
  const lines = [
    `# Client comments`,
    `page: ${origin}${path}`,
    `open: ${open.length}${resolved ? ` (plus ${resolved} resolved, not listed)` : ''}`,
    `always up to date: ${origin}/_lab/agent${path}`,
    `json: ${origin}/_lab/api/comments?page=${encodeURIComponent(path)}`,
    `Numbers match the pins on the page. To find the spot in the source, trust file and text first; the selector may be stale.`,
  ];
  open.forEach((c, i) => {
    const a = c.anchor || {};
    lines.push('', `## ${i + 1}. ${c.name} · ${stamp(c.createdAt)} · id ${c.id}`, `comment: ${body(c.text)}`);
    if (a.kind === 'image' || a.kind === 'video' || a.kind === 'background') {
      lines.push(`on: ${a.kind}${a.file ? ` "${a.file}" (search the repo's src/ and public/ for it)` : ''}`);
      if (a.src) lines.push(`src: ${a.src}`);
      if (a.alt) lines.push(`alt: ${a.alt}`);
      if (a.nw && a.imgX2 !== undefined) {
        const px = (f, n) => Math.round(f * n);
        lines.push(
          `area in original: ${pct(a.imgX)}–${pct(a.imgX2)} across, ${pct(a.imgY)}–${pct(a.imgY2)} down of ${a.nw}×${a.nh}` +
            ` (pixels ${px(a.imgX, a.nw)},${px(a.imgY, a.nh)} to ${px(a.imgX2, a.nw)},${px(a.imgY2, a.nh)})${a.fit && a.fit !== 'fill' ? ` (object-fit ${a.fit})` : ''}`,
        );
      } else if (a.nw && a.imgX !== undefined)
        lines.push(`spot in original: ${pct(a.imgX)} across, ${pct(a.imgY)} down of ${a.nw}×${a.nh}${a.fit && a.fit !== 'fill' ? ` (object-fit ${a.fit})` : ''}`);
      if (a.kind === 'video' && a.time !== undefined) lines.push(`video time: ${clock(a.time)}${a.duration ? ` of ${clock(a.duration)}` : ''}`);
    } else if (a.kind === 'canvas' || a.kind === 'svg') {
      lines.push(`on: ${a.kind} animation, ${a.nw}×${a.nh} on screen`);
      lines.push(`spot: ${pct(a.imgX)} across, ${pct(a.imgY)} down`);
      if (a.time !== undefined) lines.push(`time: ${a.time} s after the page opened`);
    } else if (a.kind === 'text' && a.quote) {
      lines.push(`on: text`, `text: "…${a.quote.prefix}[${a.quote.exact}]${a.quote.suffix}…"`);
    } else if (a.context) {
      for (const part of a.context.split(' · ').filter(Boolean)) lines.push(part.startsWith('section:') ? part : `on: ${part}`);
    }
    if (a.element) lines.push(`element: ${a.element}`);
    if (a.inside) lines.push(`inside: ${a.inside}`);
    if (a.section) lines.push(`section: "${a.section}"`);
    if (a.zw) {
      lines.push(`type: area comment, ${a.docW}×${a.docH} px on screen`);
      lines.push(`area on element: ${pct(a.x)}–${pct(a.x + a.zw)} across, ${pct(a.y)}–${pct(a.y + a.zh)} down`);
      if (a.zoneText) lines.push(`text in area: "${a.zoneText}"`);
    } else lines.push(`where on element: ${area(a.x, a.y)} (${pct(a.x)} across, ${pct(a.y)} down)`);
    if (a.width) lines.push(`viewport: ${a.width}${a.height ? `×${a.height}` : 'px wide'}${a.dpr ? ` @${a.dpr}x` : ''}`);
    if (a.build) lines.push(`build: ${a.build}`);
    lines.push(`selector (at comment time): ${a.selector || 'body'}`);
    for (const r of comments.filter((r) => r.parent === c.id)) lines.push(`reply: ${r.name} · ${stamp(r.createdAt)}: ${body(r.text)}`);
  });
  return lines.join('\n') + '\n';
}

export async function POST(request) {
  if (!fromLab(request)) return json({ error: 'not found' }, 404);
  const run = store();
  if (!run) return json({ error: 'comments are not set up yet' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const path = pagePath(body?.page);
  if (!path) return json({ error: 'bad page' }, 400);
  const key = `lab:comments:${path}`;

  // Owner only: make an admin link for someone, limited to this page's slug unless scope is "*".
  if (body.action === 'invite') {
    if (!adminFor(request, path)?.owner) return json({ error: 'forbidden' }, 403);
    const name = clean(body.name, 30).toLowerCase();
    const scope = body.scope === '*' ? '*' : path.split('/')[1] || '*';
    if (!NAME.test(name)) return json({ error: 'name: lowercase letters, digits and dashes' }, 400);
    const key = `${name}.${scope}.${sign(name, scope)}`;
    const link = `https://${hostOf(request).split(':')[0]}${path}?lab-admin=${key}`;
    return json({ name, scope, key, link });
  }

  // Resolve / reopen / delete: admin only.
  if (body.action === 'resolve' || body.action === 'reopen' || body.action === 'delete') {
    const admin = adminFor(request, path);
    if (!admin) return json({ error: 'forbidden' }, 403);
    const id = clean(body.id, 40);
    const current = await run('HGET', key, id);
    if (!current) return json({ error: 'not found' }, 404);
    if (body.action === 'delete') {
      await run('HDEL', key, id);
      return json({ ok: true });
    }
    const comment = { ...JSON.parse(current), resolved: body.action === 'resolve', resolvedBy: body.action === 'resolve' ? admin.name : undefined };
    await run('HSET', key, id, JSON.stringify(comment));
    return json({ comment });
  }

  const name = clean(body.name, MAX.name);
  const text = clean(body.text, MAX.text);
  if (!name || !text) return json({ error: 'name and text are required' }, 400);

  const count = await run('HLEN', key);
  if (count >= MAX.perPage) return json({ error: 'too many comments on this page' }, 429);

  const parent = body.parent ? clean(body.parent, 40) : null;
  if (parent && !(await run('HEXISTS', key, parent))) return json({ error: 'thread not found' }, 404);

  // A light per-IP limit on new comments and replies: LAB_COMMENTS_PER_HOUR (default 60).
  // Only posts that will be stored count; admins (resolve, reopen, delete and their own replies) are not limited.
  if (!isAdmin(request, path)) {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const hourKey = `lab:rate:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const used = await run('INCR', hourKey);
    if (used === 1) await run('EXPIRE', hourKey, 3600);
    if (used > (Number(process.env.LAB_COMMENTS_PER_HOUR) || 60)) return json({ error: 'too many comments, try again later' }, 429);
  }

  const anchor = body.anchor || {};
  const comment = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    parent,
    name,
    text,
    createdAt: new Date().toISOString(),
    resolved: false,
    anchor: parent ? null : cleanAnchor(anchor),
  };
  await run('HSET', key, comment.id, JSON.stringify(comment));
  return json({ comment }, 201);
}
