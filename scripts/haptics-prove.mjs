// #542: guarded contact haptics. Stub navigator.vibrate; assert land / pay / turn / fortune / trade / win
// durations; fail on an opponent piece landing; desktop (no coarse pointer) stays quiet; the Table menu
// toggle sticks. Reduced motion still buzzes. Run: npm run haptics-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

const PORT = Number(process.env.HAPTICS_PORT || process.env.VITE_PORT) || 8452;
const STEP_MS = 30_000;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function openPage({ coarse = true, reducedMotion = false, missingAPI = false, url = `http://127.0.0.1:${PORT}/`, beforeNavigate, waitReady = true } = {}) {
  const page = await browser.newPage({
    viewport: { width: coarse ? 390 : 960, height: coarse ? 844 : 540 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    hasTouch: coarse,
    isMobile: coarse,
  });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({coarse, missingAPI}) => {
    window.__coarse = coarse;
    window.__buzz = [];
    window.__buzzTimes = [];
    window.__knocks = [];
    window.__gainTicks = 0;
    window.__uiClicks = 0;
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.endsWith("/drop_003.wav")) window.__knocks.push(performance.now());
      if (this.src.endsWith("/click_002.wav")) window.__gainTicks++;
      if (this.src.endsWith("/click_001.wav")) window.__uiClicks++;
      return realPlay.call(this);
    };
    const realMatch = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      q === "(pointer: coarse)"
        ? {
            get matches() { return window.__coarse; },
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
      value: missingAPI ? undefined : (ms) => {
        window.__buzz.push(ms);
        window.__buzzTimes.push(performance.now());
        return true;
      },
    });
  }, {coarse, missingAPI});
  if (beforeNavigate) await beforeNavigate(page);
  await page.goto(url, {waitUntil: "domcontentloaded"});
  if (!waitReady) return page;
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
    window.__buzzTimes = [];
  });
}

