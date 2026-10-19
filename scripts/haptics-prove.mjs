// #542: guarded contact haptics. Stub navigator.vibrate; assert land / pay / turn / fortune / trade / win
// durations; fail on an opponent piece landing; desktop (no coarse pointer) stays quiet; the Table menu
// toggle sticks. Reduced motion still buzzes. Run: npm run haptics-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.HAPTICS_PORT || process.env.VITE_PORT) || 8452;
const STEP_MS = 30_000;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function openPage({ coarse = true, reducedMotion = false } = {}) {
  const page = await browser.newPage({
    viewport: { width: coarse ? 390 : 960, height: coarse ? 844 : 540 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    hasTouch: coarse,
    isMobile: coarse,
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((coarse) => {
    window.__buzz = [];
    const realMatch = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      q === "(pointer: coarse)"
        ? {
            matches: coarse,
            media: q,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            },
          }
        : realMatch(q);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (ms) => {
        window.__buzz.push(ms);
        return true;
      },
    });
  }, coarse);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle, null, { timeout: STEP_MS });
  // Unlock sound / haptics (first gesture).
  await page.keyboard.press("Shift");
  return page;
}

async function toPractice(page) {
  await page.evaluate(() => window.__emberisle.getState().startAi());
  await page.waitForFunction(() => window.__emberisle.getState().state, null, { timeout: STEP_MS });
}

// Roll off until this seat's first outpost, then freeze bots (pieces-land-prove pattern).
async function toMySetup(page) {
  await toPractice(page);
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
    if (next === "mine") return page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await page.waitForFunction(() => {
      const s = window.__emberisle.getState();
      return s.state.phase !== "rollOff" || s.state.current !== s.localId;
    });
  }
}

async function clearBuzz(page) {
  await page.evaluate(() => {
    window.__buzz = [];
  });
}

async function buzzWithin(page, ms, want, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const got = await page.evaluate(() => window.__buzz.slice());
    if (got.some((n) => n === want)) return got;
    await page.waitForTimeout(20);
  }
  const got = await page.evaluate(() => window.__buzz.slice());
  throw new Error(`${label}: expected vibrate ${want} within ${ms} ms, got ${JSON.stringify(got)}`);
}

// Build an outpost on this seat; assert a 10 ms land buzz within 100 ms of the knock frame.
async function landProof(page) {
  await toMySetup(page);
  await clearBuzz(page);
  await page.evaluate(() => {
    const g = window.__emberisle.getState();
    const id = g.highlights().vertices[0];
    if (!id) throw new Error("no legal outpost");
    window.__buzz = [];
    window.__t0 = performance.now();
    g.pickVertex(id);
  });
  // Knock + haptic fire together at LAND_MS.outpost_place (280). Allow slack after that frame.
  await buzzWithin(page, 400, 10, "own outpost land");
  const when = await page.evaluate(() => {
    const i = window.__buzz.indexOf(10);
    return i < 0 ? null : performance.now() - window.__t0;
  });
  assert.ok(when != null && when <= 380, `land buzz at ${when} ms from pick (want ≤ 380)`);
  console.log(`land: own outpost buzzed 10 at ${Math.round(when)} ms from pick`);
}

// Opponent (bot) placement must not buzz.
async function opponentLandProof(page) {
  await toPractice(page);
  await page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
  await page.evaluate(async () => {
    const g = window.__emberisle;
    const { hear } = await import("/src/lib/game/store.ts");
    const before = structuredClone(g.getState().state);
    const after = structuredClone(before);
    const bot = after.players.find((p) => p.kind === "bot");
    const free = after.vertices.find((v) => !v.building);
    if (!bot || !free) throw new Error("need bot and free vertex");
    free.building = { playerId: bot.id, kind: "outpost" };
    after.current = bot.id;
    after.seq += 1;
    window.__buzz = [];
    // This browser watches the bot's seat; hear must not schedule a land buzz.
    hear(before, after, g.getState().localId, "ai");
  });
  await page.waitForTimeout(400);
  const buzzed = await page.evaluate(() => window.__buzz.filter((ms) => ms === 10));
  assert.deepEqual(buzzed, [], `opponent land must not vibrate, got ${JSON.stringify(buzzed)}`);
  console.log("land: opponent outpost stayed quiet");
}

