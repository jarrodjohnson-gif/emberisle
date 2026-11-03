// #667: board touch sounds. At 440x956 (touch, a practice game), a plain tap on a hex that places nothing plays that
// terrain's clip once, at 1 (#1073); only a Pasture hex plays the sheep baa (tap_pasture.mp3).
//  - each terrain on the board plays its own clip, once, and only Pasture plays tap_pasture;
//  - rapid taps are one sound per 400 ms;
//  - a one-finger drag that starts on a Pasture hex, a two-finger pan and a pinch play nothing;
//  - during setup (legal marks showing) and with a build armed, a tap on a Pasture hex plays nothing;
//  - muted, a tap plays nothing.
// HTMLMediaElement.play is stubbed to record { file, volume }. Run: npm run board-touch-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8167;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const ok = (what) => console.log(`ok ${what}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLIP = { wool: "tap_pasture.mp3", timber: "tap_forest.wav", clay: "tap_hills.wav", grain: "tap_fields.wav", ore: "tap_mountains.wav", waste: "tap_waste.wav" };

const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  localStorage.setItem("emberisle-water", "simple");
  window.__plays = [];
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), volume: this.volume });
    return Promise.resolve();
  };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
// The in-page pointer events of the rapid-tap step are not real pointers, so the orbit controls cannot capture them.
const synthetic = (t) => /setPointerCapture/.test(t);
page.on("console", (m) => m.type() === "error" && !synthetic(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => !synthetic(String(e)) && errors.push(String(e)));
const frames = (n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
const settle = async () => {
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
  await frames(3);
};
const plays = () => page.evaluate(() => window.__plays.map((p) => p.file));
// Sounds are paced 150 ms apart, up to 8 queued, so a bot's last clip can start after the move it belongs to.
// Wait for a second with no new clip, then empty the list.
const clear = async () => {
  for (let n = -1, m; n !== (m = await page.evaluate(() => window.__plays.length)); n = m) await sleep(1000);
  await page.evaluate(() => { window.__plays.length = 0; });
};
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: STEP_MS });
// A hex's screen point, if the point is on the canvas and hit-tests to nothing else on the page.
const spot = (id) => page.evaluate((id) => {
  const p = window.__isle.screenOf(id);
  if (!p) return null;
  return document.elementFromPoint(p.x, p.y) === document.querySelector("canvas") ? p : null;
}, id);
const hexesOf = (terrain) => page.evaluate((t) => window.__emberisle.getState().state.hexes.filter((h) => h.terrain === t).map((h) => h.id), terrain);
async function tapHex(terrain) {
  for (const id of await hexesOf(terrain)) {
    const p = await spot(id);
    if (!p) continue;
    await page.touchscreen.tap(p.x, p.y);
    return id;
  }
  return null;
}
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
async function drag(pts0, dx, dy, steps = 8) {
  const at = (k) => pts0.map((p, i) => ({ x: p.x + (dx * k) / steps, y: p.y + (dy * k) / steps, id: i + 1 }));
  await touch("touchStart", at(0));
  for (let k = 1; k <= steps; k++) { await touch("touchMove", at(k)); await frames(1); }
  await touch("touchEnd", []);
  await frames(2);
}
const sheep = async () => (await plays()).filter((f) => f === "tap_pasture.mp3").length;

await page.goto(`http://127.0.0.1:${PORT}/`);
await until(() => window.__isle?.renders > 0);
await page.getByRole("button", { name: "Play", exact: true }).click();
await until(() => window.__emberisle.getState().state?.phase === "rollOff");
await page.keyboard.press("Shift");
const roll = page.getByRole("button", { name: "Roll", exact: true });
while ((await page.evaluate(() => window.__emberisle.getState().state.phase)) === "rollOff") {
  if (await roll.isVisible()) await roll.click();
  await sleep(200);
}
await until(() => { const s = window.__emberisle.getState(); return s.state.phase === "setupSettle" && s.state.current === s.localId; });
await settle();

// Setup: legal corners are showing, so a tap on a Pasture hex is aimed at a placement and plays nothing.
await clear();
assert.ok(await tapHex("wool"), "a Pasture hex is on the board and reachable");
await sleep(600);
assert.deepEqual(await plays(), [], "setup: a tap on a Pasture hex plays nothing");
ok("setup (placement marks showing): a Pasture tap is silent");

// Play the rest of setup through the store until it is this seat's roll.
for (;;) {
  const s = await page.evaluate(() => { const g = window.__emberisle.getState(); return { phase: g.state.phase, mine: g.state.current === g.localId }; });
  if (s.phase === "roll" && s.mine) break;
  if (s.mine && s.phase === "setupSettle") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickVertex(g.highlights().vertices[0]); });
  else if (s.mine && s.phase === "setupRoad") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickEdge(g.highlights().edges[0]); });
  await sleep(150);
}
await page.evaluate(() => window.__isle.remeasure());
await settle();
const marks = await page.evaluate(() => { const h = window.__emberisle.getState().highlights(); return h.hexes.length + h.vertices.length + h.edges.length; });
assert.equal(marks, 0, "nothing is legal at the roll");

