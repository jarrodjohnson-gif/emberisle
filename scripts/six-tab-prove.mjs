// #1612 six players 9: a whole six-seat game in six real browser tabs against server/host.mjs (the host's timer rules are in
// server/expanded-timers-prove.mjs). Tabs at 1280x720 (the host), 390x844 and 844x390 (touch), twice each:
// - the host picks Seats 6 and "Win at 7 points" from the real Play page and lobby; five tabs join with the code; all
//   press Ready, the host presses Start, and every tab gets the six-seat expanded game;
// - roll-off and setup by all six (each roll is the real Roll button; each placement is the practice bot's own choice for
//   that seat, sent through the tab's store dispatch, as a tap on the board would send it);
// - real primary and partner turns: on every tab the status line names the actor and its role, only the primary has Roll
//   and only before its roll, a partner has no Roll and has End turn, the other tabs have neither, and every tab's
//   countdown names the actor;
// - countdown continuity: the acting tab of a partner turn and of a primary turn is reloaded mid turn; it rejoins on the
//   same deadline, its countdown carries on from where it was and is never back at the full window;
// - a seven (the host's dice are queued: a 3 and a 4) with at least two tabs over seven cards: each tab that owes a
//   discard sees its own picker with its own hand, the others see none; no tab's store and no message any tab received
//   in the whole game carries another seat's hand; the discards are picked and sent through the real picker;
// - play on to the win (target 7; every move the practice bot's choice through the store, the host's dice never a seven
//   unless queued), the win screen on all six, the host presses Play again and the rematch starts on every tab with each
//   seat keeping its number and colour;
// - zero page errors.
// The host runs TURN_MS = TURN_TOTAL_MS = 28 s, so the countdown shows from the start of a window and a reload cannot
// buy a fresh one (the design: a reconnect never resets the turn budget). Every failure is listed before the run fails.
// SHOTS=1 writes real PNGs at device scale 2 into docs/proofs/1612/: a partner turn seen by the partner and by another
// seat, the discard picker, and the win screen, at 390x844 and 1280x720.
// Run one browser proof at a time: flock /tmp/claude-0/browser.lock npm run six-tab-prove
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1612";
const TURN = 28_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
];
const NAMES = ["Hana", "Gus", "Ivy", "Olaf", "Pia", "Rex"];
// Only these two tabs are pictured. Software WebGL at scale 2 is slow, so no tab draws the island except while its
// picture is taken: six tabs drawing all game long would run the turn windows out.
const DRAWN = [0, 1];
const t0 = Date.now();

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-six-tab-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
// The host's dice: queued faces first, else a seeded pair that never makes seven.
const DICE = path.join(ROOMS_DIR, "dice.txt");
writeFileSync(DICE, "");
writeFileSync(
  path.join(ROOMS_DIR, "dice.mjs"),
  `import { readFileSync } from "node:fs";
let n = 0, s = 1612, second = null;
const next = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 16) % 6 + 1;
crypto.getRandomValues = (buf) => {
  const faces = readFileSync(${JSON.stringify(DICE)}, "utf8").split(",").filter(Boolean).map(Number);
  for (let i = 0; i < buf.length; i++) {
    let f;
    if (n < faces.length) f = faces[n++];
    else if (second !== null) (f = second), (second = null);
    else {
      f = next();
      let b = next();
      while (f + b === 7) b = next();
      second = b;
    }
    buf[i] = f - 1;
  }
  return buf;
};
`,
);
const queueDice = (...faces) => appendFileSync(DICE, `${faces.join(",")},`);
const host = spawn(process.execPath, ["--import", path.join(ROOMS_DIR, "dice.mjs"), "--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR: `${ROOMS_DIR}/profiles`, ACT_CAP: "5000", ACT_RATE: "5000", TURN_MS: String(TURN), TURN_TOTAL_MS: String(TURN), GRACE_MS: "600000", HOLD_MS: "600000", LOBBY_HOLD_MS: "600000" },
});
let hostErr = "";
host.stderr.on("data", (d) => (hostErr += d));
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, optimizeDeps: { entries: ["index.html", "src/**/*.{ts,tsx}"] }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const { chooseBotAction } = await vite.ssrLoadModule("/src/lib/game/ai.ts");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

