// #331: with nothing moving the board renders at about 12 fps; a drag or a state push brings back full rate.
// Software GL draws only one or two real frames a second here, so the proof swaps the composer's draw for a no-op
// and counts what the loop decides to render (window.__isle.renders) at the browser's own frame rate.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8098;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle);
  await page.evaluate(() => {
    const isle = window.__isle;
    window.__draws = 0;
    isle.composer.render = () => {
      window.__draws += 1;
    };
  });

  // Renders (the renderer's counter) and draws (the stub's count) over a window of ms.
  const count = (ms) =>
    page.evaluate(async (ms) => {
      const isle = window.__isle;
      const r0 = isle.renders;
      const d0 = window.__draws;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, ms));
      return { renders: isle.renders - r0, draws: window.__draws - d0, ms: Math.round(performance.now() - t0) };
    }, ms);
  // Idle: past the 1 s hold, no walk, no pulsing ring.
  const idle = () =>
    page.waitForFunction(
      () => {
        const isle = window.__isle;
        const pulsing = isle.marks.children.some((m) => m.userData.kind === "hex");
        return (isle.busyUntil ?? 0) < performance.now() && !isle.walk && !pulsing;
      },
      null,
      { timeout: 15000 },
    );

  // The title keeps its 30 fps gate: above the idle cap, at most ~30 a second. Measured once the page has settled.
  await page.waitForFunction(() => window.__draws >= 20, null, { timeout: 30000 });
  const title = await count(2000);
  check("title 30 fps gate (31..75 in 2 s)", title.draws > 30 && title.draws <= 75, title);

  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState);
  // #232: roll off first, so the board is measured in setup as before (the roll-off's longer phase sentence
  // and Roll button cover the canvas centre at 640x400, where the drag below starts).
  await page.evaluate(() => {
    const g = window.__emberisle;
    while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" });
  });
  await idle();
  const still = await count(2000);
  check("idle: at most 30 renders in 2 s", still.draws <= 30, still);
  check("window.__isle.renders counts every draw", still.renders === still.draws, still);

  // A drag across the canvas for 2 s.
  const box = await page.locator("canvas").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  const d0 = await page.evaluate(() => window.__draws);
  const t0 = Date.now();
  await page.mouse.down();
  for (let i = 0; Date.now() - t0 < 2000; i++) await page.mouse.move(cx + (i % 2 ? 60 : -60), cy, { steps: 4 });
  await page.mouse.up();
  const drag = { draws: (await page.evaluate(() => window.__draws)) - d0, ms: Date.now() - t0 };
  check("drag: at least 3x idle in 2 s", drag.draws >= 3 * Math.max(still.draws, 1), { drag, idle: still.draws });

  // A state push holds full rate for 1 s: compare that second with half the idle window.
  await idle();
  const pushed = await page.evaluate(async () => {
    const g = window.__emberisle;
    const isle = window.__isle;
    const st = structuredClone(g.getState().state);
    st.seq += 1;
    const d0 = window.__draws;
    const t0 = performance.now();
    g.setState({ state: st });
    await new Promise((r) => setTimeout(r, 1000));
    return { draws: window.__draws - d0, ms: Math.round(performance.now() - t0), held: isle.busyUntil - t0 };
  });
  check("state push: at least 3x idle over its 1 s", pushed.draws >= 1.5 * Math.max(still.draws, 1), { pushed, idlePerSecond: still.draws / 2 });

  // A walk started after the loop idled begins at its real start, not at the last frame's time (a stale clock skipped 20-30% of a 300 ms hop; one frame is ~5-8%).
  await idle();
  await count(1500);
  const first = await page.evaluate(async () => {
    const g = window.__emberisle;
    const isle = window.__isle;
    // Start the walk when the last frame is at least 60 ms old: an idle gap, as in the worst case.
    await new Promise((res) => {
      const poll = () => (performance.now() - isle.lastFrame > 60 ? res() : requestAnimationFrame(poll));
      poll();
    });
    const st = structuredClone(g.getState().state);
    const rh = st.hexes.find((h) => h.id === st.robberHex);
    const { worldOfHex } = await import("/src/lib/game/board.ts");
    const fw = worldOfHex(rh);
    const near = st.hexes.find((h) => {
      const w = worldOfHex(h);
      return Math.abs(Math.hypot(w.x - fw.x, w.z - fw.z) - 1.12 * Math.sqrt(3)) < 0.05;
    });
    st.robberHex = near.id;
    st.seq += 1;
    const r0 = isle.renders;
    const stale = performance.now() - isle.lastFrame;
    g.setState({ state: st });
    // The walk's start against the real "now" on the clock's scale, sampled in the same task: it must not lag by the idle gap.
    const wk0 = isle.walk;
    const lagMs = wk0 ? (isle.clock.getElapsed() + (performance.now() - isle.lastFrame) / 1000 - wk0.start) * 1000 : null;
    await new Promise((res) => {
      const poll = () => (isle.renders > r0 ? res() : requestAnimationFrame(poll));
      poll();
    });
    const wk = isle.walk;
    return { walking: !!wk, lagMs: lagMs === null ? null : Math.round(lagMs * 10) / 10, u: wk ? (isle.clock.getElapsed() - wk.start) / wk.dur : null, stale: Math.round(stale) };
  });
  check("walk after idle: start is the real time (lag <= 10 ms)", first.walking && first.lagMs !== null && first.lagMs <= 10, first);
  check("walk after idle: first frame progress < 50%", first.walking && first.u < 0.5, first);

  // Reduced motion (#382): nothing ambient moves and the loop draws only on a change. Every mesh's position and
  // rotation, sampled 2 s apart once the 1 s hold is over, must match, with at most one draw between.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await idle();
  const snapshot = () =>
    page.evaluate(() => {
      const out = [];
      const r = (v) => Math.round(v * 1e6) / 1e6;
      window.__isle.scene.traverse((o) => {
        if (o.isMesh) out.push([o.name || o.userData.kind || o.uuid, r(o.position.x), r(o.position.y), r(o.position.z), r(o.rotation.x), r(o.rotation.y), r(o.rotation.z)]);
      });
      return out;
    });
  const before = await snapshot();
  const calm = await count(2000);
  const after = await snapshot();
  const moved = before.filter((m, i) => JSON.stringify(m) !== JSON.stringify(after[i]));
  check("reduced motion idle: at most 30 in 2 s", calm.draws <= 30, calm);
  check("reduced motion idle: no mesh moved in 2 s", before.length > 0 && after.length === before.length && moved.length === 0, { meshes: before.length, moved: moved.slice(0, 5) });
  check("reduced motion idle: at most 1 draw in 2 s", calm.draws <= 1, calm);

  // A robber move still shows: the wayfarer is on the new hex at once, with no walk, and the island redraws.
  const hop = await page.evaluate(async () => {
    const g = window.__emberisle;
    const isle = window.__isle;
    const st = structuredClone(g.getState().state);
    const rh = st.hexes.find((h) => h.id === st.robberHex);
    const { worldOfHex } = await import("/src/lib/game/board.ts");
    const fw = worldOfHex(rh);
    const near = st.hexes.find((h) => {
      const w = worldOfHex(h);
      return Math.abs(Math.hypot(w.x - fw.x, w.z - fw.z) - 1.12 * Math.sqrt(3)) < 0.05;
    });
    st.robberHex = near.id;
    st.seq += 1;
    const r0 = isle.renders;
    g.setState({ state: st });
    const target = worldOfHex(near);
    const p = isle.wayfarer.position;
    const atTarget = Math.hypot(p.x - target.x, p.z - target.z) < 0.01;
    await new Promise((res) => {
      const poll = () => (isle.renders > r0 ? res() : requestAnimationFrame(poll));
      poll();
    });
    return { walk: !!isle.walk, atTarget, drew: isle.renders - r0 };
  });
  check("reduced motion: robber move places the wayfarer at once and draws", !hop.walk && hop.atTarget && hop.drew >= 1, hop);

  // Turning the preference off wakes the island again.
  await page.emulateMedia({ reducedMotion: null });
  await idle();
  const woken = await count(2000);
  check("reduced motion off: ambient motion resumes (more than 1 draw in 2 s)", woken.draws > 1, woken);

  check("no console errors", errors.length === 0, errors);
} finally {
  await browser.close();
  await vite.close();
}
if (fails.length) {
  console.log(`\n${fails.length} failed: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nidle-prove: all checks passed");
