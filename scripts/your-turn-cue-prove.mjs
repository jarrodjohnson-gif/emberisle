// #840: your-turn cue is clearer on PC — rising two-note chime, flashing tab title while hidden.
// Practice table:
// - document.title is "● Your turn — Emberisle" while the tab is focused on your turn.
// - With document.hidden forced true, the title alternates with "Emberisle" within 2.5 s.
// - On focus return, the title stays on the your-turn string (no flash).
// - Hotseat never uses the your-turn title.
// - hear() still plays your_turn once at volume 1 for the acting seat; muted and hotseat stay silent (#660 rules).
// - public/audio/your_turn.wav is about 420 ms (rising fifth), not the old 150 ms knocks.
// Run: node scripts/your-turn-cue-prove.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 15_000;
const PORT = Number(process.env.VITE_PORT) || 8491;
const YOURS = "● Your turn — Emberisle";
const IDLE = "Emberisle";

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

let code = 0;
const errors = [];

function ok(msg) {
  console.log(`ok: ${msg}`);
}

async function until(page, pred, label) {
  await page.waitForFunction(pred, null, { timeout: STEP_MS }).catch((e) => {
    throw new Error(`${label}: ${e.message}`);
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    window.__heard = [];
    HTMLMediaElement.prototype.play = function () {
      const file = (this.src || "").split("/").pop()?.replace(/\.\w+$/, "") || "";
      window.__heard.push({ file, volume: this.volume });
      return Promise.resolve();
    };
  });

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await until(page, () => window.__emberisle?.getState().state, "practice table loads");

  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = st.players.find((p) => p.id !== g.getState().localId).id;
    st.phase = "roll";
    st.seq += 1;
    g.setState({ state: st });
  });
  await until(page, () => document.title === "Emberisle", "other seat: idle title");

  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = g.getState().localId;
    st.seq += 1;
    g.setState({ state: st });
  });
  await until(page, () => document.title.startsWith("● Your turn"), "focused tab shows your-turn title");
  ok("focused tab shows ● Your turn — Emberisle");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__forceHidden === true });
    window.__forceHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const seen = await page.evaluate(async () => {
    const titles = new Set();
    const start = performance.now();
    while (performance.now() - start < 2500) {
      titles.add(document.title);
      await new Promise((r) => setTimeout(r, 200));
    }
    return [...titles];
  });
  assert.ok(seen.includes(YOURS), `hidden flash still shows your-turn: ${JSON.stringify(seen)}`);
  assert.ok(seen.includes(IDLE), `hidden flash also shows idle: ${JSON.stringify(seen)}`);
  ok("hidden tab flashes ● Your turn with Emberisle");

  await page.evaluate(() => {
    window.__forceHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.title(), YOURS, "focus return keeps your-turn title");
  const steady = await page.evaluate(async () => {
    const titles = new Set();
    const start = performance.now();
    while (performance.now() - start < 1200) {
      titles.add(document.title);
      await new Promise((r) => setTimeout(r, 200));
    }
    return [...titles];
  });
  assert.deepEqual(steady, [YOURS], `focused tab does not flash: ${JSON.stringify(steady)}`);
  ok("focus return stops the flash");

  // Chime rules via hear() (same path as the online state push).
  const chime = await page.evaluate(async () => {
    const { hear } = await import("/src/lib/game/store.ts");
    const { setMuted, isMuted } = await import("/src/lib/sound.ts");
    const base = structuredClone(window.__emberisle.getState().state);
    const before = { ...base, current: "p1", phase: "main" };
    const after = { ...base, current: "p0", phase: "main", seq: base.seq + 1 };

    window.__heard = [];
    setMuted(false);
    hear(before, after, "p0", "online");
    const once = window.__heard.filter((x) => x.file === "your_turn");

    window.__heard = [];
    setMuted(true);
    hear(before, { ...after, seq: after.seq + 1 }, "p0", "online");
    const muted = window.__heard.filter((x) => x.file === "your_turn");
    const wasMuted = isMuted();
    setMuted(false);

    window.__heard = [];
    hear(before, after, "p0", "hotseat");
    const hotseat = window.__heard.filter((x) => x.file === "your_turn");

    return { once, muted, wasMuted, hotseat };
  });
  assert.equal(chime.once.length, 1, `your_turn once: ${JSON.stringify(chime.once)}`);
  assert.equal(chime.once[0].volume, 1, "your_turn at full table volume");
  assert.equal(chime.wasMuted, true, "mute engaged for silent check");
  assert.deepEqual(chime.muted, [], "muted your_turn silent");
  assert.deepEqual(chime.hotseat, [], "hotseat your_turn silent");
  ok("your_turn chime: once at vol 1, mute and hotseat silent");

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await until(page, () => window.__emberisle?.getState().state, "hotseat loads");
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "roll";
    st.current = st.players[0].id;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForTimeout(100);
  assert.equal(await page.title(), IDLE, "hotseat keeps the plain Emberisle title");
  ok("hotseat never uses the your-turn title");

  const ms = await page.evaluate(async () => {
    const a = new Audio("/audio/your_turn.wav");
    await new Promise((res, rej) => {
      a.onloadedmetadata = () => res();
      a.onerror = () => rej(new Error("your_turn.wav failed to load"));
    });
    return Math.round(a.duration * 1000);
  });
  assert.ok(ms >= 350 && ms <= 500, `your_turn duration ~420 ms, got ${ms}`);
  ok(`your_turn wav is ${ms} ms (rising two-note)`);

  assert.deepEqual(errors, [], `console errors: ${errors.join("; ")}`);
  console.log("your-turn-cue-prove: all ok");
} catch (e) {
  console.error("FAIL", e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
