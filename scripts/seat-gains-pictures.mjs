// #827: real-board pictures of other seats' public goods changes (owner q1530-gain-finalists A). Not a proof and not
// registered. Four seats play online through a real host; Jarrod watches. Moments: a roll paying three seats, a 1 for 1
// trade between neighbours, a 2 for 2 trade, 10 wheat for 1 wood, and the trade with a chat bubble (phones only for the
// last three). The 2.5 s clear timer is held in Jarrod's tab so each cue can be photographed.
// Run: OUT=<dir> node --import ./server/register.mjs scripts/seat-gains-pictures.mjs   (ONLY=390x844,430x932 to limit)
// docs/proofs/827 stacks this run at fe684c26 ("today") over this run on the PR head ("new").
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createGame } from '../src/lib/game/board.ts';

const OUT = process.env.OUT;

const directory = mkdtempSync(path.join(tmpdir(), 'emberisle-gain-round2-'));
function writeRoom(code) {
  const game = createGame({ humans: [{ name: 'Jarrod' }, { name: 'Joshua' }, { name: 'Isaac' }, { name: 'Daking' }], bots: 0, seed: 14 });
  game.phase = 'roll'; game.rollOff = null; game.current = 'p1'; game.rolls = 4; game.log = ['Earlier event'];
  for (const vertex of game.vertices) vertex.building = null;
  const H = id => game.hexes.find(h => h.id === id);
  const triple = game.vertices.filter(v => v.hexes.length === 3);
  const dv = triple.find(v => v.hexes.some(h => H(h).terrain === 'ore') && v.hexes.some(h => H(h).terrain === 'wool') && !v.hexes.includes(game.robberHex));
  const O = dv.hexes.find(h => H(h).terrain === 'ore'), W = dv.hexes.find(h => H(h).terrain === 'wool');
  const third = dv.hexes.find(h => h !== O && h !== W);
  const far = (v, used) => used.every(u => Math.hypot(u.x - v.x, u.z - v.z) > 1.9);
  const used = [dv];
  const jv = triple.find(v => far(v, used) && v.hexes.some(h => H(h).terrain === 'grain') && !v.hexes.some(h => [O, W].includes(h)) && !v.hexes.includes(game.robberHex));
  const G = jv.hexes.find(h => H(h).terrain === 'grain'); used.push(jv);
  const iv = triple.find(v => far(v, used) && v.hexes.some(h => H(h).terrain === 'timber') && !v.hexes.some(h => [O, W, G].includes(h)));
  const T = iv.hexes.find(h => H(h).terrain === 'timber'); used.push(iv);
  const paying = [O, W, G, T];
  for (const hex of game.hexes) if (hex.pip === 6 && !paying.includes(hex.id)) hex.pip = 5;
  for (const id of paying) H(id).pip = 6;
  if (H(third).pip === 6) H(third).pip = 9;
  jv.building = { playerId: 'p1', kind: 'stronghold' };
  iv.building = { playerId: 'p2', kind: 'outpost' };
  dv.building = { playerId: 'p3', kind: 'outpost' };
  const quiet = v => far(v, used) && v.hexes.length >= 2 && !v.hexes.some(h => H(h).pip === 6);
  for (const pid of ['p0', 'p0', 'p1', 'p2', 'p3']) { const v = game.vertices.find(quiet); v.building = { playerId: pid, kind: 'outpost' }; used.push(v); }
  for (const v of used) { const e = game.edges.find(e => (e.va === v.id || e.vb === v.id) && !e.path); if (e) e.path = v.building.playerId; }
  for (const p of game.players) { for (const r of ['timber', 'clay', 'wool', 'grain', 'ore']) p.resources[r] = 0; }
  Object.assign(game.players[0].resources, { timber: 2, clay: 1, grain: 1 });
  // Enough in hand for four trades in a row: 1 for 1, 2 for 2, 10 for 1, and 1 for 1 again.
  Object.assign(game.players[1].resources, { grain: 11, ore: 1 });
  Object.assign(game.players[2].resources, { timber: 3, wool: 1, clay: 1 });
  game.players[3].resources.wool = 1;
  game.lastProduction = [];
  const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `fixture-${p.id}` }));
  writeFileSync(path.join(directory, `${code}.json`), JSON.stringify({ code, host: 's0', next: 2, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));
}