const errors = [];
const failures = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  } else console.log(`ok   ${msg}`);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = SHOTS ? 120_000 : 20_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(50);
  }
};
const tap = (t, loc) => (t.v.touch ? loc.tap() : loc.click());
const store = (t, fn, arg) => t.page.evaluate(fn, arg);
// Every snapshot also walks the tab's store for another seat's hand (window.__privacy), except a finished game's.
async function snap(t) {
  const s = await store(t, () => {
    const g = window.__emberisle.getState();
    const leak = g.state && g.state.phase !== "over" ? window.__privacy({ game: g.state }, g.localId) : [];
    return { state: g.state, localId: g.localId, legal: g.legal, screen: g.screen, timer: g.turnTimer, leak };
  });
  t.snaps++;
  if (s.leak.length) t.storeLeaks.push(`seq ${s.state.seq}: ${s.leak.join(", ")}`);
  return s;
}

async function tab(i) {
  const v = VIEWS[i];
  const name = NAMES[i];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
  ctx.setDefaultTimeout(SHOTS ? 120_000 : 30_000);
  const page = await ctx.newPage();
  const t = { i, ctx, page, name, v, label: `${name} ${v.tag}`, messages: 0, overFrames: 0, leaks: [], snaps: 0, storeLeaks: [] };
  page.on("console", (m) => m.type() === "error" && errors.push(`${t.label}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${t.label}: ${e}`));
  // Every frame the host sends this tab, read before the app sees it, and walked whole (window.__privacy): another seat's
  // hand or fortunes, under any key, is a leak. Reported to the proof, so a reload keeps the tally.
  await page.exposeFunction("__frame", (leak, over) => {
    t.messages++;
    if (over) t.overFrames++;
    if (leak) t.leaks.push(leak);
  });
  await page.addInitScript((name) => {
    localStorage.setItem("emberisle-name", name);
    // Anything shaped like a hand, wherever it sits and whatever its key: a map with all five goods, a map with all five
    // fortune kinds holding any card, or a list of fortune cards. Its owner is the nearest enclosing player record
    // (id p0 to p5). Allowed: this seat's own, and the bank. Card counts (`goods`, `fortunes`) are public totals, and a
    // seat's zeroed fortune placeholders carry nothing.
    const GOODS = ["timber", "clay", "wool", "grain", "ore"];
    const FORTUNES = ["knight", "road", "plenty", "monopoly", "vp"];
    window.__privacy = (root, me) => {
      const bad = [];
      const walk = (x, at, owner) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) {
          if (x.length && x.every((y) => FORTUNES.includes(y)) && owner !== me) bad.push(`${at}: fortune cards of ${owner ?? "no seat"}`);
          return x.forEach((y, k) => walk(y, `${at}[${k}]`, owner));
        }
        if (typeof x.id === "string" && /^p\d$/.test(x.id)) owner = x.id;
        if (GOODS.every((r) => typeof x[r] === "number") && at !== ".game.bank" && owner !== me) bad.push(`${at}: goods of ${owner ?? "no seat"}`);
        if (FORTUNES.every((f) => typeof x[f] === "number") && FORTUNES.some((f) => x[f] > 0) && owner !== me) bad.push(`${at}: fortunes of ${owner ?? "no seat"}`);
        for (const [k, y] of Object.entries(x)) walk(y, `${at}.${k}`, owner);
      };
      walk(root, "", null);
      return bad;
    };
    let me = null;
    // The host reveals every seat's record with the finished game on purpose (viewFor and watchView, "over"; the win screen
    // shows each seat's hidden points), so only a state frame whose game is over is exempt. Every other frame is walked.
    const scan = (m) => {
      if (m?.type === "state" && typeof m.you === "string") me = m.you;
      if (m?.type === "state" && m.game?.phase === "over") return [null, true];
      const bad = window.__privacy(m, me);
      return [bad.length ? `${m.type}: ${bad.join(", ")} (seat ${me})` : null, false];
    };
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(...a) {
        super(...a);
        this.addEventListener("message", (e) => {
          let out;
          try {
            out = scan(JSON.parse(e.data));
          } catch (err) {
            out = [`a frame the scan could not read: ${err}`, false];
          }
          window.__frame(...out);
        });
      }
    };
  }, name);
  await page.addInitScript(() => {
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const draw = WebGL2RenderingContext.prototype[fn];
      WebGL2RenderingContext.prototype[fn] = function (...a) {
        return window.__draw ? draw.apply(this, a) : undefined;
      };
    }
  });
  await page.goto(url);
  await page.getByTestId("title-card").waitFor();
  return t;
}

