// #441: after a roll the hexes that paid glow (cap emissive up, then back to rest) and nothing else does.
// A hotseat table is built up (every corner owned), then real rolls go through the store's dispatch. After each roll the glowing
// caps, read from every frame the island draws, must be exactly the hexes whose token is the sum, that the wayfarer is not on,
// and whose resource a hand actually gained (read from the hand diff, not from the renderer's own rule). The rng is searched with
// the rules' own applyAction so a roll can be steered into a bank-short roll and a wayfarer-blocked one. Negatives: a state that
// already has dice, met on first load or after a jump of several seqs, never flashes. Under reduced motion the glow is a step.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 15_000;

const PORT = Number(process.env.FLASH_PORT || process.env.VITE_PORT) || 8441;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function openTable(reducedMotion) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => window.__emberisle.getState().state);
    if (before.phase !== "rollOff") break;
    await roll.focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, before.seq, { timeout: STEP_MS });
  }
  await page.waitForFunction(() => window.__isle?.caps.size > 0, null, { timeout: STEP_MS });
  // Every corner owned, alternately by the first two seats; the table waits for a roll.
  await page.evaluate(async () => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    // The island is random; the scenarios need a token shared by two resources (8: wool and ore) and one on two hexes (9: grain
    // and clay), so four land hexes are set to those, and nothing below depends on how the island was dealt.
    const land = st.hexes.filter((h) => h.pip && h.terrain !== "waste" && h.id !== st.robberHex);
    [["wool", 8], ["ore", 8], ["grain", 9], ["clay", 9]].forEach(([terrain, pip], i) => {
      land[i].terrain = terrain;
      land[i].pip = pip;
    });
    st.vertices.forEach((v, i) => {
      v.building = { playerId: st.players[i % 2].id, kind: i % 3 === 0 ? "stronghold" : "outpost" };
    });
    st.current = st.players[0].id;
    st.phase = "roll";
    st.dice = null;
    st.seq += 1;
    g.setState({ state: st, buildMode: "none", error: null });
    window.__rules = await import("/src/lib/game/rules.ts");
    // The rules draw each die from crypto.getRandomValues; a queued value steers the next die, otherwise it is untouched.
    window.__queue = [];
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (buf) => (window.__queue.length ? ((buf[0] = window.__queue.shift()), buf) : real(buf));
    // Record the glow of every cap on every frame the island draws.
    const isle = window.__isle;
    window.__frames = [];
    const draw = isle.composer.render.bind(isle.composer);
    isle.composer.render = (...a) => {
      window.__frames.push(Object.fromEntries([...isle.caps].map(([id, m]) => [id, m.emissiveIntensity])));
      return draw(...a);
    };
  });
  await page.waitForFunction(() => window.__isle?.lastSeq === window.__emberisle.getState().state.seq, null, { timeout: STEP_MS });
  return page;
}

// Pushes the pre-roll table with the given rng, bank and wayfarer hex, rolls through dispatch, waits for the glow to be over.
async function roll(page, { dice, bank, robber }) {
  await page.evaluate(({ bank, robber }) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "roll";
    st.dice = null;
    if (bank) st.bank = bank;
    if (robber) {
      st.robberHex = robber;
      for (const h of st.hexes) h.blocked = h.id === robber;
    }
    st.seq += 1;
    g.setState({ state: st, error: null });
  }, { bank, robber });
  await page.waitForFunction(() => window.__isle?.lastSeq === window.__emberisle.getState().state.seq, null, { timeout: STEP_MS });
  return page.evaluate((dice) => {
    window.__frames.length = 0;
    const g = window.__emberisle;
    const before = g.getState().state;
    const hand = (st) => Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => [r, st.players.reduce((n, p) => n + p.resources[r], 0)]));
    const h0 = hand(before);
    window.__queue.push(dice[0] - 1, dice[1] - 1);
    const res = g.getState().dispatch({ type: "roll" });
    const after = g.getState().state;
    const h1 = hand(after);
    const gained = Object.keys(h0).filter((r) => h1[r] > h0[r]);
    const sum = after.dice[0] + after.dice[1];
    // The hexes that should glow: token is the sum, no wayfarer on it, and some hand gained that resource.
    const expected = after.hexes.filter((h) => h.pip === sum && !h.blocked && gained.includes(h.terrain)).map((h) => h.id);
    if (sum !== dice[0] + dice[1]) throw new Error(`dice ${after.dice} for ${dice}`);
    return { ok: res.ok, sum, gained, expected, short: window.__rules.bankShort(after), blocked: after.robberHex, seq: after.seq };
  }, dice);
}

