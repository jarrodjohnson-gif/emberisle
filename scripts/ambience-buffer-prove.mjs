import assert from "node:assert/strict";
import { createBufferedAmbience } from "../src/lib/ambience.ts";

const originalFetch = globalThis.fetch;
const originalAudioContext = globalThis.AudioContext;
const contexts = [], requests = [];
class Source {
  loop = false;
  connect(node) { this.connected = node; }
  start(when, offset) { this.started = { when, offset }; }
  stop() { this.stopped = true; }
  disconnect() { this.disconnected = true; }
}
class Context {
  state = "running";
  currentTime = 0;
  destination = {};
  sources = [];
  gains = [];
  decodes = 0;
  constructor() { contexts.push(this); }
  async resume() { this.state = "running"; }
  async decodeAudioData(bytes) { this.decodes++; assert.equal(bytes.byteLength, 4); return { duration: 20 }; }
  createGain() { const node = { gain: { value: 0 }, connect: () => {} }; this.gains.push(node); return node; }
  createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
}
globalThis.AudioContext = Context;
let release;
globalThis.fetch = (url) => { requests.push(url); return new Promise(resolve => { release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); }); };
const flush = () => new Promise(resolve => setImmediate(resolve));
const player = createBufferedAmbience("/audio/amb_sea.mp3");
player.setGain(0.12);
assert.equal(contexts.length, 0, "creation and gain changes do not start audio");
player.setActive(true);
assert.deepEqual(requests, ["/audio/amb_sea.mp3"]);
player.setActive(false);
release();
await flush();
assert.equal(contexts[0].sources.length, 0, "disabling while downloading prevents late playback");
player.setActive(true);
await flush();
const ctx = contexts[0], first = ctx.sources[0];
assert.equal(ctx.decodes, 1);
assert.equal(ctx.gains[0].gain.value, 0.12);
assert.equal(first.loop, true);
assert.equal(first.buffer.duration, 20);
assert.deepEqual(first.started, { when: 0, offset: 0 });
player.setGain(0.06);
assert.equal(ctx.gains[0].gain.value, 0.06);
ctx.currentTime = 3.25;
player.setActive(false);
assert.equal(first.stopped, true);
assert.equal(first.disconnected, true);
player.setActive(true);
await flush();
assert.equal(ctx.sources[1].started.offset, 3.25, "resume continues from the paused position");
assert.equal(requests.length, 1, "the decoded loop is loaded once");
assert.equal(ctx.decodes, 1);
assert.equal(ctx.gains.length, 1);
player.setActive(false);
console.log("ambience-buffer-prove: one buffered loop, cancellation, pause/resume, volume and one download passed");

