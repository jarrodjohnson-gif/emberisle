// #662: the sea-and-wind ambience (src/lib/ambience.ts, started by src/lib/sound.ts). Headless Chromium on the Title page, with
// every AudioContext, gain node and buffer source the page makes recorded, and every request for amb_sea.mp3 counted.
// - before the first key or press nothing is fetched and no AudioContext exists;
// - after it the loop plays: one context running, one looping buffer source of the whole 20 s file, gain 0.12 (AMB_VOLUME
//   at Music and ambience 100%), and the file fetched once;
// - the Music and ambience level scales it (50% -> 0.06), and All sound scales it too;
// - master mute, the Music and ambience mute, the old Music switch, the Sea sounds switch and a hidden tab each pause it
//   (context suspended) and undoing each resumes the same source, with no second source or fetch;
// - with Sea sounds saved off, a key press fetches nothing and makes no context; switching it on starts the loop;
// - with localStorage throwing, the page loads, the loop starts on a key press (Sea sounds is on by default) and the switch
//   works for the session.
// Zero console errors. Run: npm run ambience-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8134;
const FILE = "amb_sea.mp3";
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (what) => console.log(`ok ${what}`);

async function until(check, what, ms = 15_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) return last;
    await sleep(50);
  }
  throw new Error(`timed out: ${what}`);
}

// A fresh page on the Title. `storage` runs first in the page, before the app, to seed or block localStorage.
async function open(storage) {
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const page = await context.newPage();
  const fetches = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => new URL(r.url()).pathname.endsWith(FILE) && fetches.push(r.url()));
  if (storage) await page.addInitScript(storage);
  await page.addInitScript(() => {
    const amb = (window.__amb = { ctxs: [], gains: [], sources: [] });
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        amb.ctxs.push(this);
      }
      createGain() {
        const g = super.createGain();
        amb.gains.push(g);
        return g;
      }
      createBufferSource() {
        const s = super.createBufferSource();
        amb.sources.push(s);
        const start = s.start.bind(s);
        s.start = (...a) => { s.__started = true; return start(...a); };
        return s;
      }
    };
    // A hidden tab, as the browser reports one when the player switches away.
    window.__setHidden = (hidden) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);
  // What the ambience is doing now, as the page's own audio graph says.
  const state = () =>
    page.evaluate(() => {
      const { ctxs, gains, sources } = window.__amb;
      const s = sources[0];
      return {
        ctxs: ctxs.length,
        state: ctxs[0]?.state ?? null,
        gain: gains[0] ? Math.round(gains[0].gain.value * 1000) / 1000 : null,
        sources: sources.length,
        started: !!s?.__started,
        loop: !!s?.loop,
        duration: s?.buffer ? Math.round(s.buffer.duration * 100) / 100 : null,
      };
    });
  const call = (mod, fn, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [mod, fn, args]);
  return { page, context, fetches, state, call };
}