async function buzzWithin(page, ms, want, label) {
  const started = await page.evaluate(() => performance.now());
  const deadline = Date.now() + ms;
  const sample = () => page.evaluate(({want, limit}) => ({
    got: window.__buzz.slice(),
    timely: window.__buzz.some((n, i) => n === want && window.__buzzTimes[i] <= limit),
  }), {want, limit: started + ms});
  while (Date.now() < deadline) {
    const {got, timely} = await sample();
    if (timely) return got;
    await page.waitForTimeout(20);
  }
  const {got, timely} = await sample();
  if (timely) return got;
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
    window.__buzzTimes = [];
    window.__knocks = [];
    window.__t0 = performance.now();
    g.pickVertex(id);
  });
  // Observe both callbacks directly; slow drawing or polling cannot inflate their actual interval.
  await page.waitForFunction(() => window.__buzz.includes(10) && window.__knocks.length, null, { timeout: STEP_MS });
  const when = await page.evaluate(() => {
    const i = window.__buzz.indexOf(10);
    return i < 0 ? null : Math.abs(window.__buzzTimes[i] - window.__knocks[0]);
  });
  assert.ok(when != null && when <= 100, `land buzz follows the recorded knock within 100 ms (got ${when})`);
  console.log(`land: own outpost buzzed 10 within ${Math.round(when)} ms of the recorded knock`);
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
    window.__buzzTimes = [];
    // This browser watches the bot's seat; hear must not schedule a land buzz.
    hear(before, after, g.getState().localId, "ai");
  });
  await page.waitForTimeout(400);
  const buzzed = await page.evaluate(() => window.__buzz.filter((ms) => ms === 10));
  assert.deepEqual(buzzed, [], `opponent land must not vibrate, got ${JSON.stringify(buzzed)}`);
  console.log("land: opponent outpost stayed quiet");
  for (const own of [false, true]) {
    await page.evaluate(async (own) => {
      const g = window.__emberisle.getState();
      const { hear } = await import("/src/lib/game/store.ts");
      const before = structuredClone(g.state), after = structuredClone(before);
      const bot = after.players.find(p => p.kind === "bot");
      const edge = after.edges.find(e => !e.path);
      edge.path = own ? g.localId : bot.id;
      before.current = own ? g.localId : bot.id;
      after.current = own ? bot.id : g.localId;
      after.seq++;
      window.__buzz = []; window.__buzzTimes = [];
      hear(before, after, g.localId, "ai");
    }, own);
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => window.__buzz.filter(ms => ms === 10));
    assert.deepEqual(got, own ? [10] : [], "closing path ownership follows the piece rather than the next turn");
  }
  console.log("land: own closing path buzzes; opponent path handing over the turn stays quiet");
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
    window.__buzzTimes = [];
    const { hear } = await import("/src/lib/game/store.ts");
    hear(before, paid, me, "ai");
    isle.pulsePayers(paid);
    for (let i = 0; i < 200 && isle.payingPieces?.length; i++) isle.stepPayers(0.01, false);
    const own = { n: window.__buzz.filter((ms) => ms === 8).length, grants: (paid.lastProduction ?? []).length, buzz: window.__buzz.slice() };
    const other = paid.players.find(p => p.id !== me).id;
    const cases = [];
    for (const scenario of [
      { name: "opponent-only", owners: [other, other, other], mode: "online", spectator: false, expected: 0 },
      { name: "watcher", owners: [me, other, me], mode: "online", spectator: true, expected: 0 },
      { name: "mixed", owners: [me, other, me], mode: "online", spectator: false, expected: 2 },
      { name: "hotseat", owners: [other, other, other], mode: "hotseat", spectator: false, expected: 3 },
    ]) {
      const next = structuredClone(paid);
      corners.forEach((v, i) => next.vertices.find(c => c.id === v.id).building.playerId = scenario.owners[i]);
      next.current = other; // Local income still buzzes when an opponent rolls.
      next.seq += 1;
      g.setState({ state: next, mode: scenario.mode, spectator: scenario.spectator });
      isle.clearPayers();
      window.__buzz = []; window.__buzzTimes = []; window.__gainTicks = 0;
      isle.pulsePayers(next);
      for (let i = 0; i < 200 && isle.payingPieces?.length; i++) isle.stepPayers(0.01, false);
      cases.push({ name: scenario.name, expected: scenario.expected, buzz: window.__buzz.slice(), ticks: window.__gainTicks });
    }
    return { ...own, cases };
  });
  assert.equal(n.grants, 3, `pay setup: expected 3 grants, got ${n.grants}`);
  assert.equal(n.n, 3, `pay ticks: expected 3 buzzes of 8, got ${n.n} (${JSON.stringify(n.buzz)})`);
  console.log("pay: three pieces buzzed 8 each");
  for (const scenario of n.cases) {
    assert.deepEqual(scenario.buzz, Array(scenario.expected).fill(8), `${scenario.name}: only local owned pieces buzz`);
    assert.equal(scenario.ticks, 3, `${scenario.name}: all three payer sound ticks remain audible`);
  }
  console.log("pay: opponent-only and watcher silent; mixed pays only local pieces; hotseat pays all seats");
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
    const { yourTurn, haptic } = await import("/src/lib/sound.ts");
    yourTurn();
    haptic(10);
    haptic(8);
  });
  const got = await page.evaluate(() => window.__buzz.slice());
  assert.deepEqual(got, [], `desktop must ignore haptics, got ${JSON.stringify(got)}`);
  await page.getByRole("button", { name: "Table menu" }).click();
  const menu = page.getByRole("dialog", { name: "Table menu" });
  await menu.waitFor();
  assert.equal(await menu.getByTestId("haptics-toggle").count(), 0, "desktop has no ineffective Haptics row");
  await page.keyboard.press("Escape");
  console.log("desktop: coarse=false stays quiet and has no Haptics row");
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

async function eventGuardsProof(page) {
  await toPractice(page);
  const check = await page.evaluate(async () => {
    const g = window.__emberisle.getState();
    const { hear } = await import("/src/lib/game/store.ts");
    const sound = await import("/src/lib/sound.ts");
    const before = structuredClone(g.state), after = structuredClone(before);
    before.playedCard = false; after.playedCard = true;
    before.current = g.localId; after.current = after.players.find(p => p.id !== g.localId).id;
    window.__buzz = []; window.__buzzTimes = [];
    hear(before, after, g.localId, "ai");
    const fortune = [...window.__buzz];
    window.__buzz = []; window.__buzzTimes = [];
    hear(before, after, "", "online");
    const watchedFortune = [...window.__buzz];
    const won = structuredClone(before); won.phase = "over"; won.winner = g.localId;
    window.__buzz = []; window.__buzzTimes = [];
    hear(before, won, "", "online");
    const watchedWin = [...window.__buzz];
    window.__buzz = []; window.__buzzTimes = [];
    hear(before, won, g.localId, "online");
    const win = [...window.__buzz];
    sound.setMuted(true);
    window.__buzz = []; window.__buzzTimes = [];
    sound.yourTurn(); sound.haptic(10);
    const muted = [...window.__buzz];
    sound.setMuted(false);
    const vibrate = navigator.vibrate;
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    const unsupported = sound.hapticsAvailable();
    sound.haptic(10); sound.yourTurn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    return {fortune, watchedFortune, watchedWin, win, muted, unsupported};
  });
  assert.deepEqual(check.fortune, [10], "own fortune uses the acting seat before the turn advances");
  assert.deepEqual(check.watchedFortune, [], "watching a fortune stays quiet");
  assert.deepEqual(check.watchedWin, [], "watching a win stays quiet");
  assert.deepEqual(check.win, [20], "the winner receives the banner buzz");
  assert.deepEqual(check.muted, [], "table mute preserves the previous haptic mute behavior");
  assert.equal(check.unsupported, false, "missing navigator.vibrate is safely unsupported");
  console.log("events: own fortune and win buzz; watcher, mute and missing-vibrate guards pass");
}