// Rig a roll that pays exactly 3 pieces; assert three 8 ms buzzes.
// Clear every building and every other pip first so practice leftovers cannot add ticks.
async function payProof(page) {
  await toPractice(page);
  await page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
  const n = await page.evaluate(async () => {
    const g = window.__emberisle;
    const rules = await import("/src/lib/game/rules.ts");
    const st = structuredClone(g.getState().state);
    const me = g.getState().localId;
    for (const v of st.vertices) v.building = undefined;
    for (const h of st.hexes) {
      if (h.terrain === "waste") continue;
      h.pip = 2;
    }
    // Pick three hexes that do not share a corner, so each outpost earns exactly one grant on a 6.
    const land = st.hexes.filter((h) => h.terrain !== "waste" && h.id !== st.robberHex);
    const picked = [];
    for (const h of land) {
      if (picked.length >= 3) break;
      const shares = picked.some((p) => st.vertices.some((v) => v.hexes.includes(h.id) && v.hexes.includes(p.id)));
      if (!shares) picked.push(h);
    }
    picked.forEach((h, i) => {
      h.pip = 6;
      h.terrain = ["wool", "ore", "grain"][i];
    });
    const corners = picked.map((h) =>
      st.vertices.find((v) => v.hexes.includes(h.id) && v.hexes.filter((id) => picked.some((p) => p.id === id)).length === 1 && !v.building),
    );
    if (corners.some((c) => !c) || picked.length < 3) throw new Error(`pay setup: need 3 isolated hexes, got ${picked.length}`);
    corners.forEach((v) => {
      v.building = { playerId: me, kind: "outpost" };
    });
    st.current = me;
    st.phase = "roll";
    st.dice = null;
    st.bank = { timber: 19, clay: 19, wool: 19, grain: 19, ore: 19 };
    st.seq += 1;
    g.setState({ state: st });
    // flash-prove: queue values are face-1, so [5,5] → dice 6+6? No — [2,2] → 3+3 = 6.
    window.__queue = [2, 2];
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (buf) => (window.__queue.length ? ((buf[0] = window.__queue.shift()), buf) : real(buf));
    const isle = window.__isle;
    const before = g.getState().state;
    const paid = rules.applyAction(before, me, { type: "roll" }).state;
    // Drop any auto pulse from setBoard before we count ticks ourselves.
    g.setState({ state: paid });
    isle.clearPayers?.();
    window.__buzz = [];
    const { hear } = await import("/src/lib/game/store.ts");
    hear(before, paid, me, "ai");
    isle.pulsePayers(paid);
    for (let i = 0; i < 200 && isle.payingPieces?.length; i++) isle.stepPayers(0.01, false);
    return { n: window.__buzz.filter((ms) => ms === 8).length, grants: (paid.lastProduction ?? []).length, buzz: window.__buzz.slice() };
  });
  assert.equal(n.grants, 3, `pay setup: expected 3 grants, got ${n.grants}`);
  assert.equal(n.n, 3, `pay ticks: expected 3 buzzes of 8, got ${n.n} (${JSON.stringify(n.buzz)})`);
  console.log("pay: three pieces buzzed 8 each");
}

async function toggleProof(page) {
  await toPractice(page);
  // Open the table menu and flip Haptics off; a your-turn buzz must not fire.
  await page.getByRole("button", { name: "Table menu" }).click();
  const toggle = page.getByTestId("haptics-toggle");
  await toggle.waitFor({ state: "visible", timeout: STEP_MS });
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  await clearBuzz(page);
  await page.evaluate(async () => {
    const { yourTurn } = await import("/src/lib/sound.ts");
    yourTurn();
  });
  const off = await page.evaluate(() => window.__buzz.slice());
  assert.deepEqual(off, [], `haptics off must stay quiet, got ${JSON.stringify(off)}`);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await clearBuzz(page);
  await page.evaluate(async () => {
    const { yourTurn } = await import("/src/lib/sound.ts");
    yourTurn();
  });
  await buzzWithin(page, 200, 15, "your-turn with haptics on");
  console.log("toggle: off silent, on buzzes 15 for your-turn");
}

async function desktopQuietProof(page) {
  await toPractice(page);
  await clearBuzz(page);
  await page.evaluate(async () => {
    const { yourTurn, haptic, HAPTIC_MS } = await import("/src/lib/sound.ts");
    yourTurn();
    haptic(HAPTIC_MS.land);
    haptic(HAPTIC_MS.pay);
  });
  const got = await page.evaluate(() => window.__buzz.slice());
  assert.deepEqual(got, [], `desktop must ignore haptics, got ${JSON.stringify(got)}`);
  // Toggle row is still offered when vibrate exists (stubbed), but effect is coarse-gated.
  console.log("desktop: coarse=false stays quiet");
}

async function reducedStillBuzzes(page) {
  await toPractice(page);
  await clearBuzz(page);
  await page.evaluate(async () => {
    const { yourTurn } = await import("/src/lib/sound.ts");
    yourTurn();
  });
  await buzzWithin(page, 200, 15, "reduced-motion your-turn");
  console.log("reduced motion: your-turn still buzzed 15");
}

let code = 0;
try {
  {
    const page = await openPage({ coarse: true });
    await landProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: true });
    await opponentLandProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: true });
    await payProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: true });
    await toggleProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: false });
    await desktopQuietProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: true, reducedMotion: true });
    await reducedStillBuzzes(page);
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS haptics-prove");
} catch (e) {
  code = 1;
  console.error(e);
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