const SOUND = "/src/lib/sound.ts";
const SEA = "/src/lib/sea-setting.ts";
const MIX = "/src/lib/sound-settings.ts";
let code = 0;
try {
  // ---- Before the first gesture nothing loads; after it the loop plays.
  {
    const t = await open();
    await sleep(1200);
    assert.deepEqual(await t.state(), { ctxs: 0, state: null, gain: null, sources: 0, started: false, loop: false, duration: null }, "no AudioContext before the first gesture");
    assert.equal(t.fetches.length, 0, "amb_sea.mp3 is not fetched before the first gesture");
    ok("nothing is fetched and no AudioContext exists before the first key or press");

    await t.page.keyboard.press("Shift");
    const playing = await until(async () => { const s = await t.state(); return s.state === "running" && s.started ? s : null; }, "the loop plays after the first key");
    assert.equal(playing.ctxs, 1, "one AudioContext");
    assert.equal(playing.sources, 1, "one buffer source");
    assert.equal(playing.loop, true, "the buffer source loops");
    assert.ok(Math.abs(playing.duration - 20) <= 0.05, `the decoded loop is the whole 20 s file with no padding (got ${playing.duration} s)`);
    assert.equal(playing.gain, 0.12, "gain is AMB_VOLUME 0.12 at Music and ambience 100%");
    assert.equal(await t.page.evaluate(async (m) => (await import(m)).AMB_VOLUME, SOUND), 0.12);
    assert.equal(t.fetches.length, 1, "the file is fetched once");
    ok(`after the first key: one running context, one looping ${playing.duration} s buffer, gain ${playing.gain}, one fetch`);

    // ---- The mixer scales it.
    await t.call(MIX, "setCategoryVolume", "music", 0.5);
    await until(async () => (await t.state()).gain === 0.06, "Music and ambience 50% gives 0.06");
    await t.call(MIX, "setMasterVolume", 0.5);
    await until(async () => (await t.state()).gain === 0.03, "All sound 50% halves it again to 0.03");
    await t.call(MIX, "setMasterVolume", 1);
    await t.call(MIX, "setCategoryVolume", "music", 1);
    await until(async () => (await t.state()).gain === 0.12, "back to 0.12");
    ok("Music and ambience 50% plays it at 0.06, All sound 50% on top at 0.03, and 100% restores 0.12");

    // ---- Each off switch pauses it; undoing it resumes the same loop.
    const pausesAndResumes = async (what, off, on) => {
      await off();
      await until(async () => (await t.state()).state === "suspended", `${what} pauses the loop`);
      await on();
      const s = await until(async () => { const s = await t.state(); return s.state === "running" ? s : null; }, `undoing ${what} resumes the loop`);
      assert.equal(s.sources, 1, `${what}: the same source resumes, no second one`);
      assert.equal(s.gain, 0.12, `${what}: back at 0.12`);
      assert.equal(t.fetches.length, 1, `${what}: no second fetch`);
      ok(`${what} pauses it and undoing it resumes the same loop at 0.12, no second fetch`);
    };
    await pausesAndResumes("master mute", () => t.call(SOUND, "setMuted", true), () => t.call(SOUND, "setMuted", false));
    await pausesAndResumes("the Music and ambience mute", () => t.call(MIX, "setCategoryMuted", "music", true), () => t.call(MIX, "setCategoryMuted", "music", false));
    await pausesAndResumes("Music and ambience at 0%", () => t.call(MIX, "setCategoryVolume", "music", 0), () => t.call(MIX, "setCategoryVolume", "music", 1));
    await pausesAndResumes("the old Music switch off", () => t.call(SOUND, "setMusicOn", false), () => t.call(SOUND, "setMusicOn", true));
    await pausesAndResumes("Sea sounds off", () => t.call(SEA, "setSeaSounds", false), () => t.call(SEA, "setSeaSounds", true));
    await pausesAndResumes("a hidden tab", () => t.page.evaluate(() => window.__setHidden(true)), () => t.page.evaluate(() => window.__setHidden(false)));
    await t.context.close();
  }

  // ---- Sea sounds saved off: nothing loads until it is switched on.
  {
    const t = await open(() => localStorage.setItem("emberisle-sea-sounds", "0"));
    await t.page.keyboard.press("Shift");
    await sleep(1200);
    assert.equal((await t.state()).ctxs, 0, "Sea sounds off: no AudioContext after a key press");
    assert.equal(t.fetches.length, 0, "Sea sounds off: the file is not fetched");
    await t.call(SEA, "setSeaSounds", true);
    const s = await until(async () => { const s = await t.state(); return s.state === "running" && s.started ? s : null; }, "switching Sea sounds on starts the loop");
    assert.equal(s.gain, 0.12);
    assert.equal(t.fetches.length, 1);
    assert.equal(await t.page.evaluate(() => localStorage.getItem("emberisle-sea-sounds")), null, "on is saved as the default");
    ok("with Sea sounds saved off a key press fetches nothing; switching it on starts the loop at 0.12");
    await t.context.close();
  }

  // ---- Blocked storage: the page loads, the loop starts on the first key, and the switch works for the session.
  {
    const t = await open(() => {
      const fail = () => { throw new DOMException("blocked", "SecurityError"); };
      Object.defineProperty(window, "localStorage", { configurable: true, get: fail });
    });
    await t.page.keyboard.press("Shift");
    await until(async () => { const s = await t.state(); return s.state === "running" && s.started ? s : null; }, "blocked storage: the loop plays after the first key");
    await t.call(SEA, "setSeaSounds", false);
    await until(async () => (await t.state()).state === "suspended", "blocked storage: Sea sounds off pauses it");
    await t.call(SEA, "setSeaSounds", true);
    await until(async () => (await t.state()).state === "running", "blocked storage: Sea sounds on resumes it");
    ok("with localStorage throwing the page loads, the loop starts on the first key and the Sea sounds switch works");
    await t.context.close();
  }

  assert.deepEqual(errors, [], "zero console errors");
  console.log("ambience-prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