async function tradeFramesProof(page) {
  await toPractice(page);
  const got = await page.evaluate(async () => {
    const { PROTO } = await import("/src/lib/net/proto.ts");
    const store = window.__emberisle;
    const NativeSocket = window.WebSocket;
    let socket;
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      constructor() { socket = this; setTimeout(() => this.onopen?.({}), 0); }
      send() {}
      close() { this.readyState = 3; this.onclose?.({}); }
    };
    try {
      store.getState().joinTable("HAPT");
      await new Promise(resolve => setTimeout(resolve, 0));
      const frame = msg => socket.onmessage({data: JSON.stringify(msg)});
      frame({type:"welcome", proto:PROTO, code:"HAPT", you:"s0", secret:"haptic-test-seat", host:false, chat:[]});
      const offer = {type:"tradeOffer", tradeId:"t1", from:"other", give:{timber:1}, want:{ore:1}, seconds:20};
      window.__buzz = []; window.__buzzTimes = [];
      frame(offer);
      const seated = [...window.__buzz];
      store.setState({spectator:true, localId:""});
      window.__buzz = []; window.__buzzTimes = [];
      frame({...offer, tradeId:"t2"});
      const watcher = [...window.__buzz];
      store.setState({spectator:false, localId:"other"});
      window.__buzz = []; window.__buzzTimes = [];
      frame({...offer, tradeId:"t3"});
      const own = [...window.__buzz];
      store.getState().net.close();
      return {seated, watcher, own};
    } finally { window.WebSocket = NativeSocket; }
  });
  assert.deepEqual(got.seated, [10], "a received offer buzzes the seated recipient");
  assert.deepEqual(got.watcher, [], "watchers receive no trade-offer haptic");
  assert.deepEqual(got.own, [], "the offer sender receives no trade-offer haptic");
  console.log("trade: received frames buzz only seated recipients, never watchers or the sender");
}

// Hold the optional download across a queued first native tap. UI/rejoin must not race registration.
// Runs against both transformed source and the actual production chunk graph (which shares React with index).
async function coldLoadProof(url, production) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let requested;
  const request = new Promise((resolve) => { requested = resolve; });
  const moduleURL = production ? /\/assets\/haptics-[\w-]+\.js(?:\?|$)/ : /\/src\/lib\/haptics\.tsx(?:\?|$)/;
  const page = await openPage({url, waitReady: false, beforeNavigate: async (page) => {
    await page.route(moduleURL, async (route) => { requested(); await held; await route.continue(); });
  }});
  let tap;
  try {
    await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(new Error("cold haptics module was not requested")), STEP_MS))]);
    await page.evaluate(() => {
      const store = window.__emberisle;
      const rejoin = store.getState().rejoinTable;
      window.__rejoins = 0;
      store.setState({rejoinTable: (...args) => { window.__rejoins++; return rejoin(...args); }});
    });
    let tapped = false;
    tap = page.getByRole("button", {name: "Four seats, one table", exact: true}).click({timeout: STEP_MS}).then(() => { tapped = true; });
    // This is an intentional held-download control, not an event deadline or retry.
    await page.waitForTimeout(250);
    assert.equal(tapped, false, "first native tap must wait for the optional module's registration");
    assert.equal(await page.evaluate(() => window.__rejoins), 0, "network rejoin waits for initialization too");
    assert.equal(await page.getByRole("button").count(), 0, "interactive controls are held before initialization");
    assert.equal(await page.locator("#splash").count(), 1, "the existing loading splash remains until initialization");
    release();
    await tap;
    assert.equal(await page.evaluate(() => window.__rejoins), 1, "bootstrap resumes rejoin exactly once after initialization");
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle?.lastState, null, {timeout: STEP_MS});
    // Roll real rules to the first legal outpost; the title tap was the only unlock gesture.
    for (let i = 0; i < 40; i++) {
      const phase = await page.evaluate(() => window.__emberisle.getState().state.phase);
      if (phase !== "rollOff") break;
      // Observe each button's real sound before the next roll, so this cold fixture does not
      // queue an artificial burst of UI clicks ahead of the first placement's recorded knock.
      const clicks = await page.evaluate(() => window.__uiClicks);
      await page.getByRole("button", {name: "Roll", exact: true}).click({timeout: STEP_MS});
      await page.waitForFunction((before) => window.__uiClicks > before, clicks, {timeout: STEP_MS});
    }
    assert.equal(await page.evaluate(() => window.__emberisle.getState().state.phase), "setupSettle");
    await clearBuzz(page);
    await page.evaluate(() => {
      const g = window.__emberisle.getState();
      window.__knocks = [];
      const id = g.highlights().vertices[0];
      if (!id) throw new Error("cold first outpost has no legal vertex");
      g.pickVertex(id);
    });
    await page.waitForFunction(() => window.__buzz.includes(10) && window.__knocks.length, null, {timeout: STEP_MS});
    const delta = await page.evaluate(() => Math.abs(window.__buzzTimes[window.__buzz.indexOf(10)] - window.__knocks[0]));
    assert.ok(delta <= 100, `cold first land buzz follows its knock within 100 ms (got ${delta})`);
    await page.getByRole("button", {name: "Table menu", exact: true}).click();
    const toggle = page.getByTestId("haptics-toggle");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false", "cold-loaded React row updates");
    console.log(`cold ${production ? "production" : "source"}: held first tap, first legal land buzz ${Math.round(delta)} ms from knock, live menu toggle`);
  } finally {
    release();
    await tap?.catch(() => {});
    await page.close();
  }
}