async function playPage(t) {
  if ((await t.page.getByTestId("title-card").getAttribute("data-page")) === "front") await tap(t, t.page.getByRole("button", { name: "Play", exact: true }));
  await t.page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();
}

async function shot(t, name) {
  if (!SHOTS) return;
  await t.page.evaluate(() => (window.__draw = true));
  await sleep(1500);
  await t.page.screenshot({ path: `${SHOT_DIR}/${name}-${t.v.tag}.png` });
  await t.page.evaluate(() => (window.__draw = false));
  console.log(`shot ${SHOT_DIR}/${name}-${t.v.tag}.png`);
}

// Every tab at the same game step; that step's snapshots, in tab order.
async function same(tabs, what) {
  return until(async () => {
    const all = await Promise.all(tabs.map(snap));
    const seq = all[0].state?.seq;
    return all.every((s) => s.state && s.state.seq === seq) ? all : null;
  }, `every tab at one step: ${what}`);
}
const seatOf = (snaps, pid) => snaps.findIndex((s) => s.localId === pid);
const nameOf = (g, pid) => g.players.find((p) => p.id === pid).name;

// Who acts now, and what the practice bot would do for that seat. `plain`: roll and pass only, no builds.
function nextMove(snaps, plain) {
  const g = snaps[0].state;
  if (g.phase === "over") return null;
  const k = g.phase === "discard" ? snaps.findIndex((s) => s.legal?.discard > 0) : seatOf(snaps, g.current);
  if (k < 0) return null;
  const mine = snaps[k];
  let action;
  if (g.phase === "roll" || g.phase === "rollOff") action = { type: "roll" };
  else if (g.phase === "main" && plain) action = { type: "endTurn" };
  else action = chooseBotAction(mine.state, mine.localId) ?? (g.phase === "main" ? { type: "endTurn" } : null);
  return action && { k, action };
}

// One move through tab k's store, as a tap would send it; waits until every tab has the host's answer. A move the host
// refuses (a bot choice the rules turn down) is followed by End turn in the action phase.
async function send(tabs, k, action) {
  const t = tabs[k];
  const before = (await snap(t)).state.seq;
  await store(t, (a) => window.__emberisle.getState().dispatch(a), action);
  const moved = await until(async () => ((await snap(t)).state.seq > before ? true : (await store(t, () => window.__emberisle.getState().error)) ? "refused" : null), `${t.label} ${action.type}`).catch(() => "refused");
  if (moved === "refused") {
    await store(t, () => window.__emberisle.setState({ error: null }));
    const g = (await snap(t)).state;
    if (g.phase === "main" && g.current === (await snap(t)).localId) await store(t, () => window.__emberisle.getState().dispatch({ type: "endTurn" }));
  }
  return same(tabs, `${t.label} ${action.type}`);
}

// What every tab shows for the actor now: the status line, Roll, End turn and the countdown.
async function turnView(tabs, snaps, label) {
  const g = snaps[0].state;
  const actor = seatOf(snaps, g.current);
  const name = nameOf(g, g.current);
  const partner = g.role === "partner";
  for (const [k, t] of tabs.entries()) {
    const mine = k === actor;
    const want = mine ? (partner ? "Your partner turn" : g.phase === "roll" ? "Roll the dice" : "Your turn") : partner ? `${name}'s partner turn` : g.phase === "roll" ? `Wait for ${name} to roll` : `Wait for ${name} to build or trade`;
    const banner = t.page.getByTestId("turn-banner");
    await until(async () => (await banner.textContent().catch(() => null)) === want, `${t.label} reads "${want}"`).catch(() => {});
    check((await banner.textContent()) === want, `${label}: ${t.label} reads "${await banner.textContent()}" (want "${want}")`);
    const roll = await t.page.getByRole("button", { name: "Roll", exact: true }).count();
    const end = await t.page.getByRole("button", { name: "End turn", exact: true }).count();
    const rollWant = mine && !partner && g.phase === "roll" ? 1 : 0;
    const endWant = mine && g.phase === "main" ? 1 : 0;
    check(roll === rollWant && end === endWant, `${label}: ${t.label} has Roll ${roll}/${rollWant}, End turn ${end}/${endWant}`);
    const chip = t.page.getByTestId("turn-countdown");
    await until(async () => (await chip.count()) && (await chip.getAttribute("data-player")) === g.current, `${t.label} countdown on ${name}`).catch(() => {});
    const on = (await chip.count()) ? await chip.getAttribute("data-player") : null;
    const text = on ? await chip.textContent() : null;
    check(on === g.current && text.startsWith(mine ? "You:" : `${name}:`), `${label}: ${t.label} countdown "${text}" is the actor's`);
  }
}

