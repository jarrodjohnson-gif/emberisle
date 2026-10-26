// #827: Proof screenshots with real WebGL board rendering for desktop and mobile
// Run: node --import ./server/register.mjs scripts/seat-gains-pictures.mjs
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createGame } from '../src/lib/game/board.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'emberisle-seat-pictures-'));
const code = 'GA1N';
let game = createGame({ humans: [{ name: 'Jarrod' }, { name: 'Joshua' }], bots: 0, seed: 14 });
game.phase = 'roll'; game.rollOff = null; game.current = 'p0'; game.rolls = 4; game.log = ['Earlier event'];
for (const vertex of game.vertices) vertex.building = null;
const vertex = game.vertices.find(v => v.hexes.length === 3);
vertex.building = { playerId: 'p1', kind: 'stronghold' };
for (const hex of game.hexes) { hex.pip = 8; hex.terrain = 'grain'; }
const paying = game.hexes.find(h => h.id === vertex.hexes[0]); paying.pip = 6;
game.robberHex = game.hexes.find(h => h.id !== paying.id).id;
for (const p of game.players) { for (const r of ['timber', 'clay', 'wool', 'grain', 'ore']) p.resources[r] = 0; }
game.players[0].resources.timber = 2; game.players[1].strongholdsLeft = 3;
game.bank = { timber: 17, clay: 19, wool: 19, grain: 19, ore: 19 };
game.lastProduction = [{ hex: paying.id, player: 'p1', res: 'grain', n: 2 }];
const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `fixture-${p.id}` }));
writeFileSync(path.join(directory, `${code}.json`), JSON.stringify({ code, host: 's0', next: 2, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));

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
  const port = Number(process.env.VITE_PORT) || 18729;
  const vite = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  await vite.listen();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  mkdirSync('docs/proofs/827', { recursive: true });

  // 1. Desktop 1280x720 with real 3D board
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  async function makeTab(pid) {
    const p = await context.newPage();
    await p.addInitScript(({ code, pid }) => {
      localStorage.setItem('emberisle-seat', JSON.stringify({ code, secret: `fixture-${pid}` }));
      localStorage.setItem('emberisle-seat-live', code);
      localStorage.setItem('emberisle-chat-open', '0');
      localStorage.setItem('emberisle-water', 'simple');
    }, { code, pid });
    await p.goto(`http://127.0.0.1:${port}/?host=ws://127.0.0.1:${hostPort}`);
    await p.waitForFunction(pid => window.__emberisle?.getState().state && window.__emberisle.getState().localId === pid, pid);
    await p.waitForFunction(() => window.__isle?.renders > 2);
    return p;
  }
  const jarrod = await makeTab('p0');
  const joshua = await makeTab('p1');

  const cueDesktop = jarrod.getByTestId('rail-p1').getByTestId('seat-public-gains');
  await jarrod.evaluate(() => window.__emberisle.getState().dispatch({ type: 'roll' }));
  await cueDesktop.waitFor();
  await jarrod.screenshot({ path: 'docs/proofs/827/seat-gains-desktop.png' });
  console.log('captured docs/proofs/827/seat-gains-desktop.png');

  // 2. Mobile 390x844 with real 3D board and table trade cue
  await jarrod.setViewportSize({ width: 390, height: 844 });
  await jarrod.evaluate(() => window.__emberisle.getState().askTable({ timber: 1 }, { grain: 1 }));
  await joshua.waitForFunction(() => window.__emberisle.getState().offer);
  await joshua.evaluate(() => window.__emberisle.getState().answerTrade(true));

  const phoneCue = jarrod.getByTestId('seat-p1').getByTestId('seat-public-gains');
  await phoneCue.waitFor();
  await jarrod.screenshot({ path: 'docs/proofs/827/seat-gains-phone.png' });
  console.log('captured docs/proofs/827/seat-gains-phone.png');

  await context.close();

  await browser.close();
  await vite.close();
  console.log('seat-gains-pictures ok');
} finally {
  host.kill();
}