const settled = (page, minFrames = 4) =>
  page.waitForFunction((n) => window.__isle.flashes.length === 0 && window.__frames.length >= n, minFrames, { timeout: STEP_MS * 8 });
const glowing = (page) =>
  page.evaluate(() => {
    const f = window.__frames;
    const ids = Object.keys(f[0] ?? {});
    const peak = Math.max(0, ...f.flatMap((fr) => Object.values(fr)));
    return { frames: f.length, ids: ids.filter((id) => f.some((fr) => fr[id] > 0)), peak, last: f[f.length - 1], mid: f.flatMap((fr) => Object.values(fr)).filter((v) => v > 0 && v < peak - 1e-6).length };
  });

const split = (sum) => [Math.max(1, sum - 6), sum - Math.max(1, sum - 6)];
const layout = (page) => page.evaluate(() => window.__emberisle.getState().state.hexes.filter((h) => h.pip && h.terrain !== "waste").map((h) => ({ id: h.id, pip: h.pip, terrain: h.terrain })));

// What a roll of `sum` would pay on the table as it stands, with the given bank and wayfarer, asked of the rules on a copy (nothing is
// dispatched). A scenario is only worth running when the hexes it is about really pay; a crowded token can drain a full bank by itself.
const payers = (page, sum, bank, robber) =>
  page.evaluate(({ sum, bank, robber }) => {
    const R = window.__rules;
    const st = structuredClone(window.__emberisle.getState().state);
    st.phase = "roll";
    st.dice = null;
    st.bank = bank;
    if (robber) {
      st.robberHex = robber;
      for (const h of st.hexes) h.blocked = h.id === robber;
    }
    const hand = (x) => Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => [r, x.players.reduce((n, p) => n + p.resources[r], 0)]));
    const h0 = hand(st);
    window.__queue.push(Math.max(1, sum - 6) - 1, sum - Math.max(1, sum - 6) - 1);
    const after = R.applyAction(st, st.current, { type: "roll" }).state;
    const h1 = hand(after);
    const gained = Object.keys(h0).filter((r) => h1[r] > h0[r]);
    return { short: R.bankShort(after), paid: after.hexes.filter((h) => h.pip === sum && !h.blocked && gained.includes(h.terrain)).map((h) => h.id) };
  }, { sum, bank, robber });

function check(label, got, exp, reduced) {
  const same = got.ids.length === exp.expected.length && exp.expected.every((id) => got.ids.includes(id));
  console.log(`${label}: sum ${exp.sum}, gained [${exp.gained}], short [${exp.short}], expect ${exp.expected.length} glow, saw ${got.ids.length}, ${got.frames} frames, peak ${got.peak.toFixed(2)}, in-between ${got.mid}`);
  if (!exp.ok) throw new Error(`${label}: the roll was refused`);
  if (!same) throw new Error(`${label}: glow ${got.ids} vs hands ${exp.expected}`);
  if (exp.expected.length) {
    if (got.peak < 0.25) throw new Error(`${label}: peak ${got.peak}`);
    if (!exp.expected.every((id) => got.last[id] === 0)) throw new Error(`${label}: a paying hex did not settle`);
    if (reduced && got.mid) throw new Error(`${label}: reduced motion ramped`);
    if (!reduced && !got.mid) throw new Error(`${label}: the glow stepped; it should rise and fade`);
  }
}