// The acting tab reloads mid turn: it is back on the same deadline, and its countdown carries on.
// `slow`: the reloaded page gets expanded.ts 3 s late, so the state that rejoins it waits behind the chunk; the countdown
// must still read the host's time, not run late by the wait.
async function reloadKeeps(tabs, label, slow = false) {
  let snaps = await same(tabs, `${label} before the reload`);
  const g = snaps[0].state;
  const k = seatOf(snaps, g.current);
  const t = tabs[k];
  const chip = t.page.getByTestId("turn-countdown");
  await until(() => chip.count(), `${t.label} countdown before the reload`);
  // Some way into the window, so a fresh one would show.
  await until(async () => Number(await chip.getAttribute("data-seconds")) <= TURN / 1000 - 6, `${t.label} countdown 6 s in`);
  const before = { secs: Number(await chip.getAttribute("data-seconds")), deadline: snaps[k].timer.deadline, at: Date.now() };
  const chunk = /\/src\/lib\/game\/expanded\.ts/;
  if (slow) await t.page.route(chunk, async (route) => {
    await sleep(3000);
    await route.continue();
  });
  await t.page.reload();
  await t.page.waitForFunction(() => window.__emberisle?.getState().screen === "play" && window.__emberisle.getState().turnTimer, null, { timeout: 30_000 });
  await until(async () => (await chip.count()) && (await chip.getAttribute("data-player")) === g.current, `${t.label} countdown after the reload`);
  const after = { secs: Number(await chip.getAttribute("data-seconds")), deadline: (await snap(t)).timer.deadline, at: Date.now() };
  if (slow) await t.page.unroute(chunk);
  const gone = Math.floor((after.at - before.at) / 1000);
  snaps = await same(tabs, `${label} after the reload`);
  check(snaps[k].state.current === g.current && snaps[k].state.seq === g.seq, `${label}: ${t.label} reloads into the same turn (seq ${g.seq})`);
  check(Math.abs(after.deadline - before.deadline) <= 1000, `${label}: ${t.label} is back on the same deadline (moved ${after.deadline - before.deadline} ms)`);
  check(after.secs <= before.secs - gone + 1 && after.secs >= before.secs - gone - 2, `${label}: ${t.label} countdown ${before.secs} s, reloaded ${after.at - before.at} ms, then ${after.secs} s`);
  check(after.secs <= TURN / 1000 - 5, `${label}: ${t.label} countdown is not back at the full ${TURN / 1000} s`);
  for (const o of tabs) if (o !== t) check(Math.abs((await snap(o)).timer.deadline - before.deadline) <= 1000, `${label}: ${o.label} counts down to the same deadline`);
  console.log(`${label}: ${t.label} reloaded in ${after.at - before.at} ms, countdown ${before.secs} s -> ${after.secs} s`);
  return snaps;
}

