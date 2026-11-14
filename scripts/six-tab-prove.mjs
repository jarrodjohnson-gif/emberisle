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
// Only these two tabs draw the island, and only for pictures: software WebGL at scale 2 is slow.
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
const snap = (t) => store(t, () => { const g = window.__emberisle.getState(); return { state: g.state, localId: g.localId, legal: g.legal, screen: g.screen, timer: g.turnTimer }; });

async function tab(i) {
  const v = VIEWS[i];
  const name = NAMES[i];
  const drawn = SHOTS && DRAWN.includes(i);
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
  ctx.setDefaultTimeout(SHOTS ? 120_000 : 30_000);
  const page = await ctx.newPage();
  const t = { i, ctx, page, name, v, label: `${name} ${v.tag}`, messages: 0, leaks: [] };
  page.on("console", (m) => m.type() === "error" && errors.push(`${t.label}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${t.label}: ${e}`));
  // Every frame the host sends this tab, read before the app sees it: a player record other than this seat's that carries
  // its hand (`resources`) is a leak. Reported to the proof, so a reload keeps the tally.
  await page.exposeFunction("__frame", (leak) => {
    t.messages++;
    if (leak) t.leaks.push(leak);
  });
  await page.addInitScript((name) => {
    localStorage.setItem("emberisle-name", name);
    let me = null;
    const scan = (m) => {
      if (m?.type === "state" && typeof m.you === "string") me = m.you;
      const bad = [];
      const walk = (x, at) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach((y, k) => walk(y, `${at}[${k}]`));
        if (typeof x.id === "string" && /^p\d$/.test(x.id) && "resources" in x && x.id !== me && m.game?.phase !== "over") bad.push(`${m.type} ${at} ${x.id}`);
        for (const [k, y] of Object.entries(x)) walk(y, `${at}.${k}`);
      };
      walk(m, "");
      return bad.length ? `${bad.join(", ")} (seat ${me})` : null;
    };
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(...a) {
        super(...a);
        this.addEventListener("message", (e) => {
          try {
            window.__frame(scan(JSON.parse(e.data)));
          } catch {}
        });
      }
    };
  }, name);
  if (!drawn)
    await page.addInitScript(() => {
      for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) WebGL2RenderingContext.prototype[fn] = function () {};
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
  await sleep(800);
  await t.page.screenshot({ path: `${SHOT_DIR}/${name}-${t.v.tag}.png` });
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
async function reloadKeeps(tabs, label) {
  let snaps = await same(tabs, `${label} before the reload`);
  const g = snaps[0].state;
  const k = seatOf(snaps, g.current);
  const t = tabs[k];
  const chip = t.page.getByTestId("turn-countdown");
  await until(() => chip.count(), `${t.label} countdown before the reload`);
  // Some way into the window, so a fresh one would show.
  await until(async () => Number(await chip.getAttribute("data-seconds")) <= TURN / 1000 - 6, `${t.label} countdown 6 s in`);
  const before = { secs: Number(await chip.getAttribute("data-seconds")), deadline: snaps[k].timer.deadline, at: Date.now() };
  await t.page.reload();
  await t.page.waitForFunction(() => window.__emberisle?.getState().screen === "play" && window.__emberisle.getState().turnTimer, null, { timeout: 30_000 });
  await until(async () => (await chip.count()) && (await chip.getAttribute("data-player")) === g.current, `${t.label} countdown after the reload`);
  const after = { secs: Number(await chip.getAttribute("data-seconds")), deadline: (await snap(t)).timer.deadline, at: Date.now() };
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
      for (const k of DRAWN) {
        const kind = k === actor ? "partner-actor" : "partner-other";
        if (!shotsDone.has(`${kind}-${k}`)) {
          shotsDone.add(`${kind}-${k}`);
          await shot(tabs[k], kind);
        }
      }
      if (!reloadedPartner) {
        snaps = await reloadKeeps(tabs, `${label} partner reload`);
        reloadedPartner = true;
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