// Each terrain plays its own clip once, at 1; only Pasture baas.
let sheepTaps = 0;
for (const terrain of Object.keys(CLIP)) {
  if (!(await hexesOf(terrain)).length) continue;
  await clear();
  const id = await tapHex(terrain);
  if (!id) continue;
  await sleep(500);
  const got = await page.evaluate(() => window.__plays);
  assert.deepEqual(got.map((p) => p.file), [CLIP[terrain]], `${terrain}: its clip, once`);
  assert.equal(got[0].volume, 1, `${terrain}: at 1`);
  if (terrain === "wool") sheepTaps++;
  ok(`${terrain} hex ${id}: ${CLIP[terrain]} once at 1${terrain === "wool" ? "" : ", no sheep"}`);
  await settle();
}
assert.equal(sheepTaps, 1, "the Pasture tap was proven");

// Rapid taps: one sound per 400 ms. Raw touches on four different hexes, back to back, with no waiting between them
// (two taps in one spot would be a double tap, which snaps the view home instead).
const rapid = [];
for (const t of ["wool", "timber", "clay", "grain"]) for (const id of await hexesOf(t)) { const p = await spot(id); if (p) { rapid.push(p); break; } }
assert.equal(rapid.length, 4, "four hexes to tap");
await clear();
// In-page pointer events: a CDP touch round trip is slower than the gap under software GL.
const span = await page.evaluate((pts) => {
  const c = document.querySelector("canvas");
  const t0 = performance.now();
  pts.forEach((p, i) => {
    const init = { pointerId: 50 + i, pointerType: "touch", isPrimary: true, button: 0, clientX: p.x, clientY: p.y, bubbles: true };
    c.dispatchEvent(new PointerEvent("pointerdown", init));
    c.dispatchEvent(new PointerEvent("pointerup", init));
  });
  return performance.now() - t0;
}, rapid);
assert.ok(span < 350, `the four taps took ${Math.round(span)} ms, inside the 400 ms gap`);
await sleep(300);
assert.deepEqual(await plays(), ["tap_pasture.mp3"], "four Pasture taps inside 400 ms are one sound, the first");
await sleep(500);
await settle();
await tapHex("wool");
await sleep(300);
assert.equal(await sheep(), 2, "a tap after the gap baas again");
await clear();
await page.evaluate(async () => { const { play } = await import("/src/lib/sound.ts"); for (let i = 0; i < 4; i++) play("sb_plump_sheep"); });
await sleep(300);
assert.deepEqual(await plays(), ["sb_plump_sheep.mp3"], "four taps inside 400 ms are one sound, the first");
ok(`rapid taps: four in ${Math.round(span)} ms are one sound; the next after the gap baas again`);

// A drag that starts on a Pasture hex, a two-finger pan and a pinch play nothing.
await sleep(500);
await settle();
await clear();
let woolSpot = null;
for (const id of await hexesOf("wool")) woolSpot ??= await spot(id);
assert.ok(woolSpot, "a Pasture hex to drag from");
await drag([{ x: woolSpot.x, y: woolSpot.y }], 90, 40);
await sleep(500);
assert.deepEqual(await plays(), [], "a one-finger drag from a Pasture hex plays nothing");
await settle();
await drag([{ x: 150, y: 400 }, { x: 270, y: 400 }], 0, 60);
await sleep(500);
assert.deepEqual(await plays(), [], "a two-finger pan plays nothing");
await settle();
await touch("touchStart", [{ x: 150, y: 480, id: 1 }, { x: 290, y: 480, id: 2 }]);
for (let k = 1; k <= 8; k++) { await touch("touchMove", [{ x: 150 - k * 8, y: 480, id: 1 }, { x: 290 + k * 8, y: 480, id: 2 }]); await frames(1); }
await touch("touchEnd", []);
await sleep(500);
assert.deepEqual(await plays(), [], "a pinch plays nothing");
ok("drag, pan and pinch: silent");
await settle();

// An armed build: a tap on a Pasture hex plays nothing.
await page.evaluate(() => window.__emberisle.getState().setBuildMode("outpost"));
await frames(3);
await clear();
await tapHex("wool");
await sleep(600);
assert.deepEqual(await plays(), [], "armed: a Pasture tap plays nothing");
await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
await frames(3);
await settle();
ok("armed build: a Pasture tap is silent");

// Muted: nothing.
await page.evaluate(async () => (await import("/src/lib/sound.ts")).setMuted(true));
await clear();
await sleep(500);
await tapHex("wool");
await sleep(600);
assert.deepEqual(await plays(), [], "muted: a tap plays nothing");
await page.evaluate(async () => (await import("/src/lib/sound.ts")).setMuted(false));
ok("muted: silent");

assert.deepEqual(errors, [], "no console errors");
console.log("PASS board-touch-prove");
await browser.close();
await vite.close();
process.exit(0);
