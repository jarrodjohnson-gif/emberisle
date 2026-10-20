// #645: every seat shows two public tallies, "🛤 n" (its longest continuous path) and "⚔ n" (wayfarers it has played), and the
// seat that holds Longest Path (5+) or Largest Army (3+) wears a gold badge on that tally with an accessible name ("Longest
// path, 7"). At 440x956 and 956x440 (the phone seat strip) and 1280x720 (the desktop rail), on states the real rules produce
// (rules.ts applyAction, loaded through vite, then pushed into the page, as the other proofs do):
// - path lengths 4, 5 and 7 across seats: the badge sits on the seat with 7, and on nobody while the top is 4;
// - an army of 3 against 2: the badge sits on the seat with 3;
// - a tie for path length (5 and 5) or army (3 and 3) leaves the badge on the current holder, and the badge moves, with a
//   short pulse (none under reduced motion), only when a seat passes the holder;
// - every count reads what the rules hold (roadLength, knightsPlayed), the log carries the rules' own "holds" lines, and the
//   seat cards keep one size whatever they hold (<= 44 px tall, the same box with and without a badge), with each tally inside
//   its card and clear of the points.
// Zero console errors. Saves test-results/longest-army-<size>.png. Run: node scripts/longest-army-prove.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8453;
const VIEWS = [
  { tag: "440x956", width: 440, height: 956 },
  { tag: "956x440", width: 956, height: 440 },
  { tag: "1280x720", width: 1280, height: 720, mouse: true }, // the desktop rail, with goods and fortunes beside the tallies
  { tag: "390x844", width: 390, height: 844 },
];

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  // The rules, run in node on the real code: setup, then path builds and wayfarer plays, each step a state to show.
  const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction, legalRoads, legalSettle, roadLength } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  const act = (st, pid, action, setup = {}) => {
    const s = structuredClone(st);
    Object.assign(s, { current: pid, phase: "main", playedCard: false, discardNeeded: {} }, setup);
    const me = s.players.find((p) => p.id === pid);
    me.resources = { timber: 9, clay: 9, wool: 9, grain: 9, ore: 9 };
    if (action.type === "playKnight") me.hidden.knight = 1;
    return applyAction(s, pid, action);
  };
  const settled = (seed) => {
    let st = createGame({ seed, humans: ["Seat 1", "Seat 2", "Seat 3", "Seat 4"].map((name) => ({ name })), bots: 0, wayfarerMode: "off" });
    for (let i = 0; i < 200 && st.phase !== "roll"; i++) {
      const cur = st.current;
      const action = st.phase === "rollOff" ? { type: "roll" }
        : st.phase === "setupSettle" ? { type: "setupSettle", vertexId: legalSettle(st, cur, true)[0] }
        : { type: "setupRoad", edgeId: legalRoads(st, cur, true)[0] };
      const r = applyAction(st, cur, action);
      assert.ok(!r.error, `setup: ${r.error}`);
      st = r.state;
    }
    return st;
  };
  // Lay paths for `pid` one at a time, each one lengthening its longest path by one, until it is `target` long; null if boxed in.
  const grow = (st, pid, target) => {
    while (roadLength(st, pid) < target) {
      const have = roadLength(st, pid);
      let next = null;
      for (const edgeId of legalRoads({ ...st, current: pid }, pid, false)) {
        const r = act(st, pid, { type: "buildPath", edgeId });
        if (!r.error && roadLength(r.state, pid) === have + 1) { next = r.state; break; }
      }
      if (!next) return null;
      st = next;
    }
    return st;
  };
  const muster = (st, pid, times) => {
    for (let i = 0; i < times; i++) {
      const r = act(st, pid, { type: "playKnight", hexId: "", stealFrom: null });
      assert.ok(!r.error, `playKnight: ${r.error}`);
      st = r.state;
    }
    return st;
  };

  // Scenarios, in order. Seat a gets 4, b gets 5 (first to 5), d gets 2, c climbs to 5 (a tie) and on to 7.
  let steps = null;
  for (let seed = 1; seed < 60 && !steps; seed++) {
    const base = settled(seed);
    const [a, b, c, d] = ["p0", "p1", "p2", "p3"];
    const four = grow(base, a, 4);
    const five = four && grow(four, b, 5);
    const two = five && grow(five, d, 2);
    const tie = two && grow(two, c, 5);
    const seven = tie && grow(tie, c, 7);
    if (!seven) continue;
    const m2 = muster(seven, b, 2);
    const army = muster(m2, a, 3);
    const armyTie = muster(army, b, 1);
    const armyMoves = muster(armyTie, b, 1);
    const both = muster(seven, c, 3); // c holds the path (7) and, with three knights and nobody else's, the army too
    steps = [
      { name: "path 4 (below the minimum)", st: four, path: null, army: null },
      { name: "path 5 leads", st: five, path: b, army: null },
      { name: "path 5 ties path 5", st: tie, path: b, army: null },
      { name: "paths 4, 5, 7, 2", st: seven, path: c, army: null },
      { name: "army 2 (below the minimum)", st: m2, path: c, army: null },
      { name: "army 3 against 2", st: army, path: c, army: a },
      { name: "army 3 ties army 3", st: armyTie, path: c, army: a },
      { name: "army 4 passes army 3", st: armyMoves, path: c, army: b },
      { name: "one seat holds both", st: both, path: c, army: c },
    ];
  }
  assert.ok(steps, "the rules built every scenario on some island");
  for (const s of steps) {
    assert.equal(s.st.longestRoad, s.path, `${s.name}: rules say path holder ${s.path}, got ${s.st.longestRoad}`);
    assert.equal(s.st.largestArmy, s.army, `${s.name}: rules say army holder ${s.army}, got ${s.st.largestArmy}`);
  }
  const [, , tieStep, sevenStep] = steps;
  assert.deepEqual(["p0", "p1", "p2", "p3"].map((id) => roadLength(sevenStep.st, id)), [4, 5, 7, 2], "paths 4, 5, 7 and 2");
  assert.deepEqual(["p1", "p2"].map((id) => roadLength(tieStep.st, id)), [5, 5], "the tie is 5 and 5");
  assert.ok(sevenStep.st.log.includes("Seat 3 holds the longest path."), "the rules logged the new holder");
  assert.ok(!tieStep.st.log.includes("Seat 3 holds the longest path."), "a tie logs nothing");
  assert.ok(steps[5].st.log.includes("Seat 1 holds the largest army.") && steps[7].st.log.includes("Seat 2 holds the largest army."), "the rules logged the army holders");

  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !v.mouse, isMobile: !v.mouse });
    // First-game tips off: their "Skip tips" chip shares the strip's row and would resize the cells part-way through.
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForSelector('[data-testid="seat-strip"], [data-testid^="rail-p"]');
    const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const show = async (st) => {
      await page.evaluate((st) => window.__emberisle.setState({ state: st, localId: st.current, banner: null, error: null }), st);
      await settle();
      // The badge pulse scales the tally (build-ready, 320 ms). Measure the tallies at rest, not mid-pulse.
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.target?.closest?.('[data-testid^="tally-"]')).map((a) => a.finished.catch(() => {}))));
      await settle();
    };
    // Every seat's card, tallies and points, read from the page.
    const read = () =>
      page.evaluate(() => {
        const sel = document.querySelector('[data-testid="seat-strip"]') ? "seat" : "rail";
        return {
          sel,
          seats: [...document.querySelectorAll(`[data-testid^="${sel}-p"]`)].map((card) => {
            const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
            // A computed colour (oklch in this build) as [r, g, b, a], by painting one pixel.
            const px = (c) => { const k = document.createElement("canvas"); k.width = k.height = 1; const x = k.getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
            const tally = (id) => {
              const el = card.querySelector(`[data-testid="${id}"]`);
              const cs = getComputedStyle(el);
              return { text: el.lastChild.textContent, glyph: el.firstElementChild.textContent, label: el.getAttribute("aria-label"), role: el.getAttribute("role"), badge: /^(Longest path|Largest army),/.test(el.getAttribute("aria-label")), box: box(el), anim: cs.animationName, bg: px(cs.backgroundColor), shown: el.getClientRects().length > 0 && cs.visibility === "visible" };
            };
            return { id: card.dataset.testid.replace(`${sel}-`, ""), card: box(card), vp: box(card.querySelector('[data-testid="seat-vp"]')), path: tally("tally-path"), army: tally("tally-army") };
          }),
        };
      });
    const sizes = new Map();
    const check = async (step, phase) => {
      const { sel, seats } = await read();
      const { st } = step;
      assert.equal(seats.length, 4, `${v.tag} ${step.name}: four seats`);
      for (const s of seats) {
        const tag = `${v.tag} ${step.name} ${s.id}`;
        // The counts are what the rules hold.
        assert.equal(s.path.text, String(roadLength(st, s.id)), `${tag}: path count ${JSON.stringify(s.path.text)}`);
        assert.equal(s.army.text, String(st.players.find((p) => p.id === s.id).knightsPlayed), `${tag}: army count ${JSON.stringify(s.army.text)}`);
        // The badge is on the holder and nobody else, and its name says so; the others' names say what they count.
        const pathHeld = step.path === s.id, armyHeld = step.army === s.id;
        assert.equal(s.path.badge, pathHeld, `${tag}: path badge ${s.path.badge}, holder is ${step.path}`);
        assert.equal(s.army.badge, armyHeld, `${tag}: army badge ${s.army.badge}, holder is ${step.army}`);
        assert.equal(s.path.label, `${pathHeld ? "Longest path" : "Path length"}, ${s.path.text}`, `${tag}: path name ${s.path.label}`);
        assert.equal(s.army.label, `${armyHeld ? "Largest army" : "Wayfarers played"}, ${s.army.text}`, `${tag}: army name ${s.army.label}`);
        assert.ok(s.path.role === "img" && s.army.role === "img", `${tag}: tallies have a role`);
        // Both tallies are drawn inside the card, left of the points, and gold only on a badge.
        for (const [kind, t] of [["path", s.path], ["army", s.army]]) {
          assert.ok(t.shown && t.box.w > 0 && t.box.h > 0, `${tag}: ${kind} tally is shown`);
          assert.ok(t.box.l >= s.card.l && t.box.r <= s.card.r && t.box.t >= s.card.t && t.box.b <= s.card.b, `${tag}: ${kind} tally ${JSON.stringify(t.box)} is inside its card ${JSON.stringify(s.card)}`);
          assert.ok(t.box.r <= s.vp.l + 0.5 || t.box.b <= s.vp.t || t.box.t >= s.vp.b, `${tag}: ${kind} tally clears the points`);
          const [r, g, b, a] = t.bg;
          assert.equal(a === 255 && r > 200 && g > 150 && b < 120, t.badge, `${tag}: ${kind} is gold [${t.bg}] exactly when it is the badge`);
          if (!t.badge) assert.equal(a, 0, `${tag}: ${kind} has no fill without the badge`);
        }
        assert.ok(s.path.box.r <= s.army.box.l + 0.5, `${tag}: the tallies do not overlap`);
        assert.ok(s.card.h <= 44, `${tag}: card is ${s.card.h} px tall`);
        // Fixed size: the card is the same box whatever it holds.
        const key = `${sel}-${s.id}`;
        const was = sizes.get(key);
        if (was) assert.deepEqual([was.w, was.h], [s.card.w, s.card.h], `${tag}: card size changed from ${JSON.stringify(was)} to ${JSON.stringify([s.card.w, s.card.h])}`);
        else sizes.set(key, { w: s.card.w, h: s.card.h });
      }
      // The accessible name finds exactly the holder, by role and name.
      const holder = (name) => page.getByRole("img", { name });
      const pathName = step.path ? `Longest path, ${roadLength(st, step.path)}` : null;
      const armyName = step.army ? `Largest army, ${st.players.find((p) => p.id === step.army).knightsPlayed}` : null;
      for (const [name, id] of [[pathName, step.path], [armyName, step.army]]) {
        if (!name) continue;
        assert.equal(await holder(name).count(), 1, `${v.tag} ${step.name}: exactly one "${name}"`);
        assert.equal(await page.getByTestId(`${sel}-${id}`).getByRole("img", { name }).count(), 1, `${v.tag} ${step.name}: "${name}" is on ${id}`);
      }
      assert.equal(await page.getByRole("img", { name: /^Longest path,/ }).count(), step.path ? 1 : 0, `${v.tag} ${step.name}: ${step.path ? "one" : "no"} longest path badge`);
      assert.equal(await page.getByRole("img", { name: /^Largest army,/ }).count(), step.army ? 1 : 0, `${v.tag} ${step.name}: ${step.army ? "one" : "no"} largest army badge`);
      return seats;
    };

    let prev = null;
    const shotAt = "one seat holds both";
    for (const step of steps) {
      await show(step.st);
      const seats = await check(step);
      // The pulse: a badge that just landed on a seat plays the short keyframes; a badge that was already there is the same
      // node and the same class, so nothing restarts. Under reduced motion there is none.
      const moved = (key) => prev && prev[key] !== step[key] && step[key];
      for (const [key, tallyKey] of [["path", "path"], ["army", "army"]]) {
        const badge = seats.find((s) => s[tallyKey].badge)?.[tallyKey];
        if (!badge) continue;
        assert.equal(badge.anim, "build-ready", `${v.tag} ${step.name}: the ${key} badge pulses (${badge.anim})`);
        if (moved(key)) {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await settle();
          const calm = (await read()).seats.find((s) => s[tallyKey].badge)[tallyKey];
          assert.equal(calm.anim, "none", `${v.tag} ${step.name}: no pulse under reduced motion (${calm.anim})`);
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await settle();
        }
      }
      assert.ok(seats.filter((s) => !s.path.badge).every((s) => s.path.anim === "none") && seats.filter((s) => !s.army.badge).every((s) => s.army.anim === "none"), `${v.tag} ${step.name}: only a badge pulses`);
      // The holder is carried by the rules state, so the badge follows it exactly: a tie leaves it where it was.
      if (step.name === "path 5 ties path 5") assert.equal(prev.path, step.path, "the tie keeps the earlier holder");
      if (step.name === "army 3 ties army 3") assert.equal(prev.army, step.army, "the army tie keeps the earlier holder");
      if (step.name === shotAt) await page.screenshot({ path: `test-results/longest-army-${v.tag}.png` });
      console.log(`${v.tag}: ${step.name}: ${seats.map((s) => `${s.id} 🛤${s.path.text}${s.path.badge ? "*" : ""} ⚔${s.army.text}${s.army.badge ? "*" : ""}`).join("  ")}`);
      prev = step;
    }
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("longest-army-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
