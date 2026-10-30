// #1111: real native media, three actual host seats (the host minimum), failed first downloads and same-document socket recovery.
// This isolates a reproducible cached-media failure; it does not attribute the entire live incident or test mobile interruption.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const rooms = mkdtempSync(path.join(tmpdir(), 'emberisle-audio-recovery-'));
const host = spawn(process.execPath, ['--import', './register.mjs', 'host.mjs'], {
  cwd: new URL('../server/', import.meta.url), env: { ...process.env, PORT: '0', ROOMS_DIR: rooms },
});
let browser, vite;
const watchdog = setTimeout(() => { console.error('FAIL audio recovery exceeded 120 seconds'); process.exit(1); }, 120_000);
process.on('exit', () => { host.kill(); rmSync(rooms, { recursive: true, force: true }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0;
const check = (value, why) => { assert.ok(value, why); checks++; console.log('ok', why); };
const targets = { your_turn: 'your_turn.wav', trade_yes: 'confirmation_001.wav', dice_land: 'drop_001.wav', board_bong: 'bong_001.wav' };
const files = Object.values(targets);
try {
  const port = await new Promise((resolve, reject) => {
    host.once('error', reject); host.once('exit', code => reject(new Error(`host exited ${code}`)));
    host.stdout.on('data', data => { const m = String(data).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  });
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [{
    name: 'native-audio-recovery-proof', configureServer(server) {
      server.middlewares.use('/__audio-recovery', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><button>Enable sound</button><script type="module">window.sound=await import("/src/lib/sound.ts");window.game=(await import("/src/lib/game/store.ts")).useGame;</script>');
      });
    },
  }] });
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    // Desktop media fetch/decode recovery, deliberately independent of browser autoplay policy.
    args: ['--autoplay-policy=no-user-gesture-required'] });
  const tabs = [];
  for (const name of ['Ember', 'Tide', 'Pine']) {
    const page = await browser.newPage();
    await page.addInitScript(name => {
      localStorage.setItem('emberisle-name', name);
      window.documentIdentity = crypto.randomUUID(); window.audios = []; window.mediaEvents = []; window.sockets = []; window.hostFrames = [];
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket { constructor(...args) { super(...args); window.sockets.push(this); this.addEventListener('message', event => { const frame = JSON.parse(event.data); window.hostFrames.push({ type: frame.type, seq: frame.game?.seq, sound: frame.line?.sound, you: frame.you }); }); } };
      const NativeAudio = window.Audio;
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args); const id = window.audios.push(audio) - 1;
        for (const event of ['playing', 'timeupdate', 'error', 'ended']) audio.addEventListener(event, () => {
          window.mediaEvents.push({ event, id, file: new URL(audio.src).pathname.split('/').at(-1), time: audio.currentTime, error: audio.error?.code ?? null });
        });
        return audio;
      };
    }, name);
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__audio-recovery?host=ws://127.0.0.1:${port}`);
    await page.waitForFunction(() => window.game && window.sound);
    await page.getByRole('button').click();
    await page.evaluate(() => window.sound.play('ui_click'));
    await page.waitForFunction(() => window.mediaEvents.some(e => e.file === 'click_001.wav' && e.event === 'timeupdate' && e.time > 0));
    check(true, `${name}: native baseline plays and advances before failure`);
    const identity = await page.evaluate(() => window.documentIdentity);
    let failing = true;
    const failedRequests = [];
    await page.route('**/audio/*', route => {
      const file = new URL(route.request().url()).pathname.split('/').at(-1);
      if (failing && files.includes(file)) { failedRequests.push(file); return route.abort('failed'); }
      return route.continue();
    });
    // Prime selected keys before any host game starts; a warm decoded target would mask first-download failure.
    for (const key of Object.keys(targets)) await page.evaluate(key => window.sound.play(key), key);
    await page.waitForFunction(files => files.every(file => window.audios.some(a => a.src.endsWith('/' + file) && a.error?.code === 4)), files);
    check(files.every(file => failedRequests.includes(file)), `${name}: every target first download actually aborted`);
    console.log('FAILED_MEDIA', name, await page.evaluate(() => window.audios.filter(a => a.error).map(a => ({ file: a.src.split('/').at(-1), error: a.error.code, readyState: a.readyState, time: a.currentTime }))));
    tabs.push({ name, page, identity, restore: () => { failing = false; } });
  }
  const call = (t, fn, ...args) => t.page.evaluate(([fn, args]) => window.game.getState()[fn](...args), [fn, args]);
  const view = t => t.page.evaluate(() => {
    const s = window.game.getState(); const g = s.state;
    return { id: s.localId, seat: s.seatId, code: s.code, seats: s.seats, synced: s.synced, health: s.connectionHealth.status,
      seq: g?.seq, phase: g?.phase, current: g?.current, legal: s.legal, mine: g?.players.find(p => p.id === s.localId)?.resources };
  });
  const wait = async (predicate, why, ms = 10_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) { const value = await predicate(); if (value) return value; await sleep(30); }
    throw new Error(`timed out ${why}`);
  };
  const synced = async seq => wait(async () => {
    const vs = await Promise.all(tabs.map(view));
    return vs.every(v => v.seq > seq) && new Set(vs.map(v => v.seq)).size === 1 ? vs : null;
  }, `host state after ${seq}`);
  await call(tabs[0], 'hostTable');
  await tabs[0].page.waitForFunction(() => window.game.getState().code);
  const code = (await view(tabs[0])).code;
  for (const t of tabs.slice(1)) await call(t, 'joinTable', code);
  for (const t of tabs) await t.page.waitForFunction(() => window.game.getState().seats.length === 3);
  check(new Set((await Promise.all(tabs.map(view))).map(v => v.seat)).size === 3, 'three distinct seats joined the real host (minimum legal table)');
  for (const t of tabs) await call(t, 'setReady', true);
  await tabs[0].page.waitForFunction(() => window.game.getState().seats.every(s => s.ready));
  await call(tabs[0], 'startTable');
  let vs = await synced(-1);
  check(new Set(vs.map(v => v.id)).size === 3 && vs.every(v => v.id && v.seat), 'each real host seat has a distinct player identity');
  // Keep target media unavailable through an actual transport loss/rejoin; the other page remains connected.
  const before = vs.map(v => ({ id: v.id, seat: v.seat, synced: v.synced }));
  await tabs[0].page.evaluate(() => window.sockets.at(-1).close());
  await tabs[0].page.waitForFunction(n => window.game.getState().synced > n && window.game.getState().connectionHealth.status === 'Reachable', before[0].synced);
  vs = await Promise.all(tabs.map(view));
  check(vs[0].id === before[0].id && vs[0].seat === before[0].seat, 'dropped socket rejoins the same player and seat');
  check(vs.slice(1).every((v, i) => v.synced === before[i + 1].synced), 'the other host seats stay connected');
  for (const t of tabs) { t.restore(); await t.page.evaluate(() => {
    window.mediaEvents = []; window.hostFrames = [];
    window.mediaTimeBaseline = window.audios.map(audio => audio.currentTime);
  }); }
  await sleep(200); // Existing burst gap; no artificial media reset or reload.
  const recoveryStart = Date.now();
  const expected = tabs.map(() => new Set());
  const actor = () => vs.findIndex(v => v.id === vs[0].current);
  const step = async () => {
    const i = actor(), v = vs[i];
    if (v.phase === 'rollOff' || v.phase === 'roll') { await call(tabs[i], 'dispatch', { type: 'roll' }); if (v.phase === 'roll') rolled = true; }
    else if (v.phase === 'setupSettle') await call(tabs[i], 'pickVertex', v.legal.outpost[0]);
    else if (v.phase === 'setupRoad') await call(tabs[i], 'pickEdge', v.legal.path[0]);
    else if (v.phase === 'main') await call(tabs[i], 'dispatch', { type: 'endTurn' });
    else if (v.phase === 'discard') {
      const j = vs.findIndex(v => v.legal.discard > 0); let left = vs[j].legal.discard; const resources = {};
      for (const [r, count] of Object.entries(vs[j].mine)) { const n = Math.min(count, left); if (n) resources[r] = n; left -= n; }
      await call(tabs[j], 'dispatch', { type: 'discard', resources });
    } else if (v.phase === 'robber') {
      const hex = v.legal.wayfarer.find(h => !v.legal.steal[h]?.length) ?? v.legal.wayfarer[0];
      await call(tabs[i], 'pickHex', hex);
      if ((v.legal.steal[hex] ?? []).length > 1) await call(tabs[i], 'chooseSteal', v.legal.steal[hex][0]);
    } else throw new Error(`unexpected phase ${v.phase}`);
    vs = await synced(vs[0].seq);
    if (vs[0].current !== v.current) expected[actor()].add('your_turn.wav');
  };
  let traded = false, rolled = false;
  for (let n = 0; n < 100 && (!traded || expected.some(s => !s.has('your_turn.wav'))); n++) {
    const i = actor(), j = (i + 1) % tabs.length;
    if (!traded && vs[i].phase === 'main') {
      const give = Object.keys(vs[i].mine).find(r => vs[i].mine[r] > 0);
      // A one-way gift is a legal accepted table trade, so no lucky matching resource draw is needed.
      if (give) {
        const goodsBefore = [vs[i].mine[give], vs[j].mine[give]];
        await call(tabs[i], 'askTable', { [give]: 1 }, {});
        await tabs[j].page.waitForFunction(() => window.game.getState().offer !== null);
        await call(tabs[j], 'answerTrade', true);
        vs = await synced(vs[0].seq);
        traded = true;
        check(vs[i].mine[give] === goodsBefore[0] - 1 && vs[j].mine[give] === goodsBefore[1] + 1, 'a real host trade transfers the offered resource after restoration');
      }
    }
    await step();
  }
  check(traded && rolled && expected.every(s => s.has('your_turn.wav')), 'host actions give all players a new turn and complete a trade');
  await call(tabs[0], 'sendSound', 'bong');
  for (const t of tabs) await t.page.waitForFunction(() => window.game.getState().chat.some(l => l.sound === 'bong'));
  check(true, 'host broadcasts the soundboard cue to all seats');
  // Wait on native playback progress itself, not delivery of a timeupdate event. CI can
  // delay/coalesce those events even while the real media element is already advancing.
  // Keep the timeout bounded and leave the playback assertions below in place.
  await Promise.all(tabs.map(t => t.page.waitForFunction(files => files.every(file => {
    return window.audios.some((audio, id) => new URL(audio.src).pathname.endsWith('/' + file) &&
      audio.currentTime > (window.mediaTimeBaseline[id] ?? 0));
  }), files, { timeout: 8000, polling: 50 })));
  const failures = [];
  for (const t of tabs) {
    const result = await t.page.evaluate(files => ({ identity: window.documentIdentity,
      recovered: files.map(file => {
        const audio = window.audios.find((item, id) => new URL(item.src).pathname.endsWith('/' + file) &&
          item.currentTime > (window.mediaTimeBaseline[id] ?? 0));
        return { file, playing: window.mediaEvents.some(e => e.file === file && e.event === 'playing'),
          advanced: Boolean(audio), startedAt: audio ? window.mediaTimeBaseline[window.audios.indexOf(audio)] ?? 0 : null,
          currentTime: audio?.currentTime ?? null };
      }),
      media: window.audios.map(a => ({ file: a.src.split('/').at(-1), error: a.error?.code ?? null, time: a.currentTime, readyState: a.readyState })) }), files);
    console.log('RECOVERY', t.name, JSON.stringify(result));
    check(await t.page.evaluate(() => window.hostFrames.some(f => f.type === 'state') && window.game.getState().chat.some(l => l.sound === 'bong')), `${t.name}: actual host state and soundboard messages received`);
    check(result.identity === t.identity, `${t.name}: same document throughout failure and reconnect`);
    for (const r of result.recovered) if (!r.playing || !r.advanced) failures.push(`${t.name}/${r.file}: playing=${r.playing}, advanced=${r.advanced}`);
  }
  check(failures.length === 0, `native host-driven playback recovers for all seats: ${failures.join('; ')}`);
  console.log(`audio-recovery-prove: ${checks} checks passed; native recovery in ${Date.now() - recoveryStart}ms`);
} finally {
  clearTimeout(watchdog); await browser?.close(); await vite?.close(); host.kill();
  if (host.exitCode === null && host.signalCode === null) await once(host, 'exit');
  rmSync(rooms, { recursive: true, force: true });
}