async function skippedLoadProof(url, {coarse = false, missingAPI = false} = {}) {
  const loads = [];
  const page = await openPage({url, coarse, missingAPI, beforeNavigate: async (page) => {
    page.on("request", (request) => { if (/\/haptics(?:-[\w-]+\.js|\.tsx)/.test(request.url())) loads.push(request.url()); });
  }});
  await page.getByRole("button", {name: "Four seats, one table", exact: true}).click();
  await page.getByRole("button", {name: "Table menu", exact: true}).click();
  assert.equal(await page.getByTestId("haptics-toggle").count(), 0, "unsupported cold load has no haptics row");
  assert.deepEqual(loads, [], "unsupported cold load never downloads optional haptics");
  assert.deepEqual(await page.evaluate(() => window.__buzz), []);
  await page.close();
  console.log(`cold skip: coarse=${coarse}, missingAPI=${missingAPI}; no module, row or buzz`);
}

async function unavailableModuleProof(url) {
  const page = await openPage({url, beforeNavigate: async (page) => {
    await page.route(/\/assets\/haptics-[\w-]+\.js(?:\?|$)/, (route) => route.fulfill({
      status: 200, contentType: "application/javascript", body: 'throw new Error("optional motor unavailable");',
    }));
  }});
  await page.getByRole("button", {name: "Four seats, one table", exact: true}).click();
  await page.getByRole("button", {name: "Table menu", exact: true}).click();
  assert.equal(await page.getByTestId("haptics-toggle").count(), 0, "a failed optional module leaves a usable game without its row");
  assert.deepEqual(await page.evaluate(() => window.__buzz), []);
  await page.close();
  console.log("cold failure: rejected optional module leaves the game and table menu usable");
}

async function changedPointerProof(page) {
  const got = await page.evaluate(async () => {
    const sound = await import("/src/lib/sound.ts");
    window.__coarse = false;
    window.__buzz = [];
    sound.haptic(10);
    return {available: sound.hapticsAvailable(), buzz: window.__buzz};
  });
  assert.equal(got.available, false, "loaded haptics rechecks the current pointer");
  assert.deepEqual(got.buzz, [], "a phone changed to a fine pointer stays quiet");
  console.log("pointer change: loaded motor still enforces the current coarse-pointer guard");
}

let served;
let code = 0;
try {
  served = await preview({preview: {host: "127.0.0.1", port: PORT + 1, strictPort: true}, logLevel: "error"});
  const builtURL = `http://127.0.0.1:${PORT + 1}/`;
  await coldLoadProof(`http://127.0.0.1:${PORT}/`, false);
  await coldLoadProof(builtURL, true);
  await skippedLoadProof(builtURL);
  await skippedLoadProof(builtURL, {coarse: true, missingAPI: true});
  await unavailableModuleProof(builtURL);
  { const page = await openPage(); await changedPointerProof(page); await page.close(); }
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
  {
    const page = await openPage({ coarse: true });
    await eventGuardsProof(page);
    await page.close();
  }
  {
    const page = await openPage({ coarse: true });
    await tradeFramesProof(page);
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
  if (served) await new Promise((resolve) => served.httpServer.close(resolve));
  process.exit(code);
}
