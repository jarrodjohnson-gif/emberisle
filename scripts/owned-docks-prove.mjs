// #560: DOM geometry and real pointer proof; uses the real renderer, camera and game store.
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
  await page.waitForFunction(expected => {
    const els = [...document.querySelectorAll('[data-testid="owned-dock-label"]')];
    return els.length === expected.length && expected.every(want => els.some(el =>
      el.dataset.vertexId === want.id && el.textContent.replace(/\s+/g, ' ').trim() === want.text));
  }, expected, { timeout: TIMEOUT });
  // Independently project actual state vertices, rather than trusting the callback's coordinates.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="owned-dock-label"]')].every(el => {
    const p = window.__isle.screenOf(el.dataset.vertexId);
    return p && Math.hypot(parseFloat(el.style.left) - p.x, parseFloat(el.style.top) - p.y) < 1.5;
  }), null, { timeout: TIMEOUT });
  const handle = await page.waitForFunction(expected => {
    const nodes = [...document.querySelectorAll('[data-testid="owned-dock-label"]')];
    if (nodes.length !== expected.length || !expected.every(want => nodes.some(el => el.dataset.vertexId === want.id && el.textContent.replace(/\s+/g, ' ').trim() === want.text))) return false;
    return nodes.map(el => {
    const r = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    const state = window.__emberisle.getState().state;
    const vertex = state.vertices.find(v => v.id === el.dataset.vertexId);
    const p = window.__isle.screenOf(vertex.id);
    return { id: vertex.id, text: el.textContent.replace(/\s+/g, ' ').trim(), owner: el.dataset.ownerId,
      actualOwner: vertex.building?.playerId, kind: el.dataset.harbor, actualKind: vertex.harbor,
      x: parseFloat(el.style.left), y: parseFloat(el.style.top), px: p.x, py: p.y,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      width: r.width, height: r.height, font: parseFloat(css.fontSize), pointer: css.pointerEvents,
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 };
    });
  }, expected, { timeout: TIMEOUT });
  const result = await handle.jsonValue();
  await handle.dispose();
  assert.deepEqual(result.map(x => x.id).sort(), expected.map(x => x.id).sort(), `${tag}: only controlling buildings have labels`);
  for (const row of result) {
    const want = expected.find(x => x.id === row.id);
    assert.equal(row.text, want.text, `${tag}: exact README good and owned rate`);
    assert.equal(row.owner, row.actualOwner, `${tag}: label owner matches actual building`);
    assert.equal(row.owner, want.owner, `${tag}: only viewing seat owns label`);
    assert.equal(row.kind, row.actualKind, `${tag}: dock kind matches controlling vertex`);
    assert.ok(Math.hypot(row.x - row.px, row.y - row.py) < 1.5, `${tag}: independent real-camera building anchor: ${JSON.stringify(row)}`);
    assert.ok(row.inside && !row.clipped && row.width > 0 && row.height > 0 && row.font >= 10,
      `${tag}: readable unclipped label fits viewport: ${JSON.stringify(row)}`);
    assert.equal(row.pointer, 'none', `${tag}: label never intercepts input`);
    assert.ok(Math.abs(row.bottom - (row.py - 12)) < 2, `${tag}: label sits above its actual building: ${JSON.stringify(row)}`);
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
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.__isle && window.__emberisle?.getState().state);
    const f = await fixture(page);
    mkdirSync('test-results', { recursive: true });
    const mine = [{ id: f.generic, owner: f.me, text: 'Your 3:1 dock' }, { id: f.wood, owner: f.me, text: 'Your 2:1 wood dock' }];
    const theirs = [{ id: f.opponent, owner: f.other, text: 'Your 2:1 brick dock' }];
    await labels(page, mine, tag);
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
      const names = { timber: 'wood', clay: 'brick', wool: 'sheep', grain: 'wheat', ore: 'stone' };
      for (const v of state.vertices) v.building = ids.includes(v.id) ? { playerId: me, kind: 'outpost' } : null;
      state.seq++;
      api.setState({ state });
      return ids.map(id => {
        const v = state.vertices.find(v => v.id === id);
        return { id, owner: me, text: v.harbor === 'any' ? 'Your 3:1 dock' : `Your 2:1 ${names[v.harbor]} dock` };
      });
    }, f.me);
    await labels(page, extremes, `${tag} extreme left/right coast`);
    await page.screenshot({ path: `test-results/owned-docks-extremes-${view.width}x${view.height}.png` });
    await fixture(page);
    const initialState = await snapshot(page);
    const initial = await labels(page, mine, `${tag} restored`);
    await page.setViewportSize({ width: view.width - 20, height: view.height - 20 });
    await page.waitForFunction(old => [...document.querySelectorAll('[data-testid="owned-dock-label"]')].some(el => {
      const was = old.find(p => p.id === el.dataset.vertexId);
      return was && Math.hypot(parseFloat(el.style.left) - was.x, parseFloat(el.style.top) - was.y) > 1;
    }), initial);
    await labels(page, mine, `${tag} resized`);
    await page.evaluate(() => window.__emberisle.setState({ viewChoice: 'diorama' }));
    await page.waitForFunction(() => window.__emberisle.getState().playView === 'diorama');
    const beforeRotate = await labels(page, mine, `${tag} diorama`);
    await rotate(page, view.touch);
    const afterRotate = await labels(page, mine, `${tag} rotated`);
    assert.ok(afterRotate.some(p => {
      const old = beforeRotate.find(x => x.id === p.id);
      return Math.hypot(p.x - old.x, p.y - old.y) > 2;
    }), `${tag}: real camera rotation moves building anchors`);
    assert.equal(await snapshot(page), initialState, `${tag}: viewing, resizing and real drag preserve every game field`);
    await page.evaluate(() => window.__isle.goHome());
    await page.evaluate(other => window.__emberisle.setState({ mode: 'online', localId: other }), f.other);
    await labels(page, theirs, `${tag} online seat changes`);
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    await labels(page, [], `${tag} watcher`);
    await page.evaluate(() => window.__emberisle.setState({ spectator: false, mode: 'hotseat' }));
    await labels(page, mine, `${tag} hotseat current seat beats localId`);
    await page.evaluate(other => {
      const api = window.__emberisle;
      const state = structuredClone(api.getState().state);
      state.current = other;
      state.seq++;
      api.setState({ state });
    }, f.other);
    await labels(page, theirs, `${tag} hotseat turn changes`);
    await page.evaluate(id => {
      const api = window.__emberisle;
      const state = structuredClone(api.getState().state);
      state.vertices.find(v => v.id === id).building = null;
      state.seq++;
      api.setState({ state });
    }, f.opponent);
    await labels(page, [], `${tag} controlling building removed`);
    assert.deepEqual(errors, [], `${tag}: zero browser, console and HTTP errors`);
    console.log(`${tag}: exact generic/wood labels, opponent excluded, independent building projection, resize, real ${view.touch ? 'touch' : 'mouse'} rotation, pointer pass-through, state isolation, online/hotseat changes, watcher and ownership removal; zero errors`);
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
