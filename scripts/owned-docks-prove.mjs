// #560: DOM geometry and real pointer proof; uses the real renderer, camera and game store.
// Owner 2026-11-03: every dock is tagged once, on its pier. The two corners share that tag.
// The words name the trade. A dock the viewer controls reads "Your 2:1 wood" or "Your 3:1 any".
// The others name the trade with no "Your".
// Owner 2026-10-16 (docs/design/harbor-jelly-prompt.md): the sails carry no rate.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const PORT = Number(process.env.VITE_PORT) || 8450;
const TIMEOUT = 30_000;
const views = [
  { width: 1280, height: 720, touch: false, motion: 'no-preference' },
  { width: 390, height: 844, touch: true, motion: 'no-preference' },
  { width: 844, height: 390, touch: true, motion: 'reduce' },
];
const vite = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
let browser;
let failed = false;
const snapshot = page => page.evaluate(() => JSON.stringify(window.__emberisle.getState().state));
async function fixture(page) {
  return page.evaluate(() => {
    const api = window.__emberisle;
    const old = api.getState();
    const state = structuredClone(old.state);
    const me = old.localId;
    const other = state.players.find(p => p.id !== me).id;
    Object.assign(state, { current: me, phase: 'main', rollOff: null, winner: null, trade: null, discardNeeded: {} });
    for (const p of state.players) {
      p.kind = 'human';
      p.resources = { timber: 6, clay: 6, wool: 6, grain: 6, ore: 6 };
    }
    for (const v of state.vertices) v.building = null;
    for (const e of state.edges) e.path = null;
    const generic = state.vertices.find(v => v.harbor === 'any');
    const wood = state.vertices.find(v => v.harbor === 'timber');
    const opponent = state.vertices.find(v => v.harbor === 'clay');
    if (!generic || !wood || !opponent) throw Error('requires generic, wood and brick docks');
    generic.building = { playerId: me, kind: 'outpost' };
    wood.building = { playerId: me, kind: 'stronghold' };
    opponent.building = { playerId: other, kind: 'outpost' };
    state.seq++;
    api.setState({ state, mode: 'ai', spectator: false, buildMode: 'none', pendingPlace: null,
      pendingSteal: null, tradeOpen: false, offer: null, error: null });
    return { me, other, generic: generic.id, wood: wood.id, opponent: opponent.id };
  });
}
async function labels(page, expected, tag) {
  if (expected.length) await page.waitForFunction(() => window.__isle.dockPlates?.size > 0, null, { timeout: 120_000 });
  await page.waitForFunction(expected => {
    const els = [...document.querySelectorAll('[data-testid="owned-dock-label"]')];
    return els.length === expected.length && expected.every(want => els.some(el =>
      el.dataset.vertexId === want.id && el.textContent.replace(/\s+/g, ' ').trim() === want.text));
  }, expected, { timeout: TIMEOUT });
  // Independently project actual state vertices, rather than trusting the callback's coordinates.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="owned-dock-label"]')].every(el => {
    const p = window.__isle.pierScreen(el.dataset.vertexId);
    return p && Math.hypot(parseFloat(el.style.left) - p.x, parseFloat(el.style.top) - p.y) < 1.5;
  }), null, { timeout: TIMEOUT });
  const handle = await page.waitForFunction(expected => {
    const nodes = [...document.querySelectorAll('[data-testid="owned-dock-label"]')];
    if (nodes.length !== expected.length || !expected.every(want => nodes.some(el => el.dataset.vertexId === want.id && el.textContent.replace(/\s+/g, ' ').trim() === want.text))) return false;
    if (nodes.some(el => !window.__isle.pierScreen(el.dataset.vertexId) || el.dataset.vertexId.split(':').some(id => !window.__isle.screenOf(id)))) return false;
    return nodes.map(el => {
    const r = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    const state = window.__emberisle.getState().state;
    const corners = el.dataset.vertexId.split(':').map(id => state.vertices.find(v => v.id === id));
    const vertex = corners.find(v => v?.building) ?? corners[0];
    const p = window.__isle.pierScreen(el.dataset.vertexId);
    const b = window.__isle.screenOf(vertex.id);
    return { id: el.dataset.vertexId, text: el.textContent.replace(/\s+/g, ' ').trim(), aria: el.getAttribute('aria-label'), role: el.getAttribute('role'),
      owner: el.dataset.ownerId ?? '',
      actualOwner: vertex.building?.playerId ?? '', kind: el.dataset.harbor, actualKind: vertex.harbor,
      x: parseFloat(el.style.left), y: parseFloat(el.style.top), px: p.x, py: p.y, bx: b.x, by: b.y,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      width: r.width, height: r.height, font: parseFloat(css.fontSize), pointer: css.pointerEvents,
      bg: css.backgroundColor,
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 };
    });
  }, expected, { timeout: TIMEOUT });
  const result = await handle.jsonValue();
  await handle.dispose();
  assert.deepEqual(result.map(x => x.id).sort(), expected.map(x => x.id).sort(), `${tag}: every dock is labelled`);
  for (const row of result) {
    const want = expected.find(x => x.id === row.id);
    assert.equal(row.text, want.text, `${tag}: visible rate chip`);
    assert.equal(row.role, 'img', `${tag}: the chip is an image so its name is exposed`);
    assert.equal(row.aria, want.name, `${tag}: full words stay on the accessible name`);
    assert.equal(row.owner, row.actualOwner, `${tag}: label owner matches actual building`);
    assert.equal(row.owner, want.owner, `${tag}: label owner matches the building`);
    assert.equal(row.kind, row.actualKind, `${tag}: dock kind matches controlling vertex`);
    assert.equal(row.bg, want.bg, `${tag}: chip color is the good, or the surface for a 3:1`);
    assert.ok(Math.hypot(row.x - row.px, row.y - row.py) < 1.5, `${tag}: independent real-camera dock plate anchor: ${JSON.stringify(row)}`);
    assert.ok(row.bx < row.left || row.bx > row.right || row.by < row.top || row.by > row.bottom, `${tag}: chip does not cover the controlling building: ${JSON.stringify(row)}`);
    assert.ok(row.inside && !row.clipped && row.width > 0 && row.width <= 140 && row.height > 0 && row.height <= 24 && row.font === 12,
      `${tag}: 12 px chip fits the viewport: ${JSON.stringify(row)}`);
    assert.ok(row.text !== '2:1' && row.text !== '3:1', `${tag}: the trade is written in words`);
    const named = await page.getByRole('img', { name: want.name, exact: true }).count();
    assert.equal(named, expected.filter(x => x.name === want.name).length, `${tag}: accessibility tree exposes ${want.name}`);
    assert.equal(row.pointer, 'none', `${tag}: label never intercepts input`);
    assert.ok(row.top - 1 <= row.py && row.py <= row.bottom + 1, `${tag}: chip sits on its dock: ${JSON.stringify(row)}`);
  }
  return result;
}
async function rotate(page, touch) {
  const point = await page.evaluate(() => [...document.querySelectorAll('[data-testid="owned-dock-label"]')]
    .map(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }))
    .find(p => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'));
  assert.ok(point, 'an owned building remains pointer reachable through label overlay');
  const before = await page.evaluate(() => [window.__isle.orbit.getAzimuthalAngle(), window.__isle.orbit.getPolarAngle()]);
  const dx = point.x > 100 ? -60 : 60;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: point.x + dx * i / 6, y: point.y + 12 * i / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + dx, point.y + 12, { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForFunction(before => Math.abs(window.__isle.orbit.getAzimuthalAngle() - before[0]) > .02 ||
    Math.abs(window.__isle.orbit.getPolarAngle() - before[1]) > .02, before, { timeout: TIMEOUT });
  await page.waitForFunction(() => !window.__isle.glide && !window.__isle.refitDue, null, { timeout: TIMEOUT });
}
async function expected(page) {
  return page.evaluate(() => {
    const s = window.__emberisle.getState();
    const viewing = s.screen === 'play' && !s.spectator ? (s.mode === 'hotseat' ? s.state.current : s.localId) : null;
    const names = { timber: 'wood', clay: 'brick', wool: 'sheep', grain: 'wheat', ore: 'stone' };
    const goods = { timber: 'rgb(47, 106, 79)', clay: 'rgb(184, 83, 61)', wool: 'rgb(178, 206, 128)', grain: 'rgb(227, 196, 98)', ore: 'rgb(99, 116, 138)' };
    const byId = new Map(s.state.vertices.map(v => [v.id, v]));
    const seen = new Set();
    const rows = [];
    for (const e of s.state.edges) {
      const va = byId.get(e.va);
      const vb = byId.get(e.vb);
      if (!va?.harbor || va.harbor !== vb?.harbor) continue;
      const id = [va.id, vb.id].sort().join(':');
      if (seen.has(id)) continue;
      seen.add(id);
      const held = [va, vb].find(v => v.building) ?? va;
      const trade = va.harbor === 'any' ? '3:1 any' : `2:1 ${names[va.harbor]}`;
      const owner = held.building?.playerId ?? '';
      const line = !!viewing && owner === viewing ? `Your ${trade}` : trade;
      rows.push({ id, owner, text: line, name: line, bg: va.harbor === 'any' ? 'rgb(255, 255, 255)' : goods[va.harbor] });
    }
    return rows;
  });
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  for (const view of views) {
    const tag = `${view.width}x${view.height}${view.motion === 'reduce' ? ' reduced' : ''}`;
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch,
      isMobile: view.touch, reducedMotion: view.motion });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('response', r => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.addInitScript(() => {
      localStorage.setItem('emberisle-name', 'Owned docks proof');
      localStorage.setItem('emberisle-water', 'simple');
      // The rate plate is on the full shore. Software GPUs would otherwise keep the plain pier.
      localStorage.setItem('emberisle-jelly', 'full');
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.__isle && window.__emberisle?.getState().state);
    const f = await fixture(page);
    mkdirSync('test-results', { recursive: true });
    const first = await labels(page, await expected(page), tag);
    const textOf = id => first.find(row => row.id.split(':').includes(id))?.text;
    assert.equal(textOf(f.generic), 'Your 3:1 any', `${tag}: a 3:1 dock says any`);
    assert.equal(textOf(f.wood), 'Your 2:1 wood', `${tag}: a 2:1 dock names its good`);
    assert.equal(textOf(f.opponent), '2:1 brick', `${tag}: someone else's dock is labelled without Your`);
    assert.ok(first.length > 3, `${tag}: docks with no building are labelled`);
    // Staging the hand can trigger the normal gain cue; capture the permanent labels after it clears.
    await page.waitForFunction(() => !document.querySelector('[data-testid="gain-float"]'));
    await page.screenshot({ path: `test-results/owned-docks-${view.width}x${view.height}.png` });
    // Select actual extreme coast corners from the current camera, not merely the first dock of each kind.
    const extremes = await page.evaluate(me => {
      const api = window.__emberisle;
      const state = structuredClone(api.getState().state);
      const docks = state.vertices.filter(v => v.harbor).map(v => ({ id: v.id, x: window.__isle.screenOf(v.id).x }));
      docks.sort((a, b) => a.x - b.x);
      const ids = [docks[0].id, docks.at(-1).id];
      for (const v of state.vertices) v.building = ids.includes(v.id) ? { playerId: me, kind: 'outpost' } : null;
      state.seq++;
      api.setState({ state });
      return ids;
    }, f.me);
    const extremeRows = await labels(page, await expected(page), `${tag} extreme left/right coast`);
    for (const id of extremes) assert.ok(extremeRows.find(row => row.id.split(':').includes(id)).text.startsWith('Your '), `${tag}: extreme dock the viewer controls reads Your`);
    await page.screenshot({ path: `test-results/owned-docks-extremes-${view.width}x${view.height}.png` });
    await fixture(page);
    const initialState = await snapshot(page);
    const initial = await labels(page, await expected(page), `${tag} restored`);
    await page.setViewportSize({ width: view.width - 20, height: view.height - 20 });
    await page.waitForFunction(old => [...document.querySelectorAll('[data-testid="owned-dock-label"]')].some(el => {
      const was = old.find(p => p.id === el.dataset.vertexId);
      return was && Math.hypot(parseFloat(el.style.left) - was.x, parseFloat(el.style.top) - was.y) > 1;
    }), initial);
    await labels(page, await expected(page), `${tag} resized`);
    await page.evaluate(() => window.__emberisle.setState({ viewChoice: 'diorama' }));
    await page.waitForFunction(() => window.__emberisle.getState().playView === 'diorama');
    const beforeRotate = await labels(page, await expected(page), `${tag} diorama`);
    await rotate(page, view.touch);
    const afterRotate = await labels(page, await expected(page), `${tag} rotated`);
    assert.ok(afterRotate.some(p => {
      const old = beforeRotate.find(x => x.id === p.id);
      return Math.hypot(p.x - old.x, p.y - old.y) > 2;
    }), `${tag}: real camera rotation moves dock anchors`);
    assert.equal(await snapshot(page), initialState, `${tag}: viewing, resizing and real drag preserve every game field`);
    await page.evaluate(() => window.__isle.goHome());
    await page.evaluate(other => window.__emberisle.setState({ mode: 'online', localId: other }), f.other);
    const online = await labels(page, await expected(page), `${tag} online seat changes`);
    const rowOf = (rows, id) => rows.find(row => row.id.split(':').includes(id));
    assert.equal(rowOf(online, f.opponent).text, 'Your 2:1 brick', `${tag}: the new seat's dock reads Your`);
    assert.equal(rowOf(online, f.wood).text, '2:1 wood', `${tag}: the previous seat's dock stays labelled`);
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    const watching = await labels(page, await expected(page), `${tag} watcher`);
    assert.ok(watching.length > 3 && watching.every(row => !row.text.startsWith('Your ')), `${tag}: a watcher still sees every dock, and none read Your`);
    await page.evaluate(() => window.__emberisle.setState({ spectator: false, mode: 'hotseat' }));
    await labels(page, await expected(page), `${tag} hotseat current seat beats localId`);
    await page.evaluate(other => {
      const api = window.__emberisle;
      const state = structuredClone(api.getState().state);
      state.current = other;
      state.seq++;
      api.setState({ state });
    }, f.other);
    const turned = await labels(page, await expected(page), `${tag} hotseat turn changes`);
    assert.equal(turned.find(row => row.id.split(':').includes(f.opponent)).text, 'Your 2:1 brick', `${tag}: hotseat Your follows the current seat`);
    await page.evaluate(id => {
      const api = window.__emberisle;
      const state = structuredClone(api.getState().state);
      state.vertices.find(v => v.id === id).building = null;
      state.seq++;
      api.setState({ state });
    }, f.opponent);
    const cleared = await labels(page, await expected(page), `${tag} controlling building removed`);
    assert.equal(cleared.find(row => row.id.split(':').includes(f.opponent)).text, '2:1 brick', `${tag}: removing the building keeps the dock tag`);
    assert.deepEqual(errors, [], `${tag}: zero browser, console and HTTP errors`);
    console.log(`${tag}: every dock named in words, Your follows the seat, independent pier projection, resize, real ${view.touch ? 'touch' : 'mouse'} rotation, pointer pass-through, state isolation, watcher and ownership removal; zero errors`);
    await ctx.close();
  }
  console.log('owned-docks-prove: ok (real renderer; no GPU draw suppression)');
} catch (error) {
  console.error(error);
  for (const ctx of browser?.contexts() ?? []) for (const page of ctx.pages()) {
    console.error('owned-docks failure context:', await page.evaluate(() => {
      const s = window.__emberisle?.getState();
      return { screen: s?.screen, mode: s?.mode, localId: s?.localId, current: s?.state?.current,
        spectator: s?.spectator, projections: window.__isle?.ownedDockPositions, rendererBuildings: window.__isle?.lastState?.vertices.filter(v => v.harbor && v.building), buildings: s?.state?.vertices.filter(v => v.harbor && v.building),
        plates: window.__isle?.dockPlates?.size ?? null, shore: !!window.__isle?.shore,
        labels: [...document.querySelectorAll('[data-testid="owned-dock-label"]')].map(el => ({ text: el.textContent, vertex: el.dataset.vertexId })) };
    }).catch(String));
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/owned-docks-failure.png' }).catch(() => {});
  }
  failed = true;
} finally {
  await browser?.close();
  await vite.close();
}
process.exit(failed ? 1 : 0);
