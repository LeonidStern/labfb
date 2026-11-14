// Run against a server with the same API (see bench/serve.mjs pattern); needs pages /anna/home.html, /mira/home.html, /leo/home.html.
// PHASE=revoked reruns the last part against a server started with LAB_REVOKED="anna".
// Three labs on one domain (/anna, /mira, /leo). Owner makes admin links; each key is tested in the real layer.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:4340', O = __dirname + '/shots/', PHASE = process.env.PHASE || 'main';
if (PHASE === 'main') { fs.rmSync(O, { recursive: true, force: true }); fs.mkdirSync(O); }
const out = __dirname + `/results-${PHASE}.json`; const results = [], shots = [];
const check = (name, ok, note = '') => { results.push({ name, ok: !!ok, note: String(note) }); console.log(ok ? 'ok  ' : 'FAIL', name, note); };
const api = async (body, key) => { const r = await fetch(BASE + '/_lab/api/comments', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-lab-admin': key } : {}) }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const list = async (page) => (await (await fetch(BASE + '/_lab/api/comments?page=' + encodeURIComponent(page))).json()).comments || [];
const PAGES = { anna: '/anna/home.html', mira: '/mira/home.html', leo: '/leo/home.html' };
const L = (p, sel) => p.locator(`[data-lab-comments] ${sel}`);
let seedN = 0;
const seed = async (page, text) => { const k = seedN++ % 2; return (await api({ page, name: k ? 'tom' : 'sam', text, anchor: { selector: 'h1', x: k ? .75 : .2, y: .5, docX: k ? .5 : .2, docY: 60 } })).data.comment; };
(async () => {
  const b = await chromium.launch();
  const ctxFor = async () => { const ctx = await b.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('lab-on', '1'); localStorage.setItem('lab-hint-seen', '1'); localStorage.setItem('lab-name', 'x'); } } catch {} });
    return ctx; };
  const open = async (ctx, url) => { const p = await ctx.newPage(); await p.goto(BASE + url); await p.waitForTimeout(700); return p; };

  if (PHASE === 'revoked') {
    const keys = JSON.parse(fs.readFileSync(__dirname + '/keys.json'));
    const c = await seed(PAGES.anna, 'still here?');
    check('revoked: anna\'s key can no longer delete', (await api({ page: PAGES.anna, action: 'delete', id: c.id }, keys.anna)).status === 403);
    check('revoked: mira\'s key still works', (await api({ page: PAGES.mira, action: 'delete', id: (await seed(PAGES.mira, 'x')).id }, keys.mira)).status === 200);
    const ctx = await ctxFor(); const p = await open(ctx, PAGES.anna + '?lab-admin=' + keys.anna);
    check('revoked: no admin buttons for anna in the browser', await L(p, '.bar button').filter({ hasText: 'copy link' }).isHidden());
    await p.screenshot({ path: O + '09-revoked.png', clip: { x: 0, y: 0, width: 1200, height: 260 } }); shots.push({ file: '09-revoked.png', title: 'anna, after LAB_REVOKED="anna"', note: 'Same link, same browser: the page treats her as a reviewer again.' });
    fs.writeFileSync(out, JSON.stringify({ results, shots })); await b.close(); return;
  }

  // 1. Owner makes the links.
  const inv = async (name, page, scope) => (await api({ page, action: 'invite', name, ...(scope ? { scope } : {}) }, 'admintoken')).data;
  const A = await inv('anna', PAGES.anna), M = await inv('mira', PAGES.mira), LS = await inv('leo', PAGES.leo, '*');
  check('owner gets anna a key for /anna', A.scope === 'anna' && A.link.includes('/anna/home.html#lab-admin='), A.key);
  check('owner gets mira a key for /mira', M.scope === 'mira', M.key);
  check('owner gets leo a key for every lab', LS.scope === '*', LS.key);
  check('only the owner can make links', (await api({ page: PAGES.anna, action: 'invite', name: 'eve' }, A.key)).status === 403);
  fs.writeFileSync(__dirname + '/keys.json', JSON.stringify({ anna: A.key, mira: M.key, leo: LS.key }));

  // 2. Reviewers leave comments in every lab.
  const c = {}; for (const m of ['anna', 'mira', 'leo']) c[m] = [await seed(PAGES[m], `first note in ${m}'s lab`), await seed(PAGES[m], `second note in ${m}'s lab`)];

  // 3. anna opens her link.
  const annaCtx = await ctxFor();
  const pa = await open(annaCtx, PAGES.anna + '?lab-admin=' + A.key);
  check('the key leaves the address bar', !pa.url().includes('lab-admin'), pa.url());
  await L(pa, 'button.pin').first().click(); await pa.waitForTimeout(400);
  check('anna sees resolve and delete in her lab', await L(pa, '.card .btn').count() === 2);
  await pa.screenshot({ path: O + '01-anna-admin.png', clip: { x: 0, y: 0, width: 1200, height: 320 } }); shots.push({ file: '01-anna-admin.png', title: 'anna in /anna', note: 'Her link: resolve and delete on every thread.' });
  pa.on('dialog', d => d.accept());
  await L(pa, '.card .btn').filter({ hasText: 'delete' }).click(); await pa.waitForTimeout(600);
  check('anna deletes a comment in her lab', (await list(PAGES.anna)).length === 1);
  await L(pa, 'button.pin').first().click(); await pa.waitForTimeout(300);
  await L(pa, '.card .btn').filter({ hasText: 'resolve' }).click(); await pa.waitForTimeout(500);
  const ar = (await list(PAGES.anna))[0];
  check('anna resolves in her lab, signed with her name', ar.resolved && ar.resolvedBy === 'anna', ar.resolvedBy);
  // anna wanders into mira's lab in the same browser.
  const pam = await open(annaCtx, PAGES.mira);
  await L(pam, 'button.pin').first().click(); await pam.waitForTimeout(400);
  check('anna sees no admin buttons in /mira', await L(pam, '.card .btn').count() === 0);
  await pam.screenshot({ path: O + '02-anna-in-mira.png', clip: { x: 0, y: 0, width: 1200, height: 320 } }); shots.push({ file: '02-anna-in-mira.png', title: 'anna in /mira', note: 'Same browser, other lab: she is a reviewer there.' });
  check('anna\'s key is refused for /mira by the server', (await api({ page: PAGES.mira, action: 'delete', id: c.mira[0].id }, A.key)).status === 403);
  check('…and for /leo', (await api({ page: PAGES.leo, action: 'resolve', id: c.leo[0].id }, A.key)).status === 403);

  // 4. mira, in her own browser.
  const miraCtx = await ctxFor();
  const pm = await open(miraCtx, PAGES.mira + '?lab-admin=' + M.key);
  pm.on('dialog', d => d.accept());
  await L(pm, 'button.pin').first().click(); await pm.waitForTimeout(400);
  await L(pm, '.card .btn').filter({ hasText: 'delete' }).click(); await pm.waitForTimeout(600);
  check('mira deletes in her lab', (await list(PAGES.mira)).length === 1);
  check('anna\'s lab is untouched by mira', (await list(PAGES.anna)).length === 1);
  check('mira\'s key is refused for /anna', (await api({ page: PAGES.anna, action: 'delete', id: ar.id }, M.key)).status === 403);
  await pm.screenshot({ path: O + '03-mira-admin.png', clip: { x: 0, y: 0, width: 1200, height: 320 } }); shots.push({ file: '03-mira-admin.png', title: 'mira in /mira, after deleting one', note: 'One pin left; anna\'s and leo\'s labs keep theirs.' });

  // 5. leo has a key for every lab.
  const leoCtx = await ctxFor();
  const pl = await open(leoCtx, PAGES.leo + '?lab-admin=' + LS.key);
  for (const m of ['anna', 'mira', 'leo']) {
    const p = m === 'leo' ? pl : await open(leoCtx, PAGES[m]);
    await L(p, 'button.pin').first().click(); await p.waitForTimeout(400);
    check(`leo is admin in /${m}`, await L(p, '.card .btn').count() === 2);
  }
  check('leo deletes in /leo', (await api({ page: PAGES.leo, action: 'delete', id: c.leo[1].id }, LS.key)).status === 200);
  check('leo deletes in /mira', (await api({ page: PAGES.mira, action: 'delete', id: c.mira[1].id }, LS.key)).status === 200);
  await pl.screenshot({ path: O + '04-leo-admin.png', clip: { x: 0, y: 0, width: 1200, height: 320 } }); shots.push({ file: '04-leo-admin.png', title: 'leo with a key for every lab', note: 'scope "*": admin in /anna, /mira and /leo.' });

  // 6. One person, two labs, one browser.
  await seed(PAGES.mira, 'one more for mira'); await seed(PAGES.anna, 'one more for anna');
  const twoCtx = await ctxFor();
  const B = await inv('bo', PAGES.anna), B2 = await inv('bo', PAGES.mira);
  await open(twoCtx, PAGES.anna + '?lab-admin=' + B.key);
  await open(twoCtx, PAGES.mira + '?lab-admin=' + B2.key);
  const back = await open(twoCtx, PAGES.anna);
  check('bo keeps admin in /anna after opening his /mira link', await L(back, 'button.pin.resolved').count() === 1, 'resolved pins show only to admins');
  await back.screenshot({ path: O + '05-bo-two-labs.png', clip: { x: 0, y: 0, width: 1200, height: 260 } }); shots.push({ file: '05-bo-two-labs.png', title: 'bo, admin in two labs, one browser', note: 'Keys are kept per lab, so his /mira link doesn\'t replace his /anna one.' });
  const backM = await open(twoCtx, PAGES.mira);
  await L(backM, 'button.pin').first().click(); await backM.waitForTimeout(400);
  check('…and is admin in /mira too', await L(backM, '.card .btn').count() === 2);

  // 7. Broken keys and no key.
  const [n, s, sig] = A.key.split('.');
  const bad = [`${n}.${s}.${sig.slice(0, -1)}${sig.at(-1) === 'A' ? 'B' : 'A'}`, `${n}.mira.${sig}`, `mira.${s}.${sig}`, `${n}.*.${sig}`, 'admintoken2', ''];
  for (const k of bad) check(`tampered key refused: ${k ? k.replace(sig, '<sig>') : '(none)'}`, (await api({ page: PAGES.anna, action: 'delete', id: ar.id }, k || undefined)).status === 403);
  const revCtx = await ctxFor(); const pr = await open(revCtx, PAGES.anna);
  await L(pr, 'button.pin').first().click(); await pr.waitForTimeout(400);
  check('a reviewer sees no admin buttons', await L(pr, '.card .btn').count() === 0);
  check('a reviewer can still reply', await L(pr, '.card textarea').count() === 1);
  check('resolved comments stay hidden for reviewers', await L(pr, 'button.pin.resolved').count() === 0);

  fs.writeFileSync(out, JSON.stringify({ results, shots }));
  console.log(results.filter(r => r.ok).length + '/' + results.length);
  await b.close();
})();