globalThis.fetch = originalFetch;
globalThis.AudioContext = originalAudioContext;
const { chromium } = await import("playwright");
const { createServer } = await import("vite");
const vite = await createServer({ server: { host: "127.0.0.1", port: 18752, strictPort: true }, logLevel: "error", plugins: [{ name: "ambience-harness", configureServer(server) { server.middlewares.use("/ambience-test", (_req, res) => { res.setHeader("content-type", "text/html"); res.end("<!doctype html><button>Gesture</button>"); }); } }] });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const audioRequests = [];
  page.on("request", request => { if (request.url().includes("amb_sea.mp3")) audioRequests.push(request.url()); });
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.__ambSources = [];
    window.AudioContext = class extends Native {
      createBufferSource() {
        const source = super.createBufferSource();
        window.__ambSources.push(source);
        return source;
      }
    };
  });
  await page.goto("http://127.0.0.1:18752/ambience-test");
  await page.evaluate(async () => {
    const { createBufferedAmbience } = await import("/src/lib/ambience.ts");
    window.__ambPlayer = createBufferedAmbience("/audio/amb_sea.mp3");
    window.__ambPlayer.setGain(0.12);
    document.querySelector("button").onclick = () => window.__ambPlayer.setActive(true);
  });
  assert.equal(audioRequests.length, 0, "the real clip is not requested before activation");
  await page.getByRole("button", { name: "Gesture" }).click();
  await page.waitForFunction(() => window.__ambSources.length === 1 && window.__ambSources[0].buffer, null, { timeout: 15000 });
  const native = await page.evaluate(() => ({ loop: window.__ambSources[0].loop, seconds: window.__ambSources[0].buffer.duration, state: window.__ambSources[0].context.state }));
  assert.equal(native.loop, true);
  assert.ok(native.seconds > 19 && native.seconds < 21);
  assert.equal(native.state, "running");
  await page.evaluate(() => window.__ambPlayer.setActive(false));
  await page.getByRole("button", { name: "Gesture" }).click();
  await page.waitForFunction(() => window.__ambSources.length === 2, null, { timeout: 15000 });
  assert.equal(audioRequests.length, 1, "reactivation uses the decoded native buffer");
  console.log(`ambience-buffer-prove: native browser buffer loops ${native.seconds.toFixed(2)} s; one fetch and successful reactivation`);
  const integration = await browser.newPage();
  const integrationRequests = [];
  integration.on("request", request => { if (request.url().includes("amb_sea.mp3")) integrationRequests.push(request.url()); });
  await integration.addInitScript(() => {
    const Native = window.AudioContext;
    window.__ambSources = [];
    window.__ambGains = [];
    window.__ambStops = 0;
    window.AudioContext = class extends Native {
      createGain() { const gain = super.createGain(); window.__ambGains.push(gain); return gain; }
      createBufferSource() {
        const source = super.createBufferSource(), stop = source.stop.bind(source);
        source.stop = (...args) => { window.__ambStops++; return stop(...args); };
        window.__ambSources.push(source);
        return source;
      }
    };
  });
  await integration.goto("http://127.0.0.1:18752/ambience-test");
  await integration.evaluate(async () => { window.__sound = await import("/src/lib/sound.ts"); window.__mix = await import("/src/lib/sound-settings.ts"); });
  assert.equal(await integration.evaluate(() => window.__sound.isAmbienceOn()), false, "fresh profiles default off");
  await integration.evaluate(() => window.__sound.setAmbienceOn(true));
  assert.equal(integrationRequests.length, 0, "enabling before a gesture does not load audio");
  await integration.getByRole("button", { name: "Gesture" }).click();
  try { await integration.waitForFunction(() => window.__ambSources.length === 1 && window.__ambSources[0].buffer, null, { timeout: 15000 }); } catch (error) { console.error("integration state", await integration.evaluate(() => ({ hidden: document.hidden, unlocked: window.__sound.unlocked, muted: window.__sound.isMuted(), on: window.__sound.isAmbienceOn(), sources: window.__ambSources.length })), integrationRequests); throw error; }
  assert.equal(await integration.evaluate(() => window.__ambGains[0].gain.value), 0.11999999731779099);
  assert.equal(await integration.evaluate(() => localStorage.getItem("emberisle-ambience")), "1");
  await integration.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(await integration.evaluate(() => window.__ambStops), 1, "hidden tab stops the source");
  await integration.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await integration.waitForFunction(() => window.__ambSources.length === 2, null, { timeout: 15000 });
  await integration.evaluate(() => window.__sound.setMuted(true));
  assert.equal(await integration.evaluate(() => window.__ambStops), 2, "master mute stops ambience");
  await integration.evaluate(() => window.__sound.setMuted(false));
  await integration.waitForFunction(() => window.__ambSources.length === 3, null, { timeout: 15000 });
  await integration.evaluate(() => window.__mix.setCategoryVolume("music", 0.5));
  assert.ok(Math.abs(await integration.evaluate(() => window.__ambGains[0].gain.value) - 0.06) < 0.000001);
  assert.equal(integrationRequests.length, 1, "visibility and mute resume without fetching again");
  await integration.reload();
  await integration.evaluate(async () => { window.__sound = await import("/src/lib/sound.ts"); });
  assert.equal(await integration.evaluate(() => window.__sound.isAmbienceOn()), true, "on preference survives reload");
  assert.equal(await integration.evaluate(() => window.__ambSources.length), 0, "reload waits for a new gesture");
  assert.equal(integrationRequests.length, 1, "reload does not fetch before a gesture");
  await integration.getByRole("button", { name: "Gesture" }).click();
  await integration.waitForFunction(() => window.__ambSources.length === 1 && window.__ambSources[0].buffer, null, { timeout: 15000 });
  assert.equal(integrationRequests.length, 2);
  await integration.evaluate(() => window.__sound.setAmbienceOn(false));
  assert.equal(await integration.evaluate(() => localStorage.getItem("emberisle-ambience")), null);
  await integration.close();
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } }); });
  await blocked.goto("http://127.0.0.1:18752/ambience-test");
  await blocked.evaluate(async () => { window.__sound = await import("/src/lib/sound.ts"); });
  assert.equal(await blocked.evaluate(() => window.__sound.isAmbienceOn()), false);
  await blocked.evaluate(() => window.__sound.setAmbienceOn(true));
  assert.equal(await blocked.evaluate(() => window.__sound.isAmbienceOn()), true, "blocked storage retains the session setting");
  await blocked.getByRole("button", { name: "Gesture" }).click();
  await blocked.waitForFunction(() => window.__sound.unlocked, null, { timeout: 15000 });
  await blocked.close();
  console.log("ambience-buffer-prove: sound integration defaults off, waits for gesture, survives reload and blocked storage, pauses on hide/mute, resumes and follows music gain");
} finally {
  await browser?.close();
  await vite.close();
}
