// #438: pieces land (docs/design/polish.md "Motion", build bible §8). In practice at 640x400, through window.__isle.
// Software GL draws a few frames a second (2 on a loaded box), too few to see a 280 ms fall, so the poses are read by
// running the renderer's own stepLandings on a virtual clock in 20 ms steps, in the same task as the pick (setBoard is
// synchronous with the store). A real-time check then shows the loop itself brings a piece to rest.
// - an outpost starts 0.2 above its rest height and settles exactly at rest; its knock (outpost_place) plays when it
//   lands, not when it is picked;
// - a path starts short along its edge (scale z < 0.5) and grows to exactly 1;
// - a stronghold swaps in larger than 1 and settles exactly at 1;
// - a redraw with no new piece (a seq bump, as a reconnect gives) leaves every piece at rest;
// - a fresh board (a first board, as on a page load, or a new island) is drawn standing with nothing landing, even
//   for a piece the last board did not have;
// - a rebuild mid-fall (another state push) keeps the fall's original start instead of restarting it;
// - under prefers-reduced-motion the outpost is at rest on the first frame and knocks at once.
// Zero console errors. Run: npm run pieces-land-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8108;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// Start practice and roll off until it is this seat's first outpost. A key press is the gesture that unlocks sound;
// the game starts through the store, since the title's Play button can re-render under load mid-click.
async function toMySetup(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle);
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.__emberisle.getState().startAi());
  for (;;) {
    const next = await (
      await page.waitForFunction(
        () => {
          const s = window.__emberisle.getState();
          const st = s.state;
          if (!st || !window.__isle?.lastState) return false;
          if (st.phase === "rollOff" && st.current === s.localId) return "roll";
          if (st.phase === "setupSettle" && st.current === s.localId) return "mine";
          return false;
        },
        null,
        { timeout: 90_000 },
      )
    ).jsonValue();
    // From here the bots wait (the app re-binds its bot timer to the new runBots and drops the pending one), so no
    // bot piece is landing while the checks read the board.
    if (next === "mine") return page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await page.waitForFunction(() => {
      const s = window.__emberisle.getState();
      return s.state.phase !== "rollOff" || s.state.current !== s.localId;
    });
  }
}

// The landing piece's pose from its start to 400 ms, stepped on a virtual clock. null if the piece is not landing.
const SAMPLE = `(key) => {
  const isle = window.__isle;
  const l = isle.landings.find((x) => x.obj.userData.key === key);
  if (!l) return null;
  const pose = (t) => ({ t, y: l.obj.position.y, restY: l.restY, s: [l.obj.scale.x, l.obj.scale.y, l.obj.scale.z] });
  const out = [pose(0)];
  for (let t = 20; t <= 400; t += 20) {
    isle.stepLandings(l.start + t, false);
    out.push(pose(t));
  }
  return out;
}`;

async function placeOutpost(page) {
  const o = await page.evaluate((sample) => {
    const g = window.__emberisle.getState();
    const id = g.highlights().vertices[0];
    window.__plays = [];
    window.__t0 = performance.now();
    g.pickVertex(id);
    const p = window.__isle.pieces.children.find((c) => c.userData.key === `v:${id}`);
    return { id, built: p && { y: p.position.y, restY: p.userData.restY }, samples: eval(sample)(`v:${id}`) };
  }, SAMPLE);
  await page.waitForFunction(() => window.__plays.some((p) => p.file === "drop_003.wav"));
  o.knock = await page.evaluate(() => window.__plays.find((p) => p.file === "drop_003.wav").t - window.__t0);
  return o;
}