try {
  for (const reduced of [false, true]) {
    const page = await openTable(reduced);
    const tag = reduced ? "reduced motion" : "motion";
    const hexes = await layout(page);
    const sums = [...new Set(hexes.map((h) => h.pip))].filter((n) => n !== 7);
    // 1. A plain roll.
    const e1 = await roll(page, { dice: split(sums[0]) });
    await settled(page);
    check(`${tag} roll`, await glowing(page), e1, reduced);
    if (!reduced) {
      // 2. A short bank: a token shared by two resources, the bank holds one of the first, and two seats are owed it.
      const at = (n) => hexes.filter((h) => h.pip === n);
      // The first token and short resource where the roll really is short of that resource and the other hexes really pay.
      let sum2, short, bank;
      for (const n of sums) {
        const terrains = [...new Set(at(n).map((h) => h.terrain))];
        if (terrains.length < 2) continue;
        for (const t of terrains) {
          const b = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19, [t]: 1 };
          const p = await payers(page, n, b);
          if (p.short.includes(t) && p.paid.length) [sum2, short, bank] = [n, t, b];
          if (sum2) break;
        }
        if (sum2) break;
      }
      if (!sum2) throw new Error("no token is shared by two resources with the other paying while the bank is short");
      const e2 = await roll(page, { dice: split(sum2), bank });
      await settled(page);
      const g2 = await glowing(page);
      check("bank short", g2, e2, reduced);
      if (!e2.short.includes(short)) throw new Error(`the log did not say the bank was short of ${short}: ${e2.short}`);
      const shortIds = at(sum2).filter((h) => h.terrain === short).map((h) => h.id);
      if (g2.ids.some((id) => shortIds.includes(id))) throw new Error(`a ${short} hex glowed on a roll the bank could not pay`);
      if (!e2.expected.length) throw new Error("bank-short roll paid nothing else; the scenario proves too little");
      // 3. The wayfarer on a hex whose token is rolled: that hex stays dark.
      // The first token on two hexes where, with the wayfarer on the first, the other hex(es) still pay from a full bank.
      const full = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 };
      let sum3;
      for (const n of sums) {
        if (at(n).length >= 2 && (await payers(page, n, full, at(n)[0].id)).paid.length) {
          sum3 = n;
          break;
        }
      }
      if (!sum3) throw new Error("no token is on two hexes where the one the wayfarer is not on pays");
      const under = at(sum3)[0].id;
      const e3 = await roll(page, { dice: split(sum3), robber: under, bank: full });
      await settled(page, 2);
      const g3 = await glowing(page);
      check("wayfarer-blocked", g3, e3, reduced);
      if (g3.ids.includes(under)) throw new Error("the hex under the wayfarer glowed");
      if (!e3.expected.length) throw new Error("the other hex with that token paid nothing; the scenario proves too little");
      // 3b. Twins: two wool hexes on the same token, one owner, a bank holding one wool. One hex gets paid, so exactly one glows.
      const twins = await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        const two = st.hexes.filter((h) => h.pip && h.terrain !== "waste" && h.id !== st.robberHex && h.pip !== 6).slice(0, 2);
        for (const h of two) {
          h.terrain = "wool";
          h.pip = 6;
        }
        st.vertices.forEach((v) => {
          if (v.building) v.building.playerId = st.players[0].id;
        });
        st.seq += 1;
        g.setState({ state: st });
        return two.map((h) => h.id);
      });
      await page.waitForFunction(() => window.__isle?.lastSeq === window.__emberisle.getState().state.seq, null, { timeout: STEP_MS });
      const e4 = await roll(page, { dice: split(6), robber: "", bank: { timber: 19, clay: 19, wool: 1, grain: 19, ore: 19 } });
      await settled(page);
      const g4 = await glowing(page);
      const woolGlow = g4.ids.filter((id) => twins.includes(id));
      console.log(`twins: wool hexes ${twins} on a 6, bank holds 1 wool, hands gained [${e4.gained}], ${woolGlow.length} of them glowed`);
      if (!e4.gained.includes("wool") || woolGlow.length !== 1) throw new Error(`two wool 6s, one paid: ${woolGlow.length} glowed`);
      // 3c. Online style: one push carries a roll and the actions after it (seq +2, one more roll). It still flashes the payers.
      const multi = await page.evaluate(async () => {
        const g = window.__emberisle;
        const pre = structuredClone(g.getState().state);
        // A token on a hex the wayfarer is not on and a building touches (every corner is owned, the bank is full), so it pays.
        const sum = pre.hexes.find((h) => h.pip && h.pip !== 7 && !h.blocked && h.terrain !== "waste").pip;
        const dice = [Math.max(1, sum - 6), sum - Math.max(1, sum - 6)];
        pre.phase = "roll";
        pre.dice = null;
        pre.bank = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 };
        pre.seq += 1;
        g.setState({ state: pre });
        await new Promise((r) => { const w = () => (window.__isle.lastSeq === pre.seq ? r() : requestAnimationFrame(w)); w(); });
        window.__frames.length = 0;
        window.__queue.push(dice[0] - 1, dice[1] - 1);
        const R = window.__rules;
        const rolled = R.applyAction(pre, pre.current, { type: "roll" }).state;
        const done = R.applyAction(rolled, rolled.current, { type: "endTurn" }).state;
        // Hand gains only identify resource kinds; a full bank can pay one hex of a kind
        // and leave a later same-kind hex unpaid. Use the rules' per-hex grants as ground truth.
        const expected = [...new Set((rolled.lastProduction ?? []).map((grant) => grant.hex))];
        g.setState({ state: done });
        return { jump: done.seq - pre.seq, rolls: done.rolls - pre.rolls, expected };
      });
      await settled(page);
      const g5 = await glowing(page);
      console.log(`one push, ${multi.jump} actions, ${multi.rolls} roll: ${g5.ids.length} glowed, ${multi.expected.length} expected`);
      if (multi.rolls !== 1 || multi.jump < 2 || !multi.expected.length || g5.ids.length !== multi.expected.length || !multi.expected.every((id) => g5.ids.includes(id))) {
        throw new Error(`multi-action push: ${JSON.stringify({ multi, glow: g5.ids })}`);
      }
      // 4. Negatives: a state that already has dice never flashes when it is met, only a live roll does.
      const rolled = await page.evaluate(() => structuredClone(window.__emberisle.getState().state));
      await page.evaluate(() => {
        window.__emberisle.getState().goTitle();
        window.__frames.length = 0;
      });
      await page.waitForFunction(() => window.__emberisle.getState().state === null && window.__frames.length >= 2, null, { timeout: STEP_MS * 4 });
      await page.evaluate((st) => {
        window.__frames.length = 0;
        window.__emberisle.setState({ state: st, screen: "play", mode: "hotseat" });
      }, rolled);
      await page.waitForFunction((seq) => window.__isle.lastSeq === seq && window.__frames.length >= 4, rolled.seq, { timeout: STEP_MS * 8 });
      const first = await glowing(page);
      console.log(`first load onto a state with dice: ${first.frames} frames, glowing ${first.ids.length}`);
      if (first.ids.length) throw new Error(`a state met with dice flashed: ${first.ids}`);
      // The same island but a jump of several seqs (a spectator catching up) does not flash either.
      await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.dice = null;
        st.phase = "roll";
        st.seq += 1;
        g.setState({ state: st });
      });
      await page.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq, null, { timeout: STEP_MS });
      await page.evaluate((st) => {
        window.__frames.length = 0;
        const g = window.__emberisle;
        const cur = g.getState().state;
        const next = structuredClone(st);
        next.seq = cur.seq + 3;
        g.setState({ state: next });
      }, rolled);
      await page.waitForFunction(() => window.__frames.length >= 4, null, { timeout: STEP_MS * 8 });
      const jump = await glowing(page);
      console.log(`seq jump onto a state with dice: ${jump.frames} frames, glowing ${jump.ids.length}`);
      if (jump.ids.length) throw new Error(`a seq jump flashed: ${jump.ids}`);
    }
    await page.close();
  }
} catch (e) {
  console.error("flash-prove failed:", e);
  code = 1;
}
if (errors.length) {
  console.error("console errors:", errors);
  code = 1;
}
await browser.close();
await vite.close();
console.log(code ? "flash-prove: FAIL" : "flash-prove: ok");
process.exit(code);