let shots = [
  { code: 'GA2N', width: 430, height: 932, touch: true },
  { code: 'GA1N', width: 390, height: 844, touch: true },
  { code: 'GA3N', width: 844, height: 390, touch: true },
  { code: 'GA4N', width: 1280, height: 720, touch: false },
];
if (process.env.ONLY) shots = shots.filter(s => process.env.ONLY.split(',').includes(`${s.width}x${s.height}`));
for (const shot of shots) writeRoom(shot.code);

const preload = path.join(directory, 'dice.mjs');
writeFileSync(preload, 'crypto.getRandomValues = (buffer) => { buffer.fill(2); return buffer; };\n');
const host = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', './register.mjs', 'host.mjs'], {
  cwd: new URL('../server/', import.meta.url),
  env: { ...process.env, PORT: '0', ROOMS_DIR: directory, PROFILES_DIR: path.join(directory, 'profiles'), TURN_MS: '600000', GRACE_MS: '600000', HOLD_MS: '600000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = ''; host.stderr.on('data', d => stderr += d);
process.on('exit', () => { host.kill(); rmSync(directory, { recursive: true, force: true }); });

try {
  const hostPort = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(`host startup timeout: ${stderr}`)), 10000);
    host.once('error', e => { clearTimeout(timeout); reject(e); });
    host.once('exit', c => { clearTimeout(timeout); reject(Error(`host exited ${c}: ${stderr}`)); });
    host.stdout.on('data', d => { const m = String(d).match(/listening (\d+)/); if (m) { clearTimeout(timeout); resolve(Number(m[1])); } });
  });
  const port = Number(process.env.VITE_PORT) || 18733;
  const vite = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  await vite.listen();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  mkdirSync(OUT, { recursive: true });
  
  for (const shot of shots) {
    const size = `${shot.width}x${shot.height}`;
    const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 2, hasTouch: shot.touch, isMobile: shot.touch });
    async function makeTab(pid, hold) {
      const p = await context.newPage();
      await p.addInitScript(({ code, pid, hold, wide }) => {
        localStorage.setItem('emberisle-seat', JSON.stringify({ code, secret: `fixture-${pid}` }));
        localStorage.setItem('emberisle-seat-live', code);
        localStorage.setItem('emberisle-chat-open', '0');
        localStorage.setItem('emberisle-water', 'simple');
        if (hold) {
          // Hold the cue's 2.5 s clear timer so one real cue can be photographed several times. __release() lets it clear.
          const real = window.setTimeout; window.__held = [];
          window.setTimeout = (fn, ms, ...rest) => (ms === 2500 || (wide && ms > 2600 && ms <= 4100)) ? (window.__held.push(fn), 0) : real(fn, ms, ...rest);
          window.__release = () => { const held = window.__held; window.__held = []; held.forEach(fn => fn()); };
        }
      }, { code: shot.code, pid, hold, wide: !shot.touch });
      await p.goto(`http://127.0.0.1:${port}/?host=ws://127.0.0.1:${hostPort}`);
      await p.waitForFunction(pid => window.__emberisle?.getState().state && window.__emberisle.getState().localId === pid, pid);
      await p.waitForFunction(() => window.__isle?.renders > 2);
      return p;
    }
    const jarrod = await makeTab('p0', true);
    const joshua = await makeTab('p1'), isaac = await makeTab('p2'), daking = await makeTab('p3');
    void daking;
    await jarrod.bringToFront();
    const scope = shot.touch ? 'seat' : 'rail';
    const cuesFor = (ids, pills) => jarrod.waitForFunction(({ ids, scope, pills }) => ids.every((id, i) => {
      const root = document.querySelector(`[data-testid="${scope}-${id}"] [data-testid="seat-public-gains"]`);
      const all = root ? [...root.querySelectorAll('[data-testid="seat-public-pill"]')] : [];
      return all.length === pills[i] && all.every(pill => parseFloat(getComputedStyle(pill).opacity) > 0.95);
    }), { ids, scope, pills });
    const clip = scope === 'seat' ? { x: 0, y: 0, width: shot.width, height: shot.height > 500 ? 200 : 150 } : { x: 0, y: 64, width: 640, height: 216 };
    const measure = () => jarrod.evaluate(scope => [...document.querySelectorAll(`.seat-card[data-testid^="${scope}-"]`)].map(card => {
      const r = b => [b.left, b.top, b.right, b.bottom].map(n => Math.round(n * 10) / 10);
      const cue = card.querySelector('[data-testid="seat-public-gains"]');
      const pills = cue ? [...cue.querySelectorAll('[data-testid="seat-public-pill"]')] : [];
      const bubble = card.querySelector('.seat-bubble > div');
      return { id: card.dataset.testid, seat: r(card.getBoundingClientRect()), cue: cue && r(cue.getBoundingClientRect()), pills: pills.map(p => r(p.getBoundingClientRect())),
        font: pills.map(p => getComputedStyle(p).fontSize), fits: pills.map(p => p.scrollWidth <= p.clientWidth + 0.5), bubble: bubble && r(bubble.getBoundingClientRect()) };
    }).filter(s => s.cue), scope);
    async function series(moment) {
      await jarrod.evaluate(() => document.getAnimations().forEach(a => { if (String(a.animationName).startsWith('seat-tag')) a.finish(); }));
      await jarrod.evaluate(() => document.getAnimations().forEach(a => a.pause()));
      await jarrod.waitForTimeout(60);
      await jarrod.screenshot({ path: path.join(OUT, `${moment}-${size}.png`), clip });
      console.log(size, moment, JSON.stringify(await measure()));
    }
    async function clear() {
      await jarrod.evaluate(() => window.__release());
      await jarrod.waitForFunction(() => !document.querySelector('[data-testid="seat-public-gains"]'));
    }
    async function trade(give, want, pills, before) {
      await joshua.evaluate(([give, want]) => window.__emberisle.getState().askTable(give, want), [give, want]);
      await isaac.waitForFunction(() => window.__emberisle.getState().offer);
      if (before) await before();
      await isaac.evaluate(() => window.__emberisle.getState().answerTrade(true));
      await cuesFor(['p1', 'p2'], pills);
      await isaac.waitForFunction(() => !window.__emberisle.getState().offer);
    }
    const every = shot.touch && shot.width < 500;

    await joshua.evaluate(() => window.__emberisle.getState().dispatch({ type: 'roll' }));
    await cuesFor(['p1', 'p2', 'p3'], [1, 1, 2]);
    // Let the big dice settle so all three rows show the same table.
    await jarrod.waitForTimeout(1500);
    await series('roll');
    await joshua.waitForFunction(() => window.__emberisle.getState().state.phase === 'main');
    await clear();
    await trade({ grain: 1 }, { timber: 1 }, [2, 2]);
    await series('trade');
    await clear();
    if (every) {
      await trade({ grain: 1, ore: 1 }, { timber: 1, wool: 1 }, [4, 4]);
      await series('two-for-two');
      await clear();
      await trade({ grain: 10 }, { timber: 1 }, [2, 2]);
      await series('ten');
      await clear();
      await trade({ grain: 1 }, { timber: 1 }, [2, 2], async () => {
        await isaac.evaluate(() => window.__emberisle.getState().sendChat('Deal'));
        await jarrod.waitForSelector(`[data-testid="${scope}-p2"] [data-testid="chat-bubble"]`, { timeout: 3000 }).catch(() => console.log(size, 'NO BUBBLE'));
      });
      await series('bubble');
    }
    await context.close();
  }
  await browser.close();
  await vite.close();
  console.log('seat-gains-pictures ok');
} finally {
  host.kill();
}
