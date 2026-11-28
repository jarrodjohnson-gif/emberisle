// #1923 (#642, design docs/design/payout-flight.md): payout goods fly from each paying hex to the local hand's symbol.
// Part 1 checks the pure planner, allocator and timing curve (src/lib/scene/payout-flight.ts) on rules-made and hand-made
// grants: one outpost, a stronghold's full and partial pay, shared tokens, a short bank, blocked and empty production, a
// missing legacy corner, invalid grants, opponents, overflow and the deadlines. Part 2 runs the real renderer in the real
// game at 1280x720, 390x844 (DPR 3, touch), 440x956 (DPR 3, touch), 844x390 (DPR 2, touch) and 956x440 (DPR 2, touch): a
// pushed live roll admits travel when its roll moment releases, every drawn object sits on its arc from the projected hex
// to its hand symbol, within 840 ms, and stills are written to docs/proofs/1923 with SHOTS=1. At 1280x720 and 390x844 it
// also runs the lifecycle rows (opponent, watcher, invalid and legacy grants, coalesced, repeated and jumped rolls, dice
// dismissed and absent, an active moment against the fallback, centre text, hidden page, resize, camera change, rebuild,
// hotseat handover, covered and clipped hands, back-to-back rolls, overflow, reduced motion live and at start, disposal),
// and the same roll with the effect on and off: game state, legal marks, pickables, sounds, gain-cue and roll-moment
// durations, focus and live regions unchanged. Zero console errors throughout.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8923;
const SHOTS = process.env.SHOTS === "1";
const OUT = "docs/proofs/1923";
const fails = [];
const errors = [];
const check = (name, ok, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${data === undefined ? "" : " " + JSON.stringify(data)}`);
  if (!ok) fails.push(name);
};

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  const { FLIGHT, planBatch, allocate, pose } = await vite.ssrLoadModule("/src/lib/scene/payout-flight.ts");
  const { createGame, worldOfHex } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  const { RESOURCES } = await vite.ssrLoadModule("/src/lib/game/types.ts");

  // A roll whose two dice both show `die`.
  const rollWith = (state, die) => {
    const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
    Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: (b) => b.fill(die - 1) });
    try {
      const next = applyAction(state, state.current, { type: "roll" });
      assert.equal(next.error, undefined);
      return next.state;
    } finally {
      if (descriptor) Object.defineProperty(crypto, "getRandomValues", descriptor);
      else delete crypto.getRandomValues;
    }
  };

  // The table: p0 (this seat) on roll, an outpost on one hex of the rolled number and a stronghold on another hex of the same
  // number; p1 has an outpost on the first hex too. A third hex of another number pays nobody.
  const fixture = () => {
    const base = createGame({ seed: 1923, humans: ["Ember", "Tide", "Dune", "Pine"].map((name) => ({ name })), bots: 0 });
    const land = new Set(base.hexes.map((h) => h.id));
    const inland = (v) => v.hexes.length === 3 && v.hexes.every((id) => land.has(id));
    let pick = null;
    for (const total of [6, 8, 4, 10]) {
      const hexes = base.hexes.filter((h) => h.pip === total);
      if (hexes.length < 2) continue;
      const [h1, h2] = hexes;
      const on = (h) => base.vertices.filter((v) => inland(v) && v.hexes.includes(h.id) && !v.hexes.includes(h1.id === h.id ? h2.id : h1.id));
      const a = on(h1), b = on(h2);
      if (a.length >= 2 && b.length) pick = { total, h1, h2, A: a[0], C: a[a.length - 1], B: b[0] };
      if (pick) break;
    }
    assert.ok(pick, "a number on two hexes with room for three pieces");
    const state = structuredClone(base);
    const at = (id) => state.vertices.find((v) => v.id === id);
    at(pick.A.id).building = { playerId: "p0", kind: "outpost" };
    at(pick.B.id).building = { playerId: "p0", kind: "stronghold" };
    at(pick.C.id).building = { playerId: "p1", kind: "outpost" };
    Object.assign(state, { phase: "roll", current: "p0", turn: 9, rolls: 4, rollSums: Array(11).fill(0), dice: [2, 3], lastProduction: [] });
    for (const p of state.players) p.resources = { timber: 1, clay: 1, wool: 1, grain: 1, ore: 1 };
    state.robberHex = state.hexes.find((h) => h.terrain === "waste")?.id ?? state.robberHex;
    state.seq += 1;
    const rolled = rollWith(state, pick.total / 2);
    return { state, rolled, ...pick };
  };
  const f = fixture();

  // ---- Part 1: planner, allocator and curve ----
  {
    const g = f.rolled.lastProduction;
    check("plan: the rules paid p0 from both hexes and p1 from the first", g.some((x) => x.player === "p0" && x.hex === f.h1.id && x.n === 1) && g.some((x) => x.player === "p0" && x.hex === f.h2.id && x.n === 2) && g.some((x) => x.player === "p1" && x.hex === f.h1.id), g);
    const plan = planBatch(f.rolled, "p0");
    check("plan: one record per (hex, good) of this seat, canonical order, actual quantities", JSON.stringify(plan.map((r) => [r.hex, r.res, r.n])) === JSON.stringify([[f.h1.id, f.h1.terrain, 1], [f.h2.id, f.h2.terrain, 2]]), plan);
    const slots = allocate(plan, () => true);
    check("plan: an outpost's one good is one object, a stronghold's two are two", slots.length === 3 && slots.filter((s) => s.group === 1).length === 2);
    const c1 = worldOfHex(f.h1);
    const r1 = plan[0];
    check("plan: the origin starts at the hex centre, 0.20 over the cap, pointed at the paying corner", Math.abs(r1.x - c1.x) < 1e-9 && Math.abs(r1.z - c1.z) < 1e-9 && Math.abs(r1.y - (0.04 + 0.3 + 0.2)) < 1e-9 && r1.aimed && Math.abs(Math.hypot(r1.dx, r1.dz) - 1) < 1e-9 && (f.A.x - c1.x) * r1.dx + (f.A.z - c1.z) * r1.dz > 0);
    const partial = structuredClone(f.rolled);
    partial.lastProduction = partial.lastProduction.map((x) => (x.hex === f.h2.id && x.player === "p0" ? { ...x, n: 1 } : x));
    const pp = planBatch(partial, "p0");
    check("plan: a stronghold's partial bank payment of one is one object, quantity 1", pp[1].n === 1 && allocate(pp, () => true).length === 2);
    check("plan: an opponent's grants give this seat nothing", planBatch(f.rolled, "p1").every((r) => r.hex === f.h1.id) && planBatch(f.rolled, "p3").length === 0);
    const short = structuredClone(f.rolled);
    short.lastProduction = [];
    check("plan: a short bank, a seven, a blocked hex or empty production (no grants) draws nothing", planBatch(short, "p0").length === 0);
    const legacy = structuredClone(f.rolled);
    delete legacy.lastProduction;
    check("plan: a legacy state with no lastProduction draws nothing", planBatch(legacy, "p0").length === 0);
    const mixed = structuredClone(f.rolled);
    mixed.lastProduction = [
      { hex: f.h1.id, player: "p0", res: "gold", n: 1 },
      { hex: f.h1.id, player: "p9", res: "ore", n: 1 },
      { hex: f.h1.id, player: "p0", res: "ore", n: 1.5 },
      { hex: f.h1.id, player: "p0", res: "ore", n: NaN },
      { hex: f.h1.id, player: "p0", res: "ore", n: 0 },
      { hex: f.h1.id, player: "p0", res: "ore", n: -1 },
      { hex: "nowhere", player: "p0", res: "ore", n: 1 },
      { hex: f.h2.id, player: "p0", res: "wool", n: 1 },
    ];
    const mp = planBatch(mixed, "p0");
    check("plan: invalid grants are skipped one by one; the valid one stays, aimed +x with no corner", mp.length === 1 && mp[0].hex === f.h2.id && mp[0].res === "wool" && !mp[0].aimed && mp[0].dx === 1 && mp[0].dz === 0, mp);
    const twice = structuredClone(f.rolled);
    twice.lastProduction = [{ hex: f.h2.id, player: "p0", res: "ore", n: 1 }, { hex: f.h2.id, player: "p0", res: "ore", n: 1, vertex: f.B.id }, { hex: f.h1.id, player: "p0", res: "ore", n: 1, vertex: f.A.id }];
    const tp = planBatch(twice, "p0");
    check("plan: grants sharing (hex, seat, good) sum; distinct hexes stay apart; the first valid corner aims", tp.length === 2 && tp[0].n === 2 && tp[0].aimed && tp[1].hex === f.h1.id, tp.map((r) => [r.hex, r.n, r.aimed]));
    const blocked = structuredClone(f.rolled);
    blocked.robberHex = f.h1.id;
    check("plan: blocking is never reapplied to recorded grants", planBatch(blocked, "p0").length === 2);
    const many = structuredClone(f.rolled);
    many.lastProduction = many.hexes.flatMap((h) => RESOURCES.map((res) => ({ hex: h.id, player: "p0", res, n: 2 }))).slice(0, 40);
    const mplan = planBatch(many, "p0");
    const mslots = allocate(mplan, () => true);
    check("plan: overflow keeps the first 24 records in canonical order", mplan.length === FLIGHT.records && mplan.every((r, i) => r.hex === many.lastProduction[i].hex && r.res === many.lastProduction[i].res));
    check("plan: at most 24 objects, every group's first before any second", mslots.length === FLIGHT.meshes && mslots.every((s) => s.delay < FLIGHT.groupCap + FLIGHT.pairGap) && mslots.slice(0, 24).every((s, i) => s.group === i));
    check("plan: the same grants always give the same objects", JSON.stringify(allocate(planBatch(many, "p0"), () => true)) === JSON.stringify(mslots));
    const somes = allocate(plan, (r) => r !== plan[0].res || plan[0].res === plan[1].res);
    check("plan: a good with no eligible card gets no object, and the rest still stagger from 0", plan[0].res === plan[1].res || (somes.length === 2 && somes[0].delay === 0 && somes[1].delay === 40));
    const delays = mslots.map((s) => s.delay);
    const pairs = allocate([2, 2, 1, 2].map((n) => ({ res: "ore", n })), () => true).map((s) => [s.group, s.delay]);
    check("plan: groups stagger 40 ms capped at 200, a second object 40 ms after its first", Math.max(...delays) === 200 && delays[5] === 200 && delays[23] === 200 && JSON.stringify(pairs) === "[[0,0],[1,40],[2,80],[3,120],[0,40],[1,80],[3,160]]", { delays: delays.slice(0, 8), pairs });
    const seq = [0, 30, 60, 90, 119, 120, 300, 479, 480, 540, 599.9, 600].map((e) => pose(e));
    check("curve: 14 px at the start, never over 18 in the pop, 14 in flight, 6 at the end, gone at 600 ms", seq[0].size === 14 && seq.slice(0, 5).every((p) => p.size <= 18 && p.size >= 14) && seq[6].size === 14 && Math.abs(seq[10].size - 6) < 0.01 && seq[11] === null && pose(-1) === null, seq.map((p) => p && +p.size.toFixed(2)));
    check("curve: a 10 px pop over 120 ms, then 480 ms along the arc, ending on the target", Math.abs(seq[4].lift - 10) < 0.01 && seq[4].k === 0 && seq[5].k === 0 && Math.abs(seq[10].k - 1) < 1e-6 && seq[8].k > 0.9 && seq[7].k < seq[8].k);
    check("curve: the last object (240 ms stagger + 600 ms) lands by the 840 ms finish", 240 + FLIGHT.pop + FLIGHT.travel <= FLIGHT.finish && FLIGHT.release === 1120 && FLIGHT.expire === 1500);
  }

  // ---- Part 2: the real renderer ----
  const cases = [
    { width: 1280, height: 720, dpr: 1, mobile: false, full: true },
    { width: 390, height: 844, dpr: 3, mobile: true, full: true },
    { width: 440, height: 956, dpr: 3, mobile: true },
    { width: 844, height: 390, dpr: 2, mobile: true },
    { width: 956, height: 440, dpr: 2, mobile: true },
  ];
  if (SHOTS) mkdirSync(OUT, { recursive: true });

  const open = async (test, reduce = false) => {
    const tag = `${test.width}x${test.height}${reduce ? " reduced" : ""}`;
    const ctx = await browser.newContext({ viewport: { width: test.width, height: test.height }, deviceScaleFactor: test.dpr, isMobile: test.mobile, hasTouch: test.mobile, reducedMotion: reduce ? "reduce" : "no-preference" });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-water", "simple");
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        window.__plays.push(new URL(this.src).pathname);
        return Promise.resolve();
      };
    });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__isle?.renders > 0 && window.__emberisle, null, { timeout: STEP_MS });
    await page.evaluate((s) => window.__emberisle.getState().loadState(s, "p0", false, "TEST"), f.state);
    await page.waitForFunction(() => window.__isle.flights && document.querySelector('[data-testid="hand-dock"] .goods-icon'), null, { timeout: STEP_MS });
    await page.waitForFunction(() => {
      const i = window.__isle;
      return i.landReady && !i.refitDue && !i.glide && i.landings.length === 0 && !i.dust.active && !i.jelly?.busy();
    }, null, { timeout: STEP_MS });
    // In-page helpers: push a state, record every flight frame (time, objects, their sources and targets), wait for an end.
    await page.evaluate(async () => {
      const g = window.__emberisle, i = window.__isle, fl = i.flights;
      window.__dice = await import("/src/components/game/Dice.tsx");
      const rec = (window.__rec = { frames: [], captured: [] });
      const render = fl.render.bind(fl);
      fl.render = (gl) => {
        const now = performance.now();
        render(gl, now);
        const b = fl.batch;
        if (!b?.slots) return;
        rec.frames.push({
          t: now, t0: b.t0, at: b.at,
          objs: b.slots.map((s) => ({ res: s.res, group: s.group, delay: s.delay, vis: s.mesh.visible, dead: !!s.dead, x: s.mesh.position.x, y: -s.mesh.position.y, size: s.mesh.scale.x })),
          from: b.records.map((r) => fl.project(fl.cam(), r.x, r.y, r.z)),
          world: b.records.map((r) => [r.x, r.z, window.__isle.pxPerUnit(r.x, r.y, r.z)]),
          to: Object.fromEntries(b.slots.map((s) => [s.res, fl.target(s.res)])),
          icons: Object.fromEntries([...document.querySelectorAll('[data-testid="hand-dock"] .goods-icon')].map((el) => {
            const r = el.getBoundingClientRect(), c = document.querySelector("canvas").getBoundingClientRect();
            return [el.closest('[data-testid^="resource-"]').dataset.testid.slice(9), { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top }];
          })),
          centre: [...document.querySelectorAll('[data-testid="roll-moment"], [data-testid="turn-moment"]')].length,
        });
      };
      const capture = fl.capture.bind(fl);
      fl.capture = (s, seat) => { capture(s, seat); rec.captured.push({ seat, at: fl.batch?.at, t: performance.now(), records: fl.batch?.records.map((r) => ({ ...r })) ?? [] }); };
      window.__push = (st) => g.setState({ state: st });
      window.__next = (k = 1, grants, extra = {}) => {
        const st = structuredClone(g.getState().state);
        st.rolls = (st.rolls ?? 0) + k;
        st.seq += 1;
        st.dice = [3, 3];
        st.phase = "main";
        if (grants) st.lastProduction = grants;
        Object.assign(st, extra);
        g.setState({ state: st });
        return st;
      };
      // A bounded wait in the page: true once `ok()` holds, false after `ms`.
      window.__until = (ok, ms = 6000) => new Promise((done) => { const end = performance.now() + ms; const t = setInterval(() => { const v = ok(); if (v || performance.now() > end) { clearInterval(t); done(!!v); } }, 5); });
      // Ends the roll moment with a key as soon as it shows, as a player may.
      window.__skip = async () => {
        await window.__until(() => document.querySelector('[data-testid="roll-moment"]'), 4000);
        window.__skipped = performance.now();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      };
      window.__ended = (n) => new Promise((ok) => { const t = setInterval(() => { if (fl.log.length >= n && !fl.batch) { clearInterval(t); ok(fl.log.slice(n - 1)); } }, 10); setTimeout(() => { clearInterval(t); ok(["timeout", ...fl.log]); }, 8000); });
      // The moment's own lifetime, from mount to unmount.
      window.__moments = [];
      let up = null;
      new MutationObserver(() => {
        const m = document.querySelector('[data-testid="roll-moment"]');
        if (m && !up) up = { on: performance.now() };
        if (!m && up) { up.off = performance.now(); window.__moments.push(up); up = null; }
      }).observe(document.body, { subtree: true, childList: true });
    });
    return { page, ctx, tag };
  };

  // Every drawn object is where the curve says, between its projected source and its hand symbol.
  const onArc = (frames) => {
    let drawn = 0, worst = 0, late = 0, early = 0;
    const res = new Set();
    for (const fr of frames) {
      for (const o of fr.objs) {
        if (!o.vis) continue;
        drawn++;
        if (fr.t < fr.t0) early++;
        if (fr.t > fr.t0 + FLIGHT.finish) late++;
        res.add(o.res);
        const p = pose(fr.t - fr.t0 - o.delay), a = fr.from[o.group], b = fr.to[o.res];
        const ax = a.x, ay = a.y - p.lift, len = Math.hypot(b.x - ax, b.y - ay);
        const mx = (ax + b.x) / 2, my = (ay + b.y) / 2 - 2 * Math.min(FLIGHT.arc, len / 4), k = p.k, j = 1 - k;
        const x = j * j * ax + 2 * j * k * mx + k * k * b.x, y = j * j * ay + 2 * j * k * my + k * k * b.y;
        worst = Math.max(worst, Math.hypot(o.x - x, o.y - y), Math.abs(o.size - p.size));
      }
    }
    return { frames: frames.length, drawn, worst: +worst.toFixed(4), early, late, res: [...res] };
  };

  const symbols = (page) => page.evaluate(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    return Object.fromEntries([...document.querySelectorAll('[data-testid="hand-dock"] .goods-icon')].map((el) => {
      const r = el.getBoundingClientRect();
      return [el.closest('[data-testid^="resource-"]').dataset.testid.slice(9), { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top }];
    }));
  });

  // Freeze the page's clock `ms` after admission and draw one frame with the goods, then the same frame without them (the
  // overlay hidden), and screenshot each. The draw is called directly, so neither shot waits on the loop's frame pacing.
  const stills = async (page, tag, list) => {
    for (const ms of list) {
      const shown = await page.evaluate((ms) => {
        const i = window.__isle, fl = i.flights;
        window.__realNow ??= performance.now.bind(performance);
        const at = fl.batch.t0 + ms;
        performance.now = () => at;
        i.draw();
        return fl.scene.children.filter((m) => m.visible).length;
      }, ms);
      await page.screenshot({ path: join(OUT, `${tag}-after-${ms}ms.png`) });
      await page.evaluate(() => { const i = window.__isle; i.flights.scene.visible = false; i.draw(); });
      await page.screenshot({ path: join(OUT, `${tag}-before-${ms}ms.png`) });
      await page.evaluate(() => { window.__isle.flights.scene.visible = true; });
      console.log(`still ${tag} ${ms} ms: ${shown} goods drawn`);
    }
    await page.evaluate(() => { performance.now = window.__realNow; delete window.__realNow; window.__isle.wake(); });
  };

  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const test of cases) {
    const { page, ctx, tag } = await open(test);
    try {
      const ids = await symbols(page);
      // The live roll the rules made. Admission waits for the roll moment; at software GL's frame rate the moment can still
      // be up past the 1120 ms fallback and release too near (or after) the 1500 ms expiry, and the batch then expires unflown.
      const before = await page.evaluate(() => window.__isle.flights.log.length);
      const flash = await page.evaluate((st) => { window.__push(st); return window.__isle.flashes.length; }, f.rolled);
      let ends = await page.evaluate((n) => window.__ended(n), before + 1);
      let run = await page.evaluate(() => ({ rec: window.__rec, moments: window.__moments, admitted: window.__isle.flights.admitted }));
      const cap = run.rec.captured.at(-1), m = run.moments.at(-1);
      const first = run.rec.frames.filter((fr) => fr.at === cap.at);
      check(`${tag}: one batch captured for the local seat from the roll's grants, and the hex flash ran`, run.rec.captured.length === 1 && cap.seat === "p0" && cap.records.length === 2 && flash > 0, cap?.records.map((r) => [r.hex, r.res, r.n]));
      const t0 = first[0]?.t0;
      const timing = { ends, admitted: run.admitted, admitAfterCapture: t0 && Math.round(t0 - cap.at), momentOffAfterCapture: m?.off && Math.round(m.off - cap.at) };
      check(`${tag}: travel admitted when the roll moment released (or, held past 1500 ms, expired unflown)`, ends[0] === "done" ? run.admitted === 3 && t0 >= m.off - 1 && t0 - cap.at >= 900 && t0 - cap.at < FLIGHT.expire : ends[0] === "expired" && run.admitted === 0 && m.off - cap.at >= FLIGHT.release, timing);
      // A second roll, its moment dismissed by a key as soon as it shows: travel starts at that release.
      ends = await page.evaluate(async ({ st, n }) => {
        const x = structuredClone(st);
        x.rolls += 1;
        x.seq += 1;
        window.__push(x);
        await window.__skip();
        return window.__ended(n);
      }, { st: f.rolled, n: before + 2 });
      run = await page.evaluate(() => ({ rec: window.__rec, admitted: window.__isle.flights.admitted, skipped: window.__skipped }));
      const frames = run.rec.frames.filter((fr) => fr.at === run.rec.captured.at(-1).at);
      const arc = onArc(frames);
      check(`${tag}: three objects (one outpost good, a stronghold's two) admitted at the release and ended on time`, ends[0] === "done" && run.admitted - (timing.admitted ?? 0) === 3 && frames[0]?.t0 >= run.skipped, { ends, admitted: run.admitted, admitAfterSkip: frames[0] && Math.round(frames[0].t0 - run.skipped) });
      check(`${tag}: every drawn object sits on its arc at its size, within the 840 ms finish`, arc.drawn > 0 && arc.worst < 0.01 && arc.early === 0 && arc.late === 0, arc);
      // The end is the symbol where it is in that frame: the card lifts with its gain cue, and the tray may move.
      const ended = frames.filter((fr) => Object.keys(fr.to).length);
      const miss = Math.max(...ended.flatMap((fr) => Object.entries(fr.to).map(([r, p]) => (p ? Math.hypot(p.x - fr.icons[r].x, p.y - fr.icons[r].y) : Infinity))));
      const moved = Math.max(...ended.flatMap((fr) => Object.keys(fr.to).map((r) => Math.hypot(fr.icons[r].x - ids[r].x, fr.icons[r].y - ids[r].y))));
      check(`${tag}: each arc ends on its resource symbol's centre in the hand, read every frame`, ended.length > 0 && miss < 0.5, { miss, movedFromRest: +moved.toFixed(1), to: ended[0]?.to });
      const src = frames[0]?.from ?? [];
      check(`${tag}: each source is on screen at its own paying hex, apart`, src.length === 2 && src.every(Boolean) && Math.hypot(src[0].x - src[1].x, src[0].y - src[1].y) > 20, src);
      const w = frames[0]?.world ?? [];
      const hexAt = [f.h1, f.h2].map(worldOfHex);
      const out = w.map(([x, z, ppu], k) => [Math.hypot(x - hexAt[k].x, z - hexAt[k].z), ppu]);
      check(`${tag}: each origin sits at least 0.58 out from its hex centre, clear of the token's 0.39 disc`, out.length === 2 && out.every(([d, ppu]) => d >= FLIGHT.out - 1e-9 && d - FLIGHT.popSize / 2 / ppu >= FLIGHT.token), out.map(([d, ppu]) => [+d.toFixed(3), +ppu.toFixed(1)]));
      if (SHOTS) {
        // A fresh roll for the stills, after the first batch ended.
        await page.evaluate(async (st) => { const x = structuredClone(st); x.rolls += 2; x.seq += 2; window.__push(x); await window.__skip(); }, f.rolled);
        await page.waitForFunction(() => window.__isle.flights.batch?.t0 !== undefined, null, { timeout: STEP_MS });
        await stills(page, `${test.width}x${test.height}`, [60, 330, 420]);
        await page.waitForFunction(() => !window.__isle.flights.batch, null, { timeout: STEP_MS });
        // All five goods, each from the hex of its own terrain lowest on screen, so their paths cross the sea to the hand.
        const five = await page.evaluate(() => {
          const i = window.__isle, s = window.__emberisle.getState().state;
          const lastProduction = ["timber", "clay", "wool", "grain", "ore"].map((res) => {
            const [low] = s.hexes.filter((h) => h.terrain === res).sort((a, b) => i.screenOf(b.id).y - i.screenOf(a.id).y);
            return { hex: low.id, player: "p0", res, n: 1 };
          });
          i.flights.capture({ ...s, lastProduction }, "p0");
          return lastProduction;
        });
        await page.waitForFunction(() => window.__isle.flights.batch?.t0 !== undefined || !window.__isle.flights.batch, null, { timeout: STEP_MS });
        const slots = await page.evaluate(() => window.__isle.flights.batch?.slots.map((x) => x.res) ?? []);
        check(`${tag}: all five goods admitted for the stills`, slots.length === 5, { five, slots });
        if (slots.length) await stills(page, `${test.width}x${test.height}-five`, [60, 200, 330, 420, 500]);
      }
      if (test.full) await lifecycle(page, tag);
    } finally {
      await ctx.close();
    }
  }

  // The lifecycle rows, at 1280x720 and 390x844.
  async function lifecycle(page, tag) {
    const idle = () => page.waitForFunction(() => !window.__isle.flights.batch && !document.querySelector('[data-testid="roll-moment"]'), null, { timeout: STEP_MS });
    const p0 = (hex, res, n = 1, vertex) => ({ hex, player: "p0", res, n, ...(vertex ? { vertex } : {}) });
    const h1 = f.h1.id, h2 = f.h2.id;
    await idle();
    let r = await page.evaluate(async ({ h1 }) => {
      const fl = window.__isle.flights, rec = window.__rec, n = rec.captured.length;
      window.__next(1, [{ hex: h1, player: "p1", res: "ore", n: 2 }]);
      return { captured: rec.captured.length - n, records: rec.captured.at(-1).records.length, batch: fl.batch, payers: window.__isle.payingPieces.length };
    }, { h1 });
    check(`${tag}: an opponent's production: no batch, no hand destination; the public pulse stays`, r.captured === 1 && r.records === 0 && r.batch === null, r);
    await idle();

    r = await page.evaluate(async ({ h1, h2, A }) => {
      const fl = window.__isle.flights;
      window.__next(1, [{ hex: h1, player: "p0", res: "gold", n: 1 }, { hex: h2, player: "p0", res: "ore", n: 1.5 }, { hex: h2, player: "p0", res: "ore", n: 1 }]);
      const legacy = window.__isle.payingPieces.length;
      return { records: fl.batch?.records.map((x) => [x.hex, x.res, x.aimed]), legacy };
    }, { h1, h2, A: f.A.id });
    check(`${tag}: invalid grants omitted, a legacy grant with no corner still flies, with no invented payer pulse`, JSON.stringify(r.records) === JSON.stringify([[h2, "ore", false]]) && r.legacy === 0, r);
    let ends = await page.evaluate(async () => { const n = window.__isle.flights.log.length + 1; await window.__skip(); return window.__ended(n); });
    check(`${tag}: the legacy grant's object landed`, ends[0] === "done", ends);
    await idle();

    // Coalesced: the roll arrives with a build and a different hand in one push. Then the same snapshot again, then a jump.
    r = await page.evaluate(async ({ h2 }) => {
      const fl = window.__isle.flights, rec = window.__rec, n = rec.captured.length;
      const st = structuredClone(window.__emberisle.getState().state);
      st.players[0].resources = { timber: 0, clay: 0, wool: 5, grain: 0, ore: 9 };
      st.seq += 3;
      window.__next(1, [{ hex: h2, player: "p0", res: "wool", n: 1 }], { players: st.players, seq: st.seq });
      const one = rec.captured.length - n;
      const records = fl.batch?.records.map((x) => [x.res, x.n]);
      const again = structuredClone(window.__emberisle.getState().state);
      window.__push(again);
      const repeat = rec.captured.length - n;
      return { one, records, repeat };
    }, { h2 });
    check(`${tag}: a coalesced roll plus build makes one batch from the grants alone, not the changed hand`, r.one === 1 && JSON.stringify(r.records) === '[["wool",1]]', r);
    check(`${tag}: a repeated snapshot makes no second batch`, r.repeat === 1, r);
    r = await page.evaluate(async ({ h2 }) => {
      const fl = window.__isle.flights, rec = window.__rec, n = rec.captured.length;
      window.__next(2, [{ hex: h2, player: "p0", res: "wool", n: 1 }]);
      return { captured: rec.captured.length - n, batch: fl.batch, why: fl.log.at(-1) };
    }, { h2 });
    check(`${tag}: a jump of two rolls draws no batch and ends the one before`, r.captured === 0 && r.batch === null && r.why === "baseline", r);
    await idle();

    // Dice dismissed early: a key ends the moment, and the batch goes with the gains.
    r = await page.evaluate(async ({ h2 }) => {
      const fl = window.__isle.flights;
      window.__next(1, [{ hex: h2, player: "p0", res: "wool", n: 1 }]);
      const at = fl.batch.at;
      await new Promise((ok) => setTimeout(ok, 250));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      const pressed = performance.now();
      await window.__until(() => fl.batch?.t0 !== undefined || !fl.batch);
      return { admitAfterCapture: fl.batch && fl.batch.t0 - at, admitAfterPress: fl.batch && fl.batch.t0 - pressed };
    }, { h2 });
    check(`${tag}: dismissing the dice releases the batch at once`, r.admitAfterCapture !== null && r.admitAfterCapture < 900 && r.admitAfterPress < 120, r);
    await idle();

    // Absent moment: the 1120 ms fallback. An active moment: the fallback waits, and the batch expires at 1500 ms.
    r = await page.evaluate(async () => {
      const fl = window.__isle.flights, st = window.__emberisle.getState().state;
      const wait = (ok) => window.__until(ok);
      fl.capture({ ...st, lastProduction: [{ hex: st.lastProduction[0]?.hex ?? st.hexes[0].id, player: "p0", res: "wool", n: 1 }] }, "p0");
      const at = fl.batch.at;
      await wait(() => fl.batch?.t0 !== undefined);
      const absent = fl.batch.t0 - at;
      await wait(() => !fl.batch);
      window.__dice.useMomentUp.setState({ up: true });
      fl.capture({ ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 1 }] }, "p0");
      const at2 = fl.batch.at;
      await new Promise((ok) => setTimeout(ok, 1250));
      const held = fl.batch?.t0 === undefined && !!fl.batch;
      window.__dice.useMomentUp.setState({ up: false });
      await wait(() => fl.batch?.t0 !== undefined || !fl.batch);
      const released = fl.batch && fl.batch.t0 - at2;
      await wait(() => !fl.batch);
      window.__dice.useMomentUp.setState({ up: true });
      fl.capture({ ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 1 }] }, "p0");
      const at3 = performance.now();
      await wait(() => !fl.batch);
      const expired = [fl.log.at(-1), performance.now() - at3];
      window.__dice.useMomentUp.setState({ up: false });
      return { absent, held, released, expired };
    });
    check(`${tag}: with no roll moment, travel starts on the 1120 ms fallback`, r.absent >= 1120 && r.absent < 1300, r);
    check(`${tag}: an active moment holds the batch past the fallback; its release admits it`, r.held && r.released >= 1250 && r.released < 1500, r);
    check(`${tag}: a batch whose release never comes expires, no earlier than 1500 ms after capture`, r.expired[0] === "expired" && r.expired[1] >= 1490, r);
    // The same three edges on a virtual clock: exact, whatever the frame rate.
    r = await page.evaluate(async () => {
      const { PayoutFlights } = await import("/src/lib/scene/payout-flight.ts");
      const i = window.__isle, st = window.__emberisle.getState().state, fl = new PayoutFlights(i.renderer.domElement, () => i.cam());
      const grants = { ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 2 }] };
      const out = {};
      fl.capture(grants, "p0");
      let at = fl.batch.at;
      out.absent = [fl.poll(at + 1119, false), fl.batch.t0, fl.poll(at + 1120, false), fl.batch?.t0 - at];
      if (!fl.batch) return { ...out, log: fl.log, wool: fl.target("wool"), hit: document.elementFromPoint(...(() => { const r = document.querySelector('[data-testid="hand-dock"] [data-testid="resource-wool"] .goods-icon').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })())?.outerHTML.slice(0, 200) };
      out.flying = [fl.poll(at + 1120 + 839, false), fl.poll(at + 1120 + 840, false), fl.log.at(-1)];
      window.__dice.useMomentUp.setState({ up: true });
      fl.capture(grants, "p0");
      at = fl.batch.at;
      out.held = [fl.poll(at + 1300, false), fl.batch.t0 ?? null, fl.poll(at + 1499, false), fl.batch.t0 ?? null, fl.poll(at + 1500, false), fl.batch, fl.log.at(-1)];
      fl.capture(grants, "p0");
      at = fl.batch.at;
      fl.poll(at + 200, false);
      window.__dice.useMomentUp.setState({ up: false });
      out.released = [fl.poll(at + 260, false), fl.batch.t0 - at];
      out.slow = [fl.poll(at + 260 + 5000, false), fl.log.at(-1)];
      fl.dispose();
      return out;
    });
    check(`${tag}: virtual clock: no moment admits at exactly 1120 ms and ends at exactly 840 ms after admission`, JSON.stringify(r.absent) === "[false,null,true,1120]" && JSON.stringify(r.flying) === '[true,false,"done"]', r);
    check(`${tag}: virtual clock: an active moment blocks the fallback until it expires at exactly 1500 ms`, JSON.stringify(r.held) === '[false,null,false,null,false,null,"expired"]', r);
    check(`${tag}: virtual clock: a release admits on the next frame; a frame 5 s late ends the batch, never extends it`, JSON.stringify(r.released) === "[true,260]" && JSON.stringify(r.slow) === '[false,"done"]', r);

    // Centre text: an object under the roll moment's box (+8 px) is not drawn; its clock runs on.
    r = await page.evaluate(async () => {
      const fl = window.__isle.flights, rec = window.__rec, st = window.__emberisle.getState().state;
      const box = document.createElement("div");
      box.dataset.testid = "turn-moment";
      Object.assign(box.style, { position: "fixed", inset: "0", pointerEvents: "none" });
      document.body.append(box);
      const n = rec.frames.length;
      fl.capture({ ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 1 }] }, "p0");
      await window.__until(() => !fl.batch);
      box.remove();
      const frames = rec.frames.slice(n);
      return { frames: frames.length, drawn: frames.filter((f) => f.objs.some((o) => o.vis)).length, end: fl.log.at(-1), clocks: new Set(frames.map((f) => f.t0)).size };
    });
    check(`${tag}: goods under centre text are suppressed every frame, and the deadline is unchanged`, r.frames > 0 && r.drawn === 0 && r.end === "done" && r.clocks === 1, r);

    // Lifecycle cancels: hidden page, resize, reduced motion turned on, hotseat handover; and a camera change and a rebuild
    // that do not cancel.
    const flight = async (fn, arg) => page.evaluate(async ({ fn, arg }) => {
      const fl = window.__isle.flights, st = window.__emberisle.getState().state;
      fl.capture({ ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 2 }, { hex: st.hexes[1].id, player: "p0", res: "ore", n: 1 }] }, "p0");
      await window.__until(() => fl.batch?.t0 !== undefined || !fl.batch);
      if (!fl.batch) return { admitted: false, why: fl.log.at(-1) };
      const t0 = fl.batch.t0;
      await new Promise((ok) => setTimeout(ok, 100));
      await new Function("arg", `return (async () => { ${fn} })()`)(arg);
      const after = { batch: !!fl.batch, t0: fl.batch?.t0, why: fl.log.at(-1) };
      await window.__until(() => !fl.batch);
      const visible = fl.scene.children.filter((m) => m.visible).length;
      const last = Math.max(...window.__rec.frames.filter((f) => f.t0 === t0 && f.objs.some((o) => o.vis)).map((f) => f.t));
      return { ...after, sameT0: after.t0 === t0, end: fl.log.at(-1), visible, lastFrame: last - t0 };
    }, { fn, arg });

    r = await flight(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); delete document.hidden;`);
    check(`${tag}: a hidden page cancels at once and leaves nothing drawn`, !r.batch && r.why === "hidden" && r.visible === 0, r);
    r = await flight(`window.__isle.setPlayView(window.__isle.view === "overhead" ? "diorama" : "overhead"); await new Promise((ok) => setTimeout(ok, 50));`);
    check(`${tag}: a view change reprojects without restarting the clock`, r.batch && r.sameT0 && r.end === "done" && r.lastFrame <= FLIGHT.finish, r);
    await page.evaluate(() => window.__isle.setPlayView(null));
    r = await flight(`const s = structuredClone(window.__emberisle.getState().state); s.seq += 1; window.__push(s);`);
    check(`${tag}: a rebuild halfway keeps the batch, its identity and its deadline`, r.batch && r.sameT0 && r.end === "done" && r.lastFrame <= FLIGHT.finish, r);
    // A real viewport change while the goods fly: the page signals once they are flying, then waits for the proof's go.
    const size = page.viewportSize();
    const resized = flight(`window.__mid = true; await window.__until(() => window.__go, 6000); await new Promise((ok) => setTimeout(ok, 100));`);
    await page.waitForFunction(() => window.__mid, null, { timeout: STEP_MS });
    await page.setViewportSize({ width: size.width - 40, height: size.height });
    await page.evaluate(() => { window.__go = true; });
    r = await resized;
    await page.evaluate(() => { window.__mid = window.__go = false; });
    check(`${tag}: a resize cancels the whole batch`, !r.batch && r.why === "resize" && r.visible === 0, r);
    await page.setViewportSize(size);
    await page.waitForFunction((w) => document.querySelector("canvas").clientWidth === w, size.width, { timeout: STEP_MS });
    await page.waitForTimeout(800);
    // Reduced motion switched on mid-flight: the renderer's own preference query reports it on the next frame.
    r = await flight(`const mq = window.__isle.calmMq; window.__isle.calmMq = { matches: true, addEventListener() {}, removeEventListener() {} }; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); window.__calmed = { batch: !!window.__isle.flights.batch, why: window.__isle.flights.log.at(-1) }; window.__isle.calmMq = mq;`);
    const calmed = await page.evaluate(() => window.__calmed);
    check(`${tag}: reduced motion turned on mid-flight cancels on the next frame`, r.t0 === undefined && !calmed.batch && calmed.why === "reduced motion" && r.visible === 0, { r, calmed });
    r = await page.evaluate(() => ({ batch: window.__isle.flights.batch, admitted: window.__isle.flights.admitted }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__isle.flights.admitted);
    check(`${tag}: turning reduced motion off replays nothing`, r.batch === null && after === r.admitted, { r, after });

    // Covered and clipped hands: no destination, no objects.
    r = await page.evaluate(async () => {
      const fl = window.__isle.flights, st = window.__emberisle.getState().state;
      const icon = document.querySelector('[data-testid="hand-dock"] [data-testid="resource-wool"] .goods-icon').getBoundingClientRect();
      const cover = document.createElement("div");
      Object.assign(cover.style, { position: "fixed", left: `${icon.left - 4}px`, top: `${icon.top - 4}px`, width: `${icon.width + 8}px`, height: `${icon.height + 8}px`, zIndex: 999, background: "white" });
      document.body.append(cover);
      const covered = fl.target("wool");
      const ore = fl.target("ore");
      const a = fl.admitted;
      fl.capture({ ...st, lastProduction: [{ hex: st.hexes[0].id, player: "p0", res: "wool", n: 2 }, { hex: st.hexes[1].id, player: "p0", res: "ore", n: 1 }] }, "p0");
      await window.__until(() => fl.batch?.t0 !== undefined || !fl.batch);
      const slots = fl.batch?.slots.map((s) => s.res);
      await window.__until(() => !fl.batch);
      cover.remove();
      const dock = document.querySelector('[data-testid="hand-dock"]');
      const wrap = dock.parentElement;
      const was = wrap.getAttribute("style");
      wrap.style.overflow = "hidden";
      wrap.style.maxHeight = "4px";
      const clipped = fl.target("wool");
      wrap.setAttribute("style", was ?? "");
      return { covered, ore: !!ore, slots, added: fl.admitted - a, clipped, back: !!fl.target("wool") };
    });
    check(`${tag}: a covered symbol takes no good; the visible one still does`, r.covered === null && r.ore && JSON.stringify(r.slots) === '["ore"]' && r.added === 1, r);
    check(`${tag}: a symbol clipped by a scrolling box takes no good`, r.clipped === null && r.back, r);

    // Back-to-back rolls: the newer replaces the older; overflow: 24 meshes at most.
    r = await page.evaluate(async ({ h1, h2 }) => {
      const fl = window.__isle.flights;
      window.__next(1, [{ hex: h1, player: "p0", res: "ore", n: 1 }]);
      await new Promise((ok) => setTimeout(ok, 100));
      const st = window.__next(1, window.__emberisle.getState().state.hexes.flatMap((h) => ["timber", "clay", "wool", "grain", "ore"].map((res) => ({ hex: h.id, player: "p0", res, n: 2 }))));
      const replaced = fl.log.at(-1);
      const records = fl.batch.records.length;
      await window.__skip();
      await window.__until(() => fl.batch?.t0 !== undefined || !fl.batch);
      const slots = fl.batch?.slots.length;
      const meshes = fl.scene.children.length;
      await window.__until(() => !fl.batch);
      return { replaced, records, slots, meshes, end: fl.log.at(-1), rolls: st.rolls };
    }, { h1, h2 });
    check(`${tag}: a newer roll replaces the waiting batch; one batch, 24 records and 24 meshes at most, no backlog`, r.replaced === "replaced" && r.records === 24 && r.slots === 24 && r.meshes === 24 && r.end === "done", r);
    await idle();

    // The same roll with the effect on and off: state, marks, pickables, sounds, gain-cue and moment lifetimes, focus, live regions.
    const once = async (on) => page.evaluate(async ({ on, rolled, base }) => {
      const fl = window.__isle.flights, i = window.__isle, g = window.__emberisle;
      const capture = fl.capture;
      if (!on) fl.capture = () => {};
      // Back to the table before the roll (a jump of rolls: a silent baseline), and let its cues finish.
      const cur = g.getState().state;
      window.__push({ ...structuredClone(base), rolls: cur.rolls + 2, seq: cur.seq + 1 });
      await new Promise((ok) => setTimeout(ok, 3600));
      const st = structuredClone(rolled);
      st.rolls = cur.rolls + 3;
      st.seq = cur.seq + 2;
      window.__plays = [];
      const flashes = [];
      const seen = new Map();
      const mo = new MutationObserver(() => {
        const now = performance.now();
        const els = new Set(document.querySelectorAll('[data-testid="resource-flash"]'));
        for (const el of els) if (!seen.has(el)) seen.set(el, now);
        for (const [el, t] of seen) if (!els.has(el)) { flashes.push(now - t); seen.delete(el); }
      });
      mo.observe(document.body, { subtree: true, childList: true });
      const lives = document.querySelectorAll("[aria-live]").length, focus = document.activeElement;
      const n = window.__moments.length, a = fl.admitted;
      // Every timer the page starts for this roll (the moment's hold, the gain cues' 3 s, the store's), and each cue's CSS run.
      const timer = window.setTimeout, delays = [], runs = [];
      const wait = new Promise((ok) => timer(ok, 3800));
      window.setTimeout = function (fn, ms, ...rest) { delays.push(ms ?? 0); return timer.call(this, fn, ms, ...rest); };
      const cues = new MutationObserver(() => document.querySelectorAll('[data-testid="resource-flash"]').forEach((el) => { if (!el.dataset.seenRun) { el.dataset.seenRun = "1"; runs.push(...el.getAnimations().map((x) => x.effect.getTiming().duration)); } }));
      cues.observe(document.body, { subtree: true, childList: true });
      window.__push(st);
      await window.__skip();
      await wait;
      window.setTimeout = timer;
      cues.disconnect();
      mo.disconnect();
      fl.capture = capture;
      return {
        state: JSON.stringify({ ...g.getState().state, rolls: 0, seq: 0 }), hi: JSON.stringify(g.getState().highlights()),
        picks: i.pickables.length, plays: window.__plays.slice().sort(), flashes: flashes.map((x) => Math.round(x)),
        moment: window.__moments.slice(n).map((m) => Math.round(m.off - m.on)), lives: document.querySelectorAll("[aria-live]").length - lives,
        focus: document.activeElement === focus, admitted: fl.admitted - a, delays: delays.sort((x, y) => x - y), runs,
      };
    }, { on, rolled: f.rolled, base: f.state });
    const on = await once(true), off = await once(false);
    check(`${tag}: effect on flies goods, off flies none`, on.admitted === 3 && off.admitted === 0, { on: on.admitted, off: off.admitted });
    check(`${tag}: game state, legal marks and pickables identical with the effect on and off`, on.state === off.state && on.hi === off.hi && on.picks === off.picks);
    check(`${tag}: the same sounds with the effect on and off`, JSON.stringify(on.plays) === JSON.stringify(off.plays), { on: on.plays, off: off.plays });
    // Wall-clock lifetimes vary with software GL's frame times, so the durations are compared where they are set: the same
    // timers (the moment's 900 ms hold, each cue's 3000 ms) and the same CSS runs, with the effect on and off.
    check(`${tag}: the same timers and cue animations with the effect on and off (900 ms hold, 3000 ms cues)`, JSON.stringify(on.delays) === JSON.stringify(off.delays) && on.delays.includes(900) && on.delays.filter((d) => d === 3000).length >= 2 && JSON.stringify(on.runs) === JSON.stringify(off.runs) && on.runs.length >= 2, { on: [on.delays, on.runs], off: [off.delays, off.runs] });
    check(`${tag}: each gain cue is up at least its 3 s with the effect on and off`, on.flashes.length === 2 && off.flashes.length === 2 && [...on.flashes, ...off.flashes].every((x) => x >= 3000), { on: on.flashes, off: off.flashes });
    check(`${tag}: no focus change and no new live region`, on.focus && off.focus && on.lives === 0 && off.lives === 0);

    // Hotseat handover: the next seat's hand never receives the last seat's goods.
    r = await page.evaluate(async ({ h1 }) => {
      const g = window.__emberisle, fl = window.__isle.flights;
      g.setState({ mode: "hotseat" });
      window.__next(1, [{ hex: h1, player: "p0", res: "ore", n: 1 }]);
      await window.__skip();
      await window.__until(() => fl.batch?.t0 !== undefined || !fl.batch);
      const flying = !!fl.batch;
      const st = structuredClone(g.getState().state);
      st.current = "p1";
      st.phase = "roll";
      st.seq += 1;
      window.__push(st);
      const why = fl.log.at(-1), batch = fl.batch;
      const back = structuredClone(st);
      back.current = "p0";
      back.seq += 1;
      window.__push(back);
      g.setState({ mode: "online" });
      return { flying, why, batch };
    }, { h1 });
    check(`${tag}: a hotseat handover cancels before the next seat's hand can take anything`, r.flying && r.batch === null && /hotseat\|play\|p1$/.test(r.why), r);

    // A watcher: no seat, no batch; the public flash and pulses remain.
    r = await page.evaluate(async ({ h1 }) => {
      const g = window.__emberisle, fl = window.__isle.flights, rec = window.__rec, n = rec.captured.length;
      g.setState({ spectator: true });
      await new Promise((ok) => setTimeout(ok, 100));
      window.__next(1, [{ hex: h1, player: "p0", res: "ore", n: 1, vertex: undefined }]);
      const res = { captured: rec.captured.length - n, batch: fl.batch, flashes: window.__isle.flashes.length, hand: !!document.querySelector('[data-testid="hand-dock"]') };
      g.setState({ spectator: false });
      return res;
    }, { h1 });
    check(`${tag}: a watcher gets no batch and no hand, and the hex flash still shows`, r.captured === 0 && r.batch === null && !r.hand && r.flashes > 0, r);

    // Disposal: a separate set of goods releases its five geometries and five materials once, and its listener.
    r = await page.evaluate(async () => {
      const { PayoutFlights } = await import("/src/lib/scene/payout-flight.ts");
      const i = window.__isle, f = new PayoutFlights(i.renderer.domElement, () => i.cam());
      const geos = new Set(), mats = new Set();
      f.scene.children.forEach((m) => mats.add(m.material));
      f.geos && Object.values(f.geos).forEach((g) => geos.add(g));
      Object.values(f.mats).forEach((m) => mats.add(m));
      let g = 0, m = 0;
      geos.forEach((x) => x.addEventListener("dispose", () => g++));
      mats.forEach((x) => x.addEventListener("dispose", () => m++));
      f.dispose();
      f.dispose();
      document.dispatchEvent(new Event("visibilitychange"));
      return { geos: geos.size, mats: mats.size, g, m, kids: f.scene.children.length };
    });
    check(`${tag}: disposal releases 5 geometries and 5 materials exactly once, and every mesh`, r.geos === 5 && r.mats === 5 && r.g === 5 && r.m === 5 && r.kids === 0, r);
  }

  // Reduced motion from the start: no objects at all; the hand's gain cue still holds its full time.
  for (const test of [cases[0], cases[1]]) {
    const { page, ctx, tag } = await open(test, true);
    try {
      const r = await page.evaluate(async (rolled) => {
        const fl = window.__isle.flights, rec = window.__rec;
        const seen = new Map(), flashes = [];
        new MutationObserver(() => {
          const now = performance.now(), els = new Set(document.querySelectorAll('[data-testid="resource-flash"]'));
          for (const el of els) if (!seen.has(el)) seen.set(el, now);
          for (const [el, t] of seen) if (!els.has(el)) { flashes.push(Math.round(now - t)); seen.delete(el); }
        }).observe(document.body, { subtree: true, childList: true });
        window.__push(rolled);
        await new Promise((ok) => setTimeout(ok, 3600));
        return { captured: rec.captured.length, admitted: fl.admitted, frames: rec.frames.length, flashes };
      }, f.rolled);
      check(`${tag}: reduced motion: no batch, no object, no flight frame`, r.captured === 0 && r.admitted === 0 && r.frames === 0, r);
      check(`${tag}: reduced motion: each gain cue still holds its full 3 s`, r.flashes.length === 2 && r.flashes.every((x) => x >= 2950), r.flashes);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  await vite.close();
}

check("no console errors", errors.length === 0, errors.slice(0, 5));
if (fails.length) {
  console.log(`payout-flight-prove: FAIL (${fails.length})`);
  process.exit(1);
}
console.log("payout-flight-prove: PASS");