try {
  const tabs = [];
  // ---- Host a six-seat table from the Play page; five join by code. ----
  const h = await tab(0);
  tabs.push(h);
  await playPage(h);
  const options = h.page.getByTestId("wayfarer-setup");
  if (!(await options.evaluate((d) => d.open))) await tap(h, options.locator("summary"));
  await h.page.getByRole("combobox", { name: "Seats", exact: true }).selectOption("6");
  await tap(h, h.page.getByRole("button", { name: "Host a table", exact: true }));
  await h.page.getByTestId("table-code").waitFor();
  const code = (await h.page.getByTestId("table-code").textContent()).trim();
  check((await store(h, () => window.__emberisle.getState().tableVariant)) === "expanded", `Seats 6 hosts an expanded table (${code})`);
  await tap(h, h.page.getByRole("radio", { name: "7 points", exact: true }));
  for (let i = 1; i < 6; i++) {
    const t = await tab(i);
    tabs.push(t);
    await playPage(t);
    await t.page.getByPlaceholder("Code").fill(code);
    await t.page.getByPlaceholder("Code").press("Enter");
    await t.page.getByTestId("table-code").waitFor();
  }
  await until(async () => (await h.page.locator('[data-testid="lobby-players"] > li span.rounded-full').count()) >= 6, "six seated");
  check((await tabs[5].page.getByTestId("victory-target").getAttribute("data-value")) === "7", "a guest's lobby reads the 7 point target");
  for (const t of tabs) await tap(t, t.page.getByRole("button", { name: "Ready", exact: true }));
  await until(async () => (await h.page.getByRole("button", { name: "Start", exact: true }).count()) === 1, "Start");
  await tap(h, h.page.getByRole("button", { name: "Start", exact: true }));
  let snaps = await until(async () => {
    const all = await Promise.all(tabs.map(snap));
    return all.every((s) => s.screen === "play" && s.state?.players.length === 6) ? all : null;
  }, "the game on every tab");
  const g0 = snaps[0].state;
  check(g0.variant?.kind === "expanded" && g0.hexes.length === 30 && g0.victoryTarget === 7, `every tab has the expanded island, target ${g0.victoryTarget}`);
  check(new Set(snaps.map((s) => s.localId)).size === 6, "six tabs, six seats");
  const identity = Object.fromEntries(g0.players.map((p) => [p.name, { seat: p.seat, color: p.color }]));
  check(JSON.stringify(g0.players.map((p) => p.seat).sort()) === "[1,2,3,4,5,6]" && new Set(g0.players.map((p) => p.color)).size === 6, "seats 1 to 6 in six colours");
  console.log(`table ${code}: ${tabs.map((t) => t.label).join(", ")}`);

  // ---- Roll-off and setup: rolls through the real Roll button, placements as the bot chooses. ----
  let rolls = 0;
  for (let n = 0; n < 200; n++) {
    snaps = await same(tabs, "setup");
    const g = snaps[0].state;
    if (g.role) break;
    const move = nextMove(snaps, true);
    if (!move) {
      await sleep(50);
      continue;
    }
    if (move.action.type === "roll") {
      const t = tabs[move.k];
      await tap(t, t.page.getByRole("button", { name: "Roll", exact: true }));
      await until(async () => (await snap(t)).state.seq > g.seq, `${t.label} roll-off roll`);
      rolls++;
    } else await send(tabs, move.k, move.action);
  }
  snaps = await same(tabs, "setup done");
  const g1 = snaps[0].state;
  check(g1.role === "primary" && g1.phase === "roll" && g1.vertices.filter((v) => v.building).length === 12, `setup done by all six: 12 outposts, ${rolls} roll-off rolls by the Roll button, the first primary to roll`);

  // ---- Real primary and partner turns, two paired turns' worth, with a reload of each kind. ----
  const shotsDone = new Set();
  let reloadedPartner = false;
  let reloadedPrimary = false;
  for (let activations = 0; activations < 14; ) {
    snaps = await same(tabs, "turns");
    const g = snaps[0].state;
    const label = `activation ${g.activation} (${g.role} ${nameOf(g, g.current)}, ${g.phase})`;
    if (g.phase === "roll" || g.phase === "main") await turnView(tabs, snaps, label);
    const actor = seatOf(snaps, g.current);
    if (g.role === "partner") {
      if (!reloadedPartner) {
        snaps = await reloadKeeps(tabs, `${label} partner reload, expanded.ts 3 s late`, true);
        reloadedPartner = true;
      }
      for (const k of DRAWN) {
        const kind = k === actor ? "partner-actor" : "partner-other";
        if (!shotsDone.has(`${kind}-${k}`)) {
          shotsDone.add(`${kind}-${k}`);
          await shot(tabs[k], kind);
        }
      }
    }
    if (g.role === "primary" && g.phase === "roll" && !reloadedPrimary && activations > 0) {
      snaps = await reloadKeeps(tabs, `${label} primary reload`);
      reloadedPrimary = true;
    }
    if (g.role === "primary" && g.phase === "roll") {
      // The primary rolls with the real button.
      const t = tabs[actor];
      await tap(t, t.page.getByRole("button", { name: "Roll", exact: true }));
      await until(async () => (await snap(t)).state.seq > g.seq, `${t.label} rolls`);
      continue;
    }
    const move = nextMove(snaps, true);
    if (g.phase === "main") activations++;
    await send(tabs, move.k, move.action);
    if (activations >= 12 && DRAWN.every((k) => shotsDone.has(`partner-actor-${k}`) && shotsDone.has(`partner-other-${k}`))) break;
  }
  check(reloadedPartner && reloadedPrimary, "the acting tab was reloaded on a partner turn and on a primary turn");
  console.log(`turns: ${((Date.now() - t0) / 1000).toFixed(0)} s in`);

  // ---- A seven: the two drawn tabs only roll and pass, the others build as the bot would, until the two hold over seven
  // and another tab does not; then a 3 and a 4. ----
  const hand = (s) => Object.values(s.state.players.find((p) => p.id === s.localId).resources).reduce((a, b) => a + b, 0);
  for (let n = 0; n < 600; n++) {
    snaps = await same(tabs, "hands grow");
    const g = snaps[0].state;
    if (g.role === "primary" && g.phase === "roll" && DRAWN.every((k) => hand(snaps[k]) >= 8) && snaps.some((x) => hand(x) < 8)) break;
    const move = nextMove(snaps, DRAWN.includes(seatOf(snaps, g.current)));
    if (move) await send(tabs, move.k, move.action);
  }
  snaps = await same(tabs, "before the seven");
  const gs = snaps[0].state;
  const roller = seatOf(snaps, gs.current);
  const sizes = snaps.map(hand);
  check(DRAWN.every((k) => sizes[k] >= 8) && sizes.some((n) => n < 8), `hands before the seven: ${sizes.join(" ")}`);
  queueDice(3, 4);
  await tap(tabs[roller], tabs[roller].page.getByRole("button", { name: "Roll", exact: true }));
  snaps = await until(async () => {
    const all = await same(tabs, "the seven");
    return all[0].state.phase === "discard" ? all : null;
  }, "the discard phase");
  const owe = snaps.map((s, k) => (s.state.discardNeeded[s.localId] ?? 0) > 0 ? k : -1).filter((k) => k >= 0);
  check(owe.length >= 2 && DRAWN.every((k) => owe.includes(k)) && snaps.every((s, k) => owe.includes(k) === sizes[k] >= 8), `a seven: ${owe.map((k) => tabs[k].label).join(", ")} owe a discard, every tab over seven and no other`);
  for (const [k, t] of tabs.entries()) {
    const s = snaps[k];
    const picker = t.page.getByTestId("discard-pick");
    if (owe.includes(k)) {
      await picker.waitFor();
      const n = s.state.discardNeeded[s.localId];
      check((await t.page.getByTestId("turn-banner").textContent()) === `Discard ${n} goods`, `${t.label} reads "Discard ${n} goods"`);
      const owned = await t.page.$$eval('[data-testid="discard-pick"] [data-testid="trade-owned"]', (els) => els.map((e) => Number(e.lastChild.textContent)));
      const mine = s.state.players.find((p) => p.id === s.localId).resources;
      check(JSON.stringify(owned) === JSON.stringify(["timber", "clay", "wool", "grain", "ore"].map((r) => mine[r])), `${t.label}'s picker shows its own hand (${owned.join(" ")})`);
      check((await t.page.getByTestId("discard-count").textContent()) === `0 of ${n}`, `${t.label}'s picker counts 0 of ${n}`);
    } else {
      check((await picker.count()) === 0, `${t.label} has no discard picker`);
      check((await t.page.getByTestId("turn-banner").textContent()) === "Wait for discards", `${t.label} reads "Wait for discards"`);
    }
    const others = s.state.players.filter((p) => p.id !== s.localId);
    check(others.every((p) => !("resources" in p)), `${t.label}'s store holds no other seat's hand`);
  }
  for (const k of DRAWN) if (owe.includes(k)) await shot(tabs[k], "discard");
  // Each discard through the real picker: one tap per card, then "Discard N".
  for (const k of owe) {
    const t = tabs[k];
    const s = await snap(t);
    let n = s.state.discardNeeded[s.localId];
    const mine = s.state.players.find((p) => p.id === s.localId).resources;
    for (const r of ["timber", "clay", "wool", "grain", "ore"]) {
      for (let c = 0; c < mine[r] && n > 0; c++, n--) await tap(t, t.page.locator(`[data-testid="trade-discard-${r}"] .trade-add`));
    }
    const need = s.state.discardNeeded[s.localId];
    await tap(t, t.page.getByRole("button", { name: `Discard ${need}`, exact: true }));
    await until(async () => !((await snap(t)).state.discardNeeded[s.localId] > 0), `${t.label} discards`);
    check(hand(await snap(t)) === sizes[k] - need, `${t.label} discarded ${need} through the picker`);
  }
  snaps = await same(tabs, "after the discards");
  check(snaps[0].state.phase === "robber", `after the discards the roller moves the wayfarer (${snaps[0].state.phase})`);

  // ---- Play on to the win: every move the practice bot's choice. ----
  for (let n = 0; n < 6000; n++) {
    snaps = await same(tabs, "play on");
    if (snaps[0].state.phase === "over") break;
    const move = nextMove(snaps, false);
    if (move) await send(tabs, move.k, move.action);
  }
  snaps = await same(tabs, "the win");
  const gw = snaps[0].state;
  check(gw.phase === "over" && gw.winner, `the game is won by ${gw.winner && nameOf(gw, gw.winner)} at activation ${gw.activation}`);
  for (const t of tabs) {
    await t.page.getByTestId("win-screen").waitFor();
    check(await t.page.getByTestId("win-screen").isVisible(), `${t.label} shows the win screen: "${(await t.page.getByTestId("win-headline").textContent()).trim()}"`);
    check((await t.page.getByTestId("win-row").count()) === 6, `${t.label}'s win screen lists six seats`);
  }
  for (const k of DRAWN) await shot(tabs[k], "win");
  console.log(`win: ${((Date.now() - t0) / 1000).toFixed(0)} s in`);

  // ---- The host presses Play again: every seat keeps its number and colour. ----
  check((await tabs[0].page.getByTestId("win-again").count()) === 1, "the host has Play again");
  await tap(tabs[0], tabs[0].page.getByTestId("win-again"));
  snaps = await until(async () => {
    const all = await Promise.all(tabs.map(snap));
    return all.every((s) => s.state && s.state.phase !== "over" && s.state.seq < gw.seq) ? all : null;
  }, "the rematch on every tab");
  const gr = snaps[0].state;
  check(gr.variant?.kind === "expanded" && gr.players.length === 6, "the rematch is a six-seat expanded game");
  check(gr.players.every((p) => identity[p.name]?.seat === p.seat && identity[p.name]?.color === p.color), `every seat keeps its number and colour (${gr.players.map((p) => `${p.name} ${p.seat}`).join(", ")})`);
  check(gr.players[0].name === nameOf(gw, gw.winner), `the winner, ${nameOf(gw, gw.winner)}, goes first`);
  check(snaps.every((s) => s.screen === "play" && s.state.players.length === 6), "every tab is in the rematch");
  for (const t of tabs) {
    check(t.messages >= 200, `${t.label} received ${t.messages} frames from the host (${t.overFrames} of a finished game)`);
    check(!t.leaks.length, `${t.label}: none of ${t.messages - t.overFrames} walked frames carried another seat's hand ${t.leaks.slice(0, 3).join(" | ")}`);
    check(t.snaps >= 100 && !t.storeLeaks.length, `${t.label}: none of ${t.snaps} store snapshots held another seat's hand ${t.storeLeaks.slice(0, 3).join(" | ")}`);
  }
} catch (e) {
  failures.push(String(e?.stack ?? e));
  console.log(`FAIL ${e?.stack ?? e}`);
  if (hostErr) console.log(hostErr.slice(-2000));
}
check(!errors.length, `no page errors ${errors.join(" | ")}`);
await browser.close();
await vite.close();
const took = ((Date.now() - t0) / 1000).toFixed(0);
if (failures.length) {
  console.log(`six-tab-prove: ${failures.length} failure(s) in ${took} s`);
  process.exit(1);
}
console.log(`six-tab-prove: all checks passed in ${took} s (six tabs at 1280x720, 390x844 and 844x390)`);
process.exit(0);
