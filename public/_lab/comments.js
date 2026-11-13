/*
 * lab comments: clients click anywhere on a lab page to pin a comment. No login, just a name.
 * https://github.com/leonidstern/lab · MIT
 * Comments are off by default; the bar button or c turns them on (remembered per browser). When on, click anywhere that isn't a link or control to pin one (alt/option-click pins on those too). c (or the bar button) hides
 * and shows them; esc or a click outside closes an open comment. Dragging (mouse/pen) marks an area instead of a point.
 * Include on a page served through your lab domain:
 *   <script src="https://lab.example.com/_lab/comments.js" defer></script>
 * The layer only turns on when the page is opened on the host the script is loaded from (or data-host),
 * so the deployment's own address and local dev stay clean. data-enable="always" turns it on everywhere.
 * Admin (resolve / delete / copy for agent): open any page once with ?lab-admin=<LAB_COMMENTS_ADMIN_TOKEN>; it is kept in this browser.
 */
(() => {
  const script = document.currentScript;
  const labHost = script?.dataset.host || (script?.src ? new URL(script.src, location.href).hostname : location.hostname);
  const enabled = location.hostname === labHost || script?.dataset.enable === 'always';
  if (!enabled || window.__labComments) return;
  window.__labComments = true;

  const API = script?.dataset.api || '/_lab/api/comments';
  const page = location.pathname.replace(/\/+$/, '') || '/';
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k) || '';
      } catch {
        return '';
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };

  const adminParam = new URLSearchParams(location.search).get('lab-admin');
  if (adminParam) {
    store.set('lab-admin', adminParam);
    const url = new URL(location.href);
    url.searchParams.delete('lab-admin');
    history.replaceState(null, '', url);
  }
  const adminToken = store.get('lab-admin');

  let comments = [];
  let isAdmin = false;
  // Off by default: the page looks clean until someone turns comments on (button or c); remembered per browser.
  let on = store.get('lab-on') === '1';
  let openId = null;
  let draft = null; // { anchor, docX, docY }

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.setAttribute('data-lab-comments', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: var(--lab-font, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
          font-size: 15px; line-height: 1.35; font-weight: 400; color: #000; letter-spacing: 0; -webkit-font-smoothing: antialiased; }
      .layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
      .pin { position: absolute; width: 28px; height: 28px; margin: -28px 0 0 0; border-radius: 50% 50% 50% 4px;
             background: #000; border: 2px solid #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18);
             display: grid; place-items: center; cursor: pointer; padding: 0; color: #fff; font-size: 13px; font-weight: 500; }
      .pin.resolved { background: #939393; }
      .pin.draft { background: #FF4A31; }
      .pin.moved { opacity: .5; }
      .zone { position: absolute; border: 1.5px solid #FF4A31; background: rgba(255,74,49,.08); border-radius: 4px; pointer-events: none; }
      .zone.saved { border-color: #000; background: rgba(0,0,0,.05); }
      .pin.new::after { content: ''; position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; border-radius: 50%;
                        background: #FF4A31; border: 2px solid #fff; }
      .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #FF4A31; margin: 0 6px 1px 0; }
      .card { position: absolute; width: 320px; max-width: calc(100vw - 24px); background: #fff; border-radius: 16px;
              border: 1px solid #E9E9E9; box-shadow: 0 12px 40px rgba(0,0,0,.10); padding: 16px; }
      .item + .item { border-top: 1px solid #E9E9E9; margin-top: 12px; padding-top: 12px; }
      .meta { font-size: 13px; color: #878787; margin-bottom: 4px; }
      .meta b { color: #000; font-weight: 500; font-size: 13px; }
      .text { white-space: pre-wrap; word-wrap: break-word; }
      .row { display: flex; gap: 4px; justify-content: flex-end; align-items: center; margin-top: 8px; }
      button.btn { border: 0; border-radius: 40px; padding: 4px 6px; cursor: pointer; background: none; color: #878787; font-size: 13px; }
      button.btn:hover { color: #000; }
      .float { position: absolute; width: 320px; max-width: calc(100vw - 24px); }
      .card .composer { margin-top: 12px; }
      .box { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "text send"; align-items: center; column-gap: 8px;
             background: #fff; border: 1px solid #000; border-radius: 23px; padding: 7px 7px 7px 16px; }
      .float .box { box-shadow: 0 8px 28px rgba(0,0,0,.12); }
      .card .box { border-color: #E9E9E9; }
      .card .box:focus-within, .card .box.open { border-color: #000; }
      .box.open { grid-template-areas: "text text" "line line" "who send"; row-gap: 10px; border-radius: 18px; padding: 12px 10px 10px 16px; }
      .box textarea { grid-area: text; width: 100%; border: 0; background: none; padding: 4px 0; margin: 0; resize: none;
                      min-height: 0; max-height: 200px; overflow-y: auto; outline: none; display: block; }
      .box textarea::placeholder, .who input::placeholder { color: #939393; }
      .line { grid-area: line; height: 1px; background: #E9E9E9; margin: 0 -10px 0 -16px; display: none; }
      .who { grid-area: who; display: none; align-items: baseline; gap: 4px; min-width: 0; font-size: 13px; color: #939393; }
      .who * { font-size: 13px; }
      .who span { color: #939393; }
      .who input { flex: 1; min-width: 0; border: 0; background: none; padding: 0; margin: 0; outline: none; color: #878787; }
      .who input:focus { color: #000; }
      .box.open .line { display: block; }
      .box.open .who { display: flex; }
      .send { grid-area: send; width: 30px; height: 30px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
              background: #E9E9E9; color: #939393; display: grid; place-items: center; transition: background .15s, color .15s; }
      .send.ready { background: #000; color: #fff; }
      .send svg { display: block; }
      .send * { color: inherit; }
      .error { color: #FF4D35; font-size: 13px; padding: 6px 16px 0; }
      .error:empty { display: none; }
      .bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
      .bar button { border: 0; border-radius: 40px; padding: 12px 18px; cursor: pointer; background: #000; color: #fff;
                    box-shadow: 0 6px 24px rgba(0,0,0,.16); font-weight: 500; display: inline-flex; gap: 10px; align-items: center; }
      .bar button * { color: inherit; font-weight: inherit; }
      .bar button.secondary { background: #fff; color: #000; }
      .bar button.secondary kbd { background: #F4F4F4; }
      kbd { font-size: 12px; line-height: 18px; min-width: 20px; padding: 0 5px; border-radius: 4px; text-align: center;
            background: rgba(255,255,255,.18); color: inherit; }
      .hint { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); background: #000; color: #fff;
              padding: 10px 16px; border-radius: 40px; font-size: 14px; pointer-events: none; white-space: nowrap; }
      @media (max-width: 480px) { kbd { display: none; } }
      [hidden] { display: none !important; }
    </style>
    <div class="layer"></div>
    <div class="hint" hidden>click to comment · drag to mark an area · c to hide</div>
    <div class="bar">
      <button class="secondary copy-all" type="button" hidden>copy for agent</button>
      <button class="toggle" type="button"></button>
    </div>`;
  const layer = root.querySelector('.layer');
  const hint = root.querySelector('.hint');
  const toggleBtn = root.querySelector('.toggle');
  const copyBtn = root.querySelector('.copy-all');

  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  // ---------- anchoring ----------
  function selectorFor(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) index++;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    return parts.length ? (parts[0].startsWith('#') ? '' : 'body > ') + parts.join(' > ') : 'body';
  }

  const docWidth = () => Math.max(document.documentElement.scrollWidth, 1);

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const short = (v, n) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // A source-file hint from a (possibly proxied, hashed or optimised) image URL: "clutch-1" from
  // /_astro/clutch-1.Bx3kd9_Z.webp, /_image?href=..., /_vercel/image?url=..., /media/<id>/w800.webp.
  function fileHint(url) {
    if (!url || url.startsWith('data:')) return '';
    try {
      const u = new URL(url, location.href);
      const inner = u.searchParams.get('href') || u.searchParams.get('url');
      if (inner && /\/_(image|vercel\/image|next\/image)/.test(u.pathname)) return fileHint(inner);
      const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      let name = parts.pop() || '';
      if (/^w?\d+(x\d+)?\.\w+$/i.test(name) && parts.length) name = parts.pop();
      return name.replace(/\.(avif|webp|jpe?g|png|gif|svg|mp4|webm|mov)$/i, '').replace(/[._-][A-Za-z0-9_-]{8}$/, '');
    } catch {
      return '';
    }
  }

  const mediaSrc = (m) => {
    const src = m.currentSrc || m.getAttribute('src') || '';
    if (src && !src.startsWith('data:')) return new URL(src, location.href).href;
    const lazy = m.dataset?.src || (m.getAttribute('srcset') || m.dataset?.srcset || '').split(/\s+/)[0];
    return lazy ? new URL(lazy, location.href).href : '';
  };

  // Where the click is inside the original image/video, taking object-fit and object-position into account.
  function naturalSpot(m, rect, cx, cy, nw, nh) {
    if (!nw || !nh || !rect.width || !rect.height) return null;
    const cs = getComputedStyle(m);
    const fit = cs.objectFit || 'fill';
    const pos = (cs.objectPosition || '50% 50%').split(/\s+/).map((v) =>
      v.endsWith('%') ? parseFloat(v) / 100 : { left: 0, top: 0, right: 1, bottom: 1 }[v] ?? 0.5,
    );
    const sx = rect.width / nw;
    const sy = rect.height / nh;
    const scale = { cover: Math.max(sx, sy), contain: Math.min(sx, sy), none: 1, 'scale-down': Math.min(1, sx, sy) }[fit];
    const dw = nw * (scale ?? sx);
    const dh = nh * (scale ?? sy);
    const ox = (rect.width - dw) * (pos[0] ?? 0.5);
    const oy = (rect.height - dh) * (pos[1] ?? pos[0] ?? 0.5);
    return { fit, nw, nh, imgX: clamp01((cx - rect.left - ox) / dw), imgY: clamp01((cy - rect.top - oy) / dh) };
  }

  // The word under the click plus ~40 characters either side, so an agent can grep the source.
  function quoteAt(cx, cy) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(cx, cy);
      if (p) (node = p.offsetNode), (offset = p.offset);
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(cx, cy);
      if (r) (node = r.startContainer), (offset = r.startOffset);
    }
    if (!node || node.nodeType !== 3 || !node.data.trim()) return null;
    // Only when the click is really on the text, not in empty space next to it.
    const range = document.createRange();
    range.selectNodeContents(node);
    const hit = [...range.getClientRects()].some((r) => cx >= r.left - 4 && cx <= r.right + 4 && cy >= r.top - 4 && cy <= r.bottom + 4);
    if (!hit) return null;
    const text = node.data;
    let a = offset;
    let b = offset;
    while (a > 0 && /\S/.test(text[a - 1])) a--;
    while (b < text.length && /\S/.test(text[b])) b++;
    const block = node.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, a, button, label, span, div') || node.parentElement;
    const full = block?.textContent || text;
    const before = full.slice(0, full.indexOf(text) + a);
    const after = full.slice(full.indexOf(text) + b);
    const squash = (v) => v.replace(/\s+/g, ' ');
    return {
      exact: short(text.slice(a, b), 80),
      prefix: squash(before.slice(-80)).replace(/^\s+/, '').slice(-40),
      suffix: squash(after.slice(0, 80)).replace(/\s+$/, '').slice(0, 40),
    };
  }

  function openingTag(node) {
    const attrs = [...node.attributes]
      .filter((a) => /^(id|class|alt|role|aria-label|href|data-[\w-]+)$/.test(a.name))
      .map((a) => `${a.name}="${short(a.value, 60)}"`);
    return `<${node.localName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`.slice(0, 200);
  }

  function anchorAt(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY).filter((n) => n !== host && n !== document.documentElement);
    const target = stack[0] || document.body;
    const rect = target.getBoundingClientRect();
    const anchor = {
      selector: selectorFor(target),
      x: rect.width ? (clientX - rect.left) / rect.width : 0,
      y: rect.height ? (clientY - rect.top) / rect.height : 0,
      docX: (clientX + scrollX) / docWidth(),
      docY: clientY + scrollY,
      width: innerWidth,
      height: innerHeight,
      dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      element: openingTag(target),
    };
    const inside = target.parentElement?.closest('[id], [data-lab]');
    if (inside) anchor.inside = inside.dataset.lab ? `[data-lab="${inside.dataset.lab}"]` : `#${inside.id}`;
    let heading = null;
    for (const h of document.querySelectorAll('h1, h2, h3')) {
      if (h.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(target)) heading = h;
    }
    if (heading) anchor.section = short(heading.textContent, 100);
    const build = document.querySelector('meta[name="lab-build"]')?.content;
    if (build) anchor.build = short(build, 40);

    // What the pin sits on: media first (even under a transparent overlay), then text, then a background image.
    const media = stack.slice(0, 5).find((n) => /^(img|video|canvas|svg)$/.test(n.localName) && !host.contains(n));
    if (media) {
      const r = media.getBoundingClientRect();
      anchor.kind = media.localName === 'img' ? 'image' : media.localName;
      if (media.localName === 'img' || media.localName === 'video') {
        anchor.src = mediaSrc(media);
        anchor.file = fileHint(anchor.src);
        if (media.alt) anchor.alt = short(media.alt, 120);
        const spot = media.localName === 'img'
          ? naturalSpot(media, r, clientX, clientY, media.naturalWidth, media.naturalHeight)
          : naturalSpot(media, r, clientX, clientY, media.videoWidth, media.videoHeight);
        if (spot) Object.assign(anchor, spot);
        if (media.localName === 'video') {
          anchor.time = Math.round(media.currentTime * 10) / 10;
          if (Number.isFinite(media.duration)) anchor.duration = Math.round(media.duration * 10) / 10;
          if (!anchor.file && media.poster) anchor.file = fileHint(media.poster);
        }
      } else {
        // canvas / svg animation: when it was, and where inside it.
        anchor.time = Math.round(performance.now() / 100) / 10;
        anchor.imgX = clamp01((clientX - r.left) / (r.width || 1));
        anchor.imgY = clamp01((clientY - r.top) / (r.height || 1));
        anchor.nw = Math.round(r.width);
        anchor.nh = Math.round(r.height);
      }
    } else {
      const quote = quoteAt(clientX, clientY);
      if (quote) {
        anchor.kind = 'text';
        anchor.quote = quote;
      } else {
        for (let n = target, i = 0; n && n !== document.documentElement && i < 4; n = n.parentElement, i++) {
          const bg = getComputedStyle(n).backgroundImage.match(/url\(["']?(.+?)["']?\)/);
          if (bg) {
            anchor.kind = 'background';
            anchor.src = new URL(bg[1], location.href).href;
            anchor.file = fileHint(anchor.src);
            break;
          }
        }
        anchor.kind ||= 'element';
      }
    }
    return anchor;
  }

  // The stored selector can point at a different element after a redeploy; check it against the
  // file / text fingerprint, look for the right one, and otherwise fall back to the page position.
  function findTarget(anchor) {
    let node = null;
    try {
      node = anchor.selector ? document.querySelector(anchor.selector) : null;
    } catch {}
    const matches = (n) => {
      if (!n) return false;
      if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
        const m = n.closest?.('img, video') || n;
        return fileHint(mediaSrc(m)) === anchor.file;
      }
      if (anchor.quote?.exact) return (n.textContent || '').includes(anchor.quote.exact);
      return true;
    };
    if (node && node !== document.body && matches(node)) return node;
    if (anchor.file && /^(image|video)$/.test(anchor.kind)) {
      return [...document.querySelectorAll('img, video')].find((m) => fileHint(mediaSrc(m)) === anchor.file) || null;
    }
    return null;
  }

  // Pin point (the zone's top-left corner for area comments) and, for areas, the zone box, in page coordinates.
  function position(anchor) {
    const node = findTarget(anchor);
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.width || rect.height) {
        const left = rect.left + scrollX + anchor.x * rect.width;
        const top = rect.top + scrollY + anchor.y * rect.height;
        const zone = anchor.zw ? { left, top, width: anchor.zw * rect.width, height: anchor.zh * rect.height } : null;
        return { left, top, zone };
      }
    }
    const left = anchor.docX * docWidth();
    const top = anchor.docY;
    const zone = anchor.docW ? { left, top, width: anchor.docW, height: anchor.docH } : null;
    return { left, top, zone, moved: true };
  }

  const drawZone = (box, cls) => {
    if (!box) return;
    const z = el('div', { class: `zone ${cls}` });
    Object.assign(z.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    layer.append(z);
  };

  // An area comment: facts come from the middle of the zone; the anchor element is the smallest one that
  // contains the whole zone, so the zone is stored as fractions of it and follows it like a pin.
  function zoneAnchor({ x0, y0, x1, y1 }) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const right = Math.max(x0, x1);
    const bottom = Math.max(y0, y1);
    const anchor = anchorAt((left + right) / 2, (top + bottom) / 2);
    let box = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2).find((n) => n !== host && !host.contains(n));
    const contains = (r) => r.left <= left + 2 && r.top <= top + 2 && r.right >= right - 2 && r.bottom >= bottom - 2;
    while (box && box !== document.body && !contains(box.getBoundingClientRect())) box = box.parentElement;
    box ||= document.body;
    const r = box.getBoundingClientRect();
    Object.assign(anchor, {
      selector: box === document.body ? 'body' : selectorFor(box),
      element: openingTag(box),
      x: r.width ? (left - r.left) / r.width : 0,
      y: r.height ? (top - r.top) / r.height : 0,
      zw: r.width ? Math.min((right - left) / r.width, 1) : 0,
      zh: r.height ? Math.min((bottom - top) / r.height, 1) : 0,
      docX: (left + scrollX) / docWidth(),
      docY: top + scrollY,
      docW: Math.round(right - left),
      docH: Math.round(bottom - top),
    });
    // Text inside the zone, read like a selection from its top-left to its bottom-right corner.
    const caret = (x, y) => {
      if (document.caretPositionFromPoint) {
        const c = document.caretPositionFromPoint(x, y);
        return c && { node: c.offsetNode, offset: c.offset };
      }
      const c = document.caretRangeFromPoint?.(x, y);
      return c && { node: c.startContainer, offset: c.startOffset };
    };
    const from = caret(left + 1, top + 1);
    const to = caret(right - 1, bottom - 1);
    if (from && to && from.node.nodeType === 3 && to.node.nodeType === 3) {
      try {
        const range = document.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        const words = short(range.toString(), 300);
        if (words) anchor.zoneText = words;
      } catch {}
    }
    // The same area inside the original image or video file, when the zone is on one.
    if (/^(img|video)$/.test(box.localName)) {
      const nw = box.naturalWidth || box.videoWidth;
      const nh = box.naturalHeight || box.videoHeight;
      const a = naturalSpot(box, r, left, top, nw, nh);
      const b = naturalSpot(box, r, right, bottom, nw, nh);
      if (a && b) Object.assign(anchor, { imgX: a.imgX, imgY: a.imgY, imgX2: b.imgX, imgY2: b.imgY });
    } else if (anchor.kind === 'image' || anchor.kind === 'video') {
      // Zone is bigger than the media it is centred on: drop the single-point spot, keep the file.
      delete anchor.imgX;
      delete anchor.imgY;
    }
    return anchor;
  }

  // ---------- data ----------
  const headers = () => ({ 'content-type': 'application/json', ...(adminToken ? { 'x-lab-admin': adminToken } : {}) });

  async function load() {
    try {
      const res = await fetch(`${API}?page=${encodeURIComponent(page)}`, { headers: headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      comments = data.comments || [];
      isAdmin = Boolean(data.admin);
    } catch {
      comments = [];
    }
    render();
  }

  async function send(payload) {
    const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ page, ...payload }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `could not save (${res.status})`);
    return data;
  }

  // ---------- copy for an agent ----------
  // The same text an agent gets from <lab host>/_lab/agent<page>, optionally only one comment.
  async function agentText(number) {
    const res = await fetch(`${API}?page=${encodeURIComponent(page)}&format=text`, { cache: 'no-store' });
    const textValue = await res.text();
    if (!number) return textValue;
    const [head, ...blocks] = textValue.split('\n## ');
    return `${head.trim()}\n\n## ${blocks.find((b) => b.startsWith(`${number}. `)) || ''}`.trim() + '\n';
  }

  async function copy(textPromise, button) {
    const textValue = await textPromise;
    try {
      await navigator.clipboard.writeText(textValue);
    } catch {
      const area = document.createElement('textarea');
      area.value = textValue;
      area.style.cssText = 'position:fixed;opacity:0;';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    const label = button.textContent;
    button.textContent = 'copied';
    setTimeout(() => (button.textContent = label), 1400);
  }

  // ---------- render ----------
  const threads = () => comments.filter((c) => !c.parent && (isAdmin || !c.resolved));
  // Open comments are numbered 1, 2, 3… in order, the same for clients, admins and the agent text.
  const numberOf = (c) =>
    comments
      .filter((x) => !x.parent && !x.resolved)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .indexOf(c) + 1;

  // Unread: comments and replies by someone else that this browser hasn't opened yet (kept per page).
  const seenKey = `lab-seen:${page}`;
  const seen = new Set(store.get(seenKey).split(',').filter(Boolean));
  const isNew = (c) => !seen.has(c.id) && c.name !== store.get('lab-name');
  const unread = (c) => [c, ...repliesOf(c.id)].filter(isNew);
  const markSeen = (items) => {
    for (const item of items) seen.add(item.id);
    store.set(seenKey, [...seen].join(','));
  };
  const repliesOf = (id) => comments.filter((c) => c.parent === id);
  const when = (iso) =>
    new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function placeCard(card, left, top) {
    layer.append(card);
    const width = card.offsetWidth;
    const maxLeft = scrollX + document.documentElement.clientWidth - width - 12;
    card.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, maxLeft))}px`;
    card.style.top = `${top + 10}px`;
  }

  const ARROW =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // One field that grows: a pill while empty, a box with a divider and the name row once you type.
  function composer({ placeholder, onSubmit, autofocus }) {
    const wrap = el('div', { class: 'composer' });
    const box = el('div', { class: 'box' });
    const text = el('textarea', { placeholder, maxlength: '2000', rows: '1', 'aria-label': placeholder });
    const who = el('label', { class: 'who' });
    const as = el('span', {}, 'as');
    const name = el('input', { type: 'text', placeholder: 'your name', maxlength: '60', autocomplete: 'name' });
    name.value = store.get('lab-name');
    who.append(as, name);
    const sendBtn = el('button', { class: 'send', type: 'button', 'aria-label': 'send' });
    sendBtn.innerHTML = ARROW;
    const error = el('div', { class: 'error' });
    box.append(text, el('div', { class: 'line' }), who, sendBtn);
    wrap.append(box, error);

    const sync = () => {
      box.classList.toggle('open', text.value.length > 0 || root.activeElement === name || !!error.textContent);
      as.hidden = !name.value.trim();
      sendBtn.classList.toggle('ready', Boolean(text.value.trim() && name.value.trim()));
      text.style.height = 'auto';
      text.style.height = `${text.scrollHeight}px`;
    };
    let busy = false;
    const go = async () => {
      if (busy) return;
      if (!text.value.trim()) return text.focus();
      if (!name.value.trim()) {
        box.classList.add('open');
        return name.focus();
      }
      store.set('lab-name', name.value.trim());
      busy = true;
      error.textContent = '';
      try {
        await onSubmit(name.value.trim(), text.value.trim());
      } catch (e) {
        error.textContent = e.message;
        sync();
      }
      busy = false;
    };
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        go();
      }
    };
    text.addEventListener('input', sync);
    name.addEventListener('input', sync);
    name.addEventListener('blur', () => setTimeout(sync, 0));
    text.addEventListener('keydown', onKey);
    name.addEventListener('keydown', onKey);
    sendBtn.addEventListener('click', go);
    // Keep focus in the field when the send button is pressed.
    sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    requestAnimationFrame(sync);
    if (autofocus) setTimeout(() => text.focus(), 0);
    return wrap;
  }

  // Draft composer sits to the right of its pin, like the pin is the avatar; below it when there is no room.
  function placeBeside(node, left, top) {
    layer.append(node);
    const width = node.offsetWidth;
    const right = scrollX + document.documentElement.clientWidth - 12;
    if (left + 36 + width <= right) {
      node.style.left = `${left + 36}px`;
      node.style.top = `${top - 37}px`;
    } else {
      node.style.left = `${Math.max(scrollX + 12, Math.min(left - 14, right - width))}px`;
      node.style.top = `${top + 10}px`;
    }
  }

  function render() {
    layer.replaceChildren();
    const list = threads();
    const open = list.filter((c) => !c.resolved).length;
    const fresh = list.filter((c) => !c.resolved).reduce((n, c) => n + unread(c).length, 0);
    toggleBtn.replaceChildren(
      document.createTextNode(
        (on ? 'hide comments' : open ? `comments · ${open}` : 'comments') + (fresh ? ` · ${fresh} new` : ''),
      ),
      el('kbd', {}, 'c'),
    );
    toggleBtn.classList.toggle('secondary', on);
    document.documentElement.classList.toggle('lab-pinning', on);
    copyBtn.hidden = !on || !isAdmin || list.every((c) => c.resolved);
    if (!on) return;

    list.forEach((c) => {
      const { left, top, moved, zone } = position(c.anchor || {});
      if (openId === c.id) drawZone(zone, 'saved');
      const news = unread(c);
      const pin = el(
        'button',
        {
          class: `pin${c.resolved ? ' resolved' : ''}${news.length ? ' new' : ''}${moved ? ' moved' : ''}`,
          type: 'button',
          title: moved ? `${c.name} · the spot it was pinned to has changed` : c.name,
        },
        c.resolved ? '✓' : String(numberOf(c)),
      );
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        openId = openId === c.id ? null : c.id;
        draft = null;
        render();
      });
      layer.append(pin);
      if (openId === c.id) {
        // Area comments open below the area, so the card doesn't hide what it is about.
        placeCard(threadCard(c, new Set(news.map((x) => x.id))), zone ? left + 14 : left, zone ? zone.top + zone.height : top);
        markSeen(news);
      }
    });

    if (draft) {
      const { left, top, zone } = position(draft.anchor);
      drawZone(zone, 'draft');
      const pin = el('div', { class: 'pin draft' });
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      layer.append(pin);
      const float = el('div', { class: 'float' });
      float.append(
        composer({
          placeholder: 'add a comment',
          autofocus: true,
          onSubmit: async (name, text) => {
            const { comment } = await send({ name, text, anchor: draft.anchor });
            comments.push(comment);
          markSeen([comment]);
            draft = null;
            openId = comment.id;
            render();
          },
        }),
      );
      if (zone) placeCard(float, left + 14, zone.top + zone.height);
      else placeBeside(float, left, top);
    }
  }

  function threadCard(c, fresh = new Set()) {
    const card = el('div', { class: 'card' });
    card.addEventListener('click', (e) => e.stopPropagation());
    for (const item of [c, ...repliesOf(c.id)]) {
      const box = el('div', { class: 'item' });
      const meta = el('div', { class: 'meta' });
      if (fresh.has(item.id)) meta.append(el('span', { class: 'dot', title: 'new' }));
      meta.append(el('b', {}, item.name), document.createTextNode(` · ${when(item.createdAt)}`));
      box.append(meta, el('div', { class: 'text' }, item.text));
      card.append(box);
    }
    if (isAdmin) {
      const actions = el('div', { class: 'row' });
      const resolve = el('button', { class: 'btn', type: 'button' }, c.resolved ? 'reopen' : 'resolve');
      resolve.addEventListener('click', async () => {
        const { comment } = await send({ action: c.resolved ? 'reopen' : 'resolve', id: c.id });
        Object.assign(c, comment);
        render();
      });
      const del = el('button', { class: 'btn', type: 'button' }, 'delete');
      del.addEventListener('click', async () => {
        if (!confirm('delete this comment and its replies?')) return;
        for (const r of repliesOf(c.id)) await send({ action: 'delete', id: r.id });
        await send({ action: 'delete', id: c.id });
        comments = comments.filter((x) => x.id !== c.id && x.parent !== c.id);
        openId = null;
        render();
      });
      const copyOne = el('button', { class: 'btn', type: 'button' }, 'copy for agent');
      copyOne.addEventListener('click', () => copy(agentText(numberOf(c)), copyOne));
      actions.append(copyOne, resolve, del);
      card.append(actions);
    }
    card.append(
      composer({
        placeholder: 'reply',
        onSubmit: async (name, text) => {
          const { comment } = await send({ name, text, parent: c.id });
          comments.push(comment);
          markSeen([comment]);
          render();
        },
      }),
    );
    return card;
  }

  // ---------- events ----------
  const showHint = () => {
    if (store.get('lab-hint-seen') === '1') return;
    hint.hidden = false;
    store.set('lab-hint-seen', '1');
    setTimeout(() => (hint.hidden = true), 5000);
  };
  const setOn = (value) => {
    on = value;
    store.set('lab-on', on ? '1' : '');
    if (on) showHint();
    draft = null;
    openId = null;
    render();
  };
  toggleBtn.addEventListener('click', () => setOn(!on));
  copyBtn.addEventListener('click', () => copy(agentText(), copyBtn));
  const typing = (e) =>
    e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e)) {
      e.preventDefault();
      setOn(!on);
      return;
    }
    if (e.key === 'Escape' && (draft || openId)) {
      draft = null;
      openId = null;
      render();
    }
  });

  // Always ready to pin: a click on the page (not on a link or control) opens a new comment there.
  // Alt/Option-click pins on links and controls too. With a comment open, the first click outside only closes it.
  const INTERACTIVE =
    'a, button, input, textarea, select, label, summary, video[controls], audio, iframe, [contenteditable], [role="button"], [role="link"], [onclick]';
  // Drag (mouse or pen) to mark an area instead of a point. Touch keeps scrolling.
  let drag = null;
  let afterDrag = false;
  let liveZone = null;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!on || draft || openId || e.button !== 0 || e.pointerType === 'touch' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.composedPath().includes(host)) return;
      if (!e.altKey && e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      drag.x1 = e.clientX;
      drag.y1 = e.clientY;
      if (!drag.active && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 8) {
        drag.active = true;
        getSelection?.()?.removeAllRanges();
        document.documentElement.classList.add('lab-dragging');
        liveZone = el('div', { class: 'zone draft' });
        layer.append(liveZone);
      }
      if (!drag.active) return;
      e.preventDefault();
      Object.assign(liveZone.style, {
        left: `${Math.min(drag.x0, drag.x1) + scrollX}px`,
        top: `${Math.min(drag.y0, drag.y1) + scrollY}px`,
        width: `${Math.abs(drag.x1 - drag.x0)}px`,
        height: `${Math.abs(drag.y1 - drag.y0)}px`,
      });
    },
    true,
  );
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.documentElement.classList.remove('lab-dragging');
    liveZone?.remove();
    liveZone = null;
    if (!d.active || e.type === 'pointercancel') return;
    // The click that follows this pointerup belongs to the drag, not a new pin.
    afterDrag = true;
    setTimeout(() => (afterDrag = false), 0);
    getSelection?.()?.removeAllRanges();
    if (Math.abs(d.x1 - d.x0) < 12 || Math.abs(d.y1 - d.y0) < 12) return;
    draft = { anchor: zoneAnchor(d) };
    render();
  };
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);
  // Don't let images start a native drag while marking an area.
  document.addEventListener('dragstart', (e) => drag && e.preventDefault(), true);

  document.addEventListener(
    'click',
    (e) => {
      if (!afterDrag) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  document.addEventListener('click', (e) => {
    if (e.composedPath().includes(host)) return;
    if (draft || openId) {
      draft = null;
      openId = null;
      render();
      return;
    }
    if (!on || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.altKey) e.preventDefault();
    else if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(INTERACTIVE))) return;
    if (String(getSelection?.() || '').trim()) return;
    draft = { anchor: anchorAt(e.clientX, e.clientY) };
    render();
  });

  let frame = 0;
  const reflow = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Keep an open composer's text: only re-place when nothing is being typed.
      if (draft || root.activeElement) return;
      render();
    });
  };
  addEventListener('resize', reflow);
  // Pick up comments others left while this tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !draft && !root.activeElement) load();
  });
  if ('ResizeObserver' in window) new ResizeObserver(reflow).observe(document.body);

  // Optional own font: data-font="Inter" (the page must already load it, or add data-font-url to a woff2).
  const fonts = document.createElement('style');
  fonts.textContent = '';
  if (script?.dataset.fontUrl)
    fonts.textContent += `@font-face{font-family:'lab comments';font-display:swap;src:url('${new URL(script.dataset.fontUrl, script.src || location.href)}') format('woff2');}`;
  const fontName = script?.dataset.fontUrl ? 'lab comments' : script?.dataset.font;
  if (fontName) host.style.setProperty('--lab-font', `'${fontName.replace(/'/g, '')}', system-ui, sans-serif`);

  // A pin-shaped cursor over everything you can comment on (links and controls keep theirs).
  const PIN_CURSOR =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Cpath d='M3 23V12.5a9.5 9.5 0 1 1 9.5 9.5H4z' fill='black' stroke='white' stroke-width='2'/%3E%3C/svg%3E\") 3 23, crosshair";
  fonts.textContent += 'html.lab-dragging, html.lab-dragging * { user-select: none !important; -webkit-user-select: none !important; cursor: crosshair !important; }';
  fonts.textContent += `html.lab-pinning body, html.lab-pinning body *:not(${INTERACTIVE}, a *, button *, label *, [role="button"] *, [data-lab-comments]) { cursor: ${PIN_CURSOR}; }`;

  const start = () => {
    document.head.append(fonts);
    if (on) showHint();
    document.body.append(host);
    load();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