const errors = [];
let code = 0;
try {
  // --- Motion on.
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);

    const o = await placeOutpost(page);
    assert.ok(o.samples, "outpost: not landing");
    const [first] = o.samples;
    const last = o.samples.at(-1);
    assert.ok(o.built.y - o.built.restY > 0.1, `outpost: built ${(o.built.y - o.built.restY).toFixed(3)} above rest`);
    assert.ok(first.y - first.restY > 0.19, `outpost: starts ${(first.y - first.restY).toFixed(3)} above rest`);
    assert.ok(o.samples.some((x) => x.y < x.restY), "outpost: settles with a small overshoot (--ease-snap)");
    assert.equal(last.y, last.restY, "outpost: settles exactly at rest");
    assert.deepEqual(last.s, [1, 1, 1], "outpost: scale 1 at rest");
    const landedAt = o.samples.find((s) => s.y === s.restY)?.t;
    assert.equal(landedAt, 280, `outpost: at rest at ${landedAt} ms`);
    assert.ok(o.knock >= 250, `outpost: knock at ${o.knock} ms, after the fall, not on the pick`);
    console.log(`outpost ${o.id}: +${(first.y - first.restY).toFixed(3)} at 0 ms → rest at ${landedAt} ms; knock at ${Math.round(o.knock)} ms real time`);

    // The path, left to the real loop this time: posed short when built, at rest once real frames have passed.
    const p = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      const id = g.highlights().edges[0];
      const r0 = window.__isle.renders;
      window.__t0 = performance.now();
      g.pickEdge(id);
      const c = window.__isle.pieces.children.find((x) => x.userData.key === `e:${id}`);
      return { id, r0, z: c?.scale.z };
    });
    assert.ok(p.z <= 0.21, `path: built at scale z ${p.z}`);
    await page.waitForFunction((r0) => window.__isle.renders > r0 + 1 && performance.now() - window.__t0 > 400, p.r0, { timeout: 30_000 });
    const pr = await page.evaluate((id) => {
      const c = window.__isle.pieces.children.find((x) => x.userData.key === `e:${id}`);
      return { s: [c.scale.x, c.scale.y, c.scale.z], landing: window.__isle.landings.length };
    }, p.id);
    assert.deepEqual(pr, { s: [1, 1, 1], landing: 0 }, "path: the loop grows it to exactly 1 and lets it go");
    console.log(`path ${p.id}: scale z ${p.z.toFixed(2)} when built → 1 after real frames, nothing left landing`);

    // A redraw with no new piece: everything stays at rest.
    const redraw = await page.evaluate(async () => {
      const isle = window.__isle;
      const st = structuredClone(isle.lastState);
      st.seq += 1;
      isle.setBoard(st, isle.lastHi, false);
      await new Promise((r) => requestAnimationFrame(r));
      return isle.pieces.children.filter((c) => c.userData.key).map((c) => ({
        key: c.userData.key,
        rest: c.position.y === c.userData.restY && c.scale.x === 1 && c.scale.y === 1 && c.scale.z === 1,
      }));
    });
    assert.ok(redraw.length >= 2 && redraw.every((r) => r.rest), `redraw: ${JSON.stringify(redraw.filter((r) => !r.rest))}`);
    console.log(`redraw with no new piece: all ${redraw.length} pieces at rest`);

    // Fresh boards: a first board (as on load) and a new island, each with a piece the last board lacked.
    const fresh = await page.evaluate((vid) => {
      const isle = window.__isle;
      const out = {};
      const extra = (st) => {
        const v = st.vertices.find((x) => !x.building && x.id !== vid && !st.vertices.some((y) => y.building && y.id === x.id));
        v.building = { kind: "outpost", playerId: st.players[1].id };
        return `v:${v.id}`;
      };
      const standing = () => isle.landings.length === 0 && isle.pieces.children.filter((c) => c.userData.key).every((c) => c.position.y === c.userData.restY && c.scale.x === 1 && c.scale.z === 1);
      let st = structuredClone(isle.lastState);
      let key = extra(st);
      st.seq += 1;
      isle.lastSeq = -1;
      isle.setBoard(st, isle.lastHi, false);
      out.first = { standing: standing(), drawn: isle.pieces.children.some((c) => c.userData.key === key) };
      st = structuredClone(isle.lastState);
      key = extra(st);
      st.hexes[0].pip = st.hexes[0].pip === 2 ? 12 : 2;
      st.seq += 1;
      isle.setBoard(st, isle.lastHi, false);
      out.island = { standing: standing(), drawn: isle.pieces.children.some((c) => c.userData.key === key) };
      return out;
    }, o.id);
    assert.deepEqual(fresh, { first: { standing: true, drawn: true }, island: { standing: true, drawn: true } }, "fresh boards draw standing");
    console.log("fresh boards (first board, new island): drawn standing, nothing landing");

    // Mid-fall carry-over: a new outpost, then a second push 100 ms (virtual) into its fall keeps the original start.
    const carry = await page.evaluate(() => {
      const isle = window.__isle;
      const st = structuredClone(isle.lastState);
      const v = st.vertices.find((x) => !x.building);
      v.building = { kind: "outpost", playerId: st.players[0].id };
      st.seq += 1;
      isle.setBoard(st, isle.lastHi, false);
      const key = `v:${v.id}`;
      const l0 = isle.landings.find((l) => l.obj.userData.key === key);
      if (!l0) return null;
      const start = l0.start;
      isle.stepLandings(start + 100, false);
      const st2 = structuredClone(isle.lastState);
      st2.seq += 1;
      isle.setBoard(st2, isle.lastHi, false);
      const l1 = isle.landings.find((l) => l.obj.userData.key === key);
      const r = { sameStart: l1?.start === start, newMesh: l1 && l1.obj !== l0.obj, offRest: l1 && l1.obj.position.y - l1.restY };
      isle.stepLandings(start + 400, false);
      r.settled = l1.obj.position.y === l1.restY && isle.landings.length === 0;
      return r;
    });
    assert.ok(carry && carry.sameStart && carry.newMesh && carry.offRest > 0 && carry.offRest < 0.2 && carry.settled, `mid-fall carry-over: ${JSON.stringify(carry)}`);
    console.log(`mid-fall rebuild: new mesh keeps the original start, ${carry.offRest.toFixed(3)} above rest (not 0.2), then settles`);

    // A stronghold over this seat's outpost, drawn straight through the renderer.
    const s = await page.evaluate(([sample, vid]) => {
      const isle = window.__isle;
      const st = structuredClone(isle.lastState);
      st.vertices.find((v) => v.id === vid).building.kind = "stronghold";
      st.seq += 1;
      isle.setBoard(st, isle.lastHi, false);
      return eval(sample)(`v:${vid}`);
    }, [SAMPLE, o.id]);
    assert.ok(s, "stronghold: not landing");
    assert.ok(s[0].s[0] > 1.03, `stronghold: first frame scale ${s[0].s[0].toFixed(3)}`);
    assert.deepEqual(s.at(-1).s, [1, 1, 1], "stronghold: settles exactly at 1");
    assert.equal(s.at(-1).y, s.at(-1).restY, "stronghold: at rest height");
    console.log(`stronghold ${o.id}: scale ${s[0].s[0].toFixed(3)} at 0 ms → 1 at ${s.find((x) => x.s[0] === 1)?.t} ms`);
    await ctx.close();
  }

  // --- Reduced motion: no fall, an immediate knock.
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", ""), t: performance.now() });
        return Promise.resolve();
      };
    });
    await toMySetup(page);
    const o = await placeOutpost(page);
    assert.equal(o.samples, null, "reduced motion: the outpost is landing");
    assert.ok(o.built && o.built.y === o.built.restY, `reduced motion: built off rest ${JSON.stringify(o.built)}`);
    assert.ok(o.knock < 100, `reduced motion: knock at ${o.knock} ms`);
    console.log(`reduced motion: outpost built at rest, nothing landing, knock at ${Math.round(o.knock)} ms`);
    await ctx.close();
  }

  assert.deepEqual(errors, [], "console errors");
  console.log("pieces-land-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
