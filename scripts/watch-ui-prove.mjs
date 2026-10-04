// #348: the spectator view in the browser (docs/design/spectator.md). Two headless tabs and one src/lib/net/table.ts
// client seat a table; a third tab's Watch sends nothing under 4 characters and is refused on the lobby ("Not started
// yet."), then watches after the start
// through a ?watch=CODE link. It sees the board with no glow, the Watching badge, no hand bar, no action buttons, a
// read-only dock and the "Watching — Emberisle" title, while every seat shows the eye count "1". An injected intent is
// refused with "Watching only." and the store's own actions send nothing. The seats then play to the win on the practice
// bot and the watcher's win screen is the seats' full reveal (every hand and hidden point, the same rows as a seat) with
// no seed or rng behind it. Leave takes it to the Title with no confirm and the count falls to 0; a dropped watcher
// lands on the Title with "Lost the table" and leaves another table's saved seat alone. Zero console errors.
// Run with: node --import ./server/register.mjs scripts/watch-ui-prove.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { connectTable } from "../src/lib/net/table.ts";

const PORT = 8102;

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  // The seats act as fast as the host answers, far past the per-seat rate meant for people.
  env: { ...process.env, PORT: "0", ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
// The host's log, printed on a failure.
const hostLog = [];
host.stderr.on("data", (d) => hostLog.push(String(d).trimEnd()));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    hostLog.push(String(d).trimEnd());
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
// Other proofs run beside this one; a busy port is waited for, never taken over.
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
for (let tries = 0; ; tries++) {
  try {
    await vite.listen();
    break;
  } catch (e) {
    if (e.code !== "EADDRINUSE" || tries >= 240) throw e;
    if (tries === 0) console.log(`port ${PORT} busy, waiting`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const errors = [];
let code = 0;
const url = (query = "") => `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}${query}`;

// `still`: stop this tab's island loop once it mounts. Under software GL every live canvas costs the others their frames,
// and only the watcher's board is under test here (tabs-prove covers the seats' boards).
async function tab(name, query = "", still = true) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(url(query));
  if (still) {
    await page.waitForFunction(() => Boolean(window.__isle));
    await page.evaluate(() => window.__isle.renderer.setAnimationLoop(null));
  }
  return { name, page };
}

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${typeof what === "function" ? what() : what}`);
}

// What a tab knows and shows.
const view = (t) =>
  t.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const g = s.state;
    const isle = window.__isle;
    const q = (sel) => document.querySelectorAll(sel).length;
    const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
    return {
      screen: s.screen,
      // Set once the watcher is on the board; a page reload loses it.
      marker: window.__onBoard ?? null,
      spectator: s.spectator,
      watching: s.watching,
      localId: s.localId,
      error: s.error,
      seq: g?.seq ?? null,
      phase: g?.phase ?? null,
      current: g?.current ?? null,
      winner: g?.winner ?? null,
      hasSeed: Boolean(g && ("seed" in g || "rng" in g)),
      hands: g ? g.players.map((p) => (p.resources ? Object.values(p.resources).reduce((a, b) => a + b, 0) : null)) : null,
      hiddenVp: g ? g.players.map((p) => p.hidden.vp) : null,
      legalCount: s.legal ? s.legal.actions.length + s.legal.outpost.length + s.legal.path.length + s.legal.stronghold.length + s.legal.wayfarer.length : null,
      highlights: (() => {
        const h = s.highlights();
        return h.vertices.length + h.edges.length + h.hexes.length;
      })(),
      glow: isle ? isle.lastHi.vertices.length + isle.lastHi.edges.length + isle.lastHi.hexes.length : null,
      interactive: isle ? isle.lastInteractive : null,
      boardSeq: isle?.lastState?.seq ?? null,
      canvas: q("canvas"),
      resources: q('[data-testid^="resource-"]:not([data-testid="resource-flash"])'),
      placeList: q('[data-testid="place-list"]'),
      badge: document.querySelector('[data-testid="watching-badge"]')?.textContent ?? null,
      count: document.querySelector('[data-testid="watching-count"]')?.textContent?.trim() ?? null,
      buttons,
      title: document.title,
      turnBanner: document.querySelector('[data-testid="turn-banner"]')?.textContent ?? null,
      alert: document.querySelector('[role="alert"]')?.textContent ?? null,
      winRows: [...document.querySelectorAll('[data-testid="win-row"]')].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent.trim())),
      winHeadline: document.querySelector('[data-testid="win-headline"]')?.textContent ?? null,
    };
  });

// #442: the eye count and Leave table live in the table menu, so they are read with it open (the Watching badge stays in
// the header and is read with it closed). The button is clicked through the DOM: at the win the modal win screen covers
// it, and the sheet's text still reads.
const peek = async (t) => {
  const trigger = t.page.getByRole("button", { name: "Table menu" });
  const opens = (await trigger.count()) > 0 && (await t.page.getByTestId("table-menu").count()) === 0;
  if (opens) {
    await trigger.dispatchEvent("click");
    if ((await t.page.getByTestId("table-menu").count()) !== 1) throw new Error(`${t.name}: the table menu did not open`);
  }
  const v = await view(t);
  if (opens) await t.page.keyboard.press("Escape");
  return v;
};

// The seat tabs play themselves: the practice bot picks on each new state where it is this seat's move (or discard);
// a refusal becomes one pass, as runBots does. Lives in the page so the game runs at the host's pace, not Playwright's.
const autoplay = (t) =>
  t.page.evaluate(async () => {
    const ai = await import("/src/lib/game/ai.ts");
    const store = window.__emberisle;
    const auto = { acted: -1, passed: -1, errs: store.getState().errorSeq };
    const step = () => {
      const s = store.getState();
      const g = s.state;
      if (!g || g.phase === "over" || !s.legal) return;
      const mine = g.phase === "discard" ? s.legal.discard > 0 : g.current === s.localId;
      if (!mine) return;
      if (s.errorSeq !== auto.errs) {
        auto.errs = s.errorSeq;
        if (auto.acted === g.seq) {
          if (auto.passed !== g.seq) {
            auto.passed = g.seq;
            s.dispatch({ type: "endTurn" });
          }
          return;
        }
      }
      if (auto.acted === g.seq) return;
      auto.acted = g.seq;
      const view = { ...g, deck: Array.from({ length: g.deckLeft ?? 0 }) };
      s.dispatch(ai.chooseBotAction(view, s.localId) ?? { type: "endTurn" });
    };
    store.subscribe(step);
    step();
  });

// The third seat, a table.ts client in this process, playing the same way.
function nodeSeat(name) {
  const p = { name, state: null, legal: null, you: null, code: null, watching: null, chats: [], errors: [], acted: -1, passed: -1, auto: false };
  const step = () => {
    if (!p.auto || !p.state || p.state.phase === "over" || !p.legal) return;
    const g = p.state;
    const mine = g.phase === "discard" ? p.legal.discard > 0 : g.current === p.you;
    if (!mine || p.acted === g.seq) return;
    p.acted = g.seq;
    const view = { ...g, deck: Array.from({ length: g.deckLeft ?? 0 }) };
    p.t.act(chooseBotAction(view, p.you) ?? { type: "endTurn" });
  };
  p.t = connectTable(`ws://127.0.0.1:${hostPort}`, {
    welcome: (m) => (p.code = m.code),
    seats: (m) => (p.watching = m.watching),
    state: (m) => {
      p.state = m.game;
      p.legal = m.legal;
      p.you = m.you;
      step();
    },
    chat: (l) => p.chats.push(l),
    error: (e) => {
      p.errors.push(e);
      if (p.auto && p.state && p.acted === p.state.seq && p.passed !== p.state.seq) {
        p.passed = p.state.seq;
        p.t.act({ type: "endTurn" });
      }
    },
  });
  p.start = () => {
    p.auto = true;
    step();
  };
  return p;
}

const GAME_CONTROLS = ["Roll", "End turn", "Trade", "Fortune", "Path", "Outpost", "Stronghold", "Wayfarer card", "Yes", "No", "Ready", "Start", "Send", "Place"];

try {
  // --- The table: two tabs and one client seat, through the lobby to the start.
  const a = await tab("Ember");
  const b = await tab("Tide");
  const c = nodeSeat("Pine");
  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  await b.page.getByPlaceholder(/code/i).fill(tableCode);
  await b.page.getByRole("button", { name: "Join", exact: true }).click();
  await b.page.getByTestId("table-code").waitFor();
  c.t.join(tableCode, { name: "Pine" });
  await until(() => c.code, "Pine's welcome");

  // --- 1. Watch under 4 characters sends nothing; at 4 a watch of the lobby is refused in the title's alert line, and
  // the tab stays on the Title. The 4-character refusal is the fence: a 3-character hello that got out would have been
  // refused first ("No table with that code") and counted a second error.
  const w = await tab("Watcher");
  const errorsBefore = await w.page.evaluate(() => window.__emberisle.getState().errorSeq);
  await w.page.getByPlaceholder(/code/i).fill(tableCode.slice(0, 3));
  // #444: Watch only shows once the field holds a whole code, so under 4 there is nothing to press.
  if (await w.page.getByRole("button", { name: "Watch", exact: true }).count()) throw new Error("Watch shows with a 3-character code");
  await w.page.getByPlaceholder(/code/i).fill(tableCode);
  await w.page.getByRole("button", { name: "Watch", exact: true }).click();
  await until(async () => (await view(w)).alert === "Not started yet.", 'the lobby refusal "Not started yet."');
  if ((await view(w)).screen !== "title") throw new Error("a refused watch left the Title");
  const errorsAfter = await w.page.evaluate(() => window.__emberisle.getState().errorSeq);
  if (errorsAfter !== errorsBefore + 1) throw new Error(`a 3-character Watch sent something: errorSeq ${errorsBefore} -> ${errorsAfter}`);
  console.log(`table ${tableCode}: no Watch at 3 characters; at 4 on the lobby -> "Not started yet.", still on the Title`);

  for (const t of [a, b]) {
    await until(async () => (await t.page.locator("li", { hasText: "Pine" }).count()) === 1, `${t.name} sees 3 seats`);
    await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  c.t.ready(true);
  await a.page.getByRole("button", { name: "Start" }).click();
  await until(async () => (await Promise.all([a, b].map(view))).every((v) => v.screen === "play" && v.seq !== null) && c.state, "start", 90_000);
  // The seats idle on the roll-off while the watcher is checked (TURN_MS is 120 s). No count yet.
  for (const t of [a, b]) {
    const v = await peek(t);
    if (v.watching !== 0 || v.count !== null) throw new Error(`${t.name} counts a watcher before any watched: ${JSON.stringify([v.watching, v.count])}`);
  }

  // --- 2. The watch link: ?watch=CODE fills the field, leaves the URL (keeping ?host=), and makes Watch the primary button.
  await w.page.close();
  const w1 = await tab("Watcher", `&watch=${tableCode.toLowerCase()}`, false);
  await until(() => w1.page.evaluate(() => document.querySelector('input[aria-label="Join code"]')?.value || null), "the watch link filling the field");
  const link = await w1.page.evaluate(() => ({
    field: document.querySelector('input[aria-label="Join code"]').value,
    search: location.search,
    watchPrimary: [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Watch")?.className.split(" ").includes("bg-fg") ?? false,
    joinPrimary: [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Join")?.className.split(" ").includes("bg-fg") ?? false,
  }));
  if (link.field !== tableCode) throw new Error(`?watch= did not fill the field: ${JSON.stringify(link)}`);
  if (link.search.includes("watch=") || !link.search.includes("host=")) throw new Error(`?watch= stayed in the URL or ?host= was lost: ${link.search}`);
  if (!link.watchPrimary || link.joinPrimary) throw new Error(`Watch is not the primary button on a watch link: ${JSON.stringify(link)}`);
  if ((await view(w1)).screen !== "title") throw new Error("the watch link sent something before Watch was pressed");
  console.log(`?watch=${tableCode.toLowerCase()}: field "${link.field}", URL "${link.search}", Watch primary`);

  // --- 3. Watch after the start: the board, the badge, the opponent view, nothing to press, no glow, and the seats count 1.
  await w1.page.getByRole("button", { name: "Watch", exact: true }).click();
  let wv = await until(async () => {
    const v = await view(w1);
    return v.screen === "play" && v.seq !== null && v.boardSeq === v.seq && v.title.startsWith("Watching") ? v : null;
  }, "the watcher reaching the board", 60_000);
  const seatViews = await until(async () => {
    const vs = await Promise.all([a, b].map(peek));
    return vs.every((v) => v.watching === 1 && v.count === "1") && c.watching === 1 ? vs : null;
  }, "every seat counting the watcher");
  await w1.page.evaluate(() => (window.__onBoard = true));
  wv = await peek(w1);
  if (!wv.spectator || wv.localId !== "") throw new Error(`watcher store: spectator=${wv.spectator} localId=${JSON.stringify(wv.localId)}`);
  if (wv.count !== "1") throw new Error(`watcher menu: count=${JSON.stringify(wv.count)}`);
  // The badge is a header chip a watcher sees with the menu closed (docs/design/spectator.md).
  const badge = await w1.page.getByTestId("watching-badge");
  if ((await w1.page.getByTestId("table-menu").count()) !== 0 || !(await badge.isVisible()) || (await badge.textContent()) !== "Watching") throw new Error("watcher header: no visible Watching badge with the menu closed");
  wv.badge = await badge.textContent();
  if (wv.title !== "Watching — Emberisle") throw new Error(`watcher tab title: "${wv.title}"`);
  if (wv.canvas < 1 || wv.boardSeq !== wv.seq) throw new Error(`the watcher's board is not drawn at seq ${wv.seq}: ${JSON.stringify([wv.canvas, wv.boardSeq])}`);
  if (wv.seq !== seatViews[0].seq || wv.phase !== "rollOff") throw new Error(`the watcher is not on the seats' state: ${JSON.stringify([wv.seq, wv.phase, seatViews[0].seq])}`);
  if (wv.resources !== 0) throw new Error(`the watcher has ${wv.resources} hand tiles`);
  if (wv.hands.some((n) => n !== null) || wv.hiddenVp.some((n) => n !== 0) || wv.hasSeed) throw new Error(`hidden info reached the watcher before the win: ${JSON.stringify([wv.hands, wv.hiddenVp, wv.hasSeed])}`);
  if (wv.legalCount !== 0 || wv.highlights !== 0 || wv.glow !== 0 || wv.interactive !== false) throw new Error(`the watcher has a glow: ${JSON.stringify([wv.legalCount, wv.highlights, wv.glow, wv.interactive])}`);
  if (wv.placeList !== 0) throw new Error("the watcher has a PlaceList (#376) of targets");
  const pressable = wv.buttons.filter((t) => GAME_CONTROLS.includes(t));
  if (pressable.length) throw new Error(`the watcher can press ${JSON.stringify(pressable)}`);
  if (!wv.buttons.includes("Leave table")) throw new Error(`the watcher has no Leave table button: ${JSON.stringify(wv.buttons)}`);
  if (!wv.turnBanner || wv.turnBanner.startsWith("Your")) throw new Error(`the watcher's turn line: "${wv.turnBanner}"`);
  // The positive control: the seat whose roll it is has the Roll button and no badge. Its hand is empty in the roll-off, so no hand tiles are shown (#439).
  const up = [a, b].find((t, i) => seatViews[i].localId === wv.current);
  if (up) {
    const uv = seatViews[[a, b].indexOf(up)];
    if (!uv.buttons.includes("Roll") || uv.resources !== 0 || uv.badge !== null) throw new Error(`${up.name} (on turn) is missing its controls: ${JSON.stringify([uv.buttons, uv.resources, uv.badge])}`);
  } else if (c.legal?.actions.includes("roll") !== true) throw new Error("Pine is on turn with no roll");
  console.log(`watching: board at seq ${wv.seq}, badge "${wv.badge}", eye count "${wv.count}" on every seat, title "${wv.title}", 0 hand tiles, 0 glow, no controls; turn line "${wv.turnBanner}"`);

  // The dock: open it, and the chips, tray and input are one read-only line. A seat's chat still arrives (plain text, no mention).
  await w1.page.getByRole("button", { name: /Open chat/ }).click();
  await w1.page.getByTestId("chat-readonly").waitFor();
  const dock = await w1.page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Table chat"]');
    return { inputs: sec.querySelectorAll("input").length, emotes: sec.querySelectorAll('[aria-label="Emotes"]').length, buttons: [...sec.querySelectorAll("button")].map((b) => b.textContent.trim() || b.getAttribute("aria-label")) };
  });
  if (dock.inputs !== 0 || dock.emotes !== 0 || dock.buttons.some((t) => t === "Send" || t === "gg")) throw new Error(`the watcher's dock can talk: ${JSON.stringify(dock)}`);
  await a.page.getByRole("button", { name: /Open chat/ }).click();
  await a.page.getByPlaceholder("Say something…").fill("hello watcher @Ember");
  await a.page.getByRole("button", { name: "Send", exact: true }).click();
  await until(async () => (await w1.page.getByTestId("chat-log").textContent()).includes("hello watcher @Ember"), "the seat's chat reaching the watcher's dock");
  if ((await w1.page.getByTestId("chat-log").locator("mark").count()) !== 0) throw new Error("a mention was highlighted for a watcher with no name");
  console.log(`dock: read-only line, 0 inputs, ${dock.buttons.length} buttons (${dock.buttons.join(", ")}); "hello watcher @Ember" from Ember shown plain`);

  // --- 4. Refusals: an intent injected under the store gets "Watching only."; the store's own actions send nothing.
  const sent = await w1.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const net = s.net;
    let n = 0;
    for (const k of ["act", "say", "react", "ask", "answer", "ready", "start"]) {
      const real = net[k].bind(net);
      net[k] = (...args) => (n++, real(...args));
    }
    s.dispatch({ type: "roll" });
    s.sendChat("from the stands");
    s.sendReact("wave");
    s.askTable({ wool: 1 }, { ore: 1 });
    s.setReady(true);
    s.startTable();
    s.openMenu(s.state.players[0].id);
    const sentByStore = n;
    net.act({ type: "roll" });
    return { sentByStore, menuFor: window.__emberisle.getState().menuFor };
  });
  if (sent.sentByStore !== 0 || sent.menuFor !== null) throw new Error(`the store sent ${sent.sentByStore} seat-only messages or opened a menu (${sent.menuFor}) for a watcher`);
  wv = await until(async () => {
    const v = await view(w1);
    return v.error === "Watching only." ? v : null;
  }, 'the injected roll getting "Watching only."');
  if (wv.seq !== seatViews[0].seq || (await view(a)).seq !== seatViews[0].seq) throw new Error("the injected intent moved the game");
  if (c.chats.some((l) => l.text === "from the stands")) throw new Error("a watcher's chat reached a seat");
  console.log(`refusals: dispatch, chat, react, ask, ready, start, menu -> 0 messages sent, no menu; net.act(roll) -> "Watching only." at seq ${wv.seq}`);

  // --- 5. The seats play to the win; the watcher gets the full reveal, the same rows as a seat, with no seed or rng.
  // The watcher's live board is proven above (seq 0). Under software GL that loop plus 300 pushes starves the tab past the
  // host's PING_MS and the keepalive cuts it, so from here it stops drawing like the seats; the win is awaited on Pine.
  await w1.page.evaluate(() => window.__isle.renderer.setAnimationLoop(null));
  await Promise.all([a, b].map(autoplay));
  c.start();
  await until(() => c.state?.phase === "over", () => `the win (Pine ${JSON.stringify([c.state?.seq, c.state?.phase, c.state?.current, c.acted, c.errors.slice(-3)])})`, 180_000);
  wv = await until(async () => {
    const v = await view(w1);
    if (v.screen !== "play" || v.marker !== true) throw new Error(`the watcher left the board mid-game: ${JSON.stringify({ screen: v.screen, marker: v.marker, error: v.error, alert: v.alert, spectator: v.spectator })}`);
    return v.phase === "over" && v.winHeadline && v.winRows.length === 3 ? v : null;
  }, "the win reaching the watcher's screen", 30_000);
  const av = await until(async () => {
    const v = await view(a);
    return v.phase === "over" && v.winRows.length === 3 ? v : null;
  }, "the win on Ember's screen");
  // #439: the hand is shown once a seat has held a good, so a seat whose hand is not empty at the win shows its five tiles (keeps the
  // watcher's 0 tiles meaningful, now that an empty hand is also 0).
  const mineAt = c.state.players.findIndex((p) => p.id === av.localId);
  if (mineAt < 0 || typeof av.hands?.[mineAt] !== "number") throw new Error(`Ember's own hand at the win: ${JSON.stringify([av.localId, av.hands])}`);
  if (av.hands[mineAt] > 0 && av.resources !== 5) throw new Error(`Ember holds ${av.hands[mineAt]} goods at the win but shows ${av.resources} hand tiles`);
  const winnerName = c.state.players.find((p) => p.id === wv.winner)?.name;
  if (!winnerName || wv.winHeadline !== `${winnerName} wins`) throw new Error(`the watcher's headline: "${wv.winHeadline}" (winner ${wv.winner})`);
  if (JSON.stringify(wv.winRows) !== JSON.stringify(av.winRows)) throw new Error(`the watcher's table differs from Ember's:\n${JSON.stringify(wv.winRows)}\n${JSON.stringify(av.winRows)}`);
  if (wv.hands.some((n) => typeof n !== "number")) throw new Error(`a hand is not revealed to the watcher at the win: ${JSON.stringify(wv.hands)}`);
  if (JSON.stringify(wv.hiddenVp) !== JSON.stringify(av.hiddenVp)) throw new Error(`hidden points differ at the win: ${JSON.stringify([wv.hiddenVp, av.hiddenVp])}`);
  if (wv.hasSeed || !av.hasSeed) throw new Error(`seed/rng: watcher ${wv.hasSeed}, seat ${av.hasSeed}`);
  if (wv.buttons.some((t) => /play again/i.test(t))) throw new Error("the watcher has Play again");
  if (wv.resources !== 0) throw new Error("the watcher grew a hand at the win");
  console.log(`win: "${wv.winHeadline}" at seq ${wv.seq}; the watcher's ${wv.winRows.length} rows equal Ember's (hidden ${JSON.stringify(wv.hiddenVp)}, hands ${JSON.stringify(wv.hands)}); no seed or rng, no Play again`);

  // --- 6. Leave: no confirm for a watcher, straight to the Title; every seat's count falls to 0. A seat saved in
  // localStorage for another table survives the leave (goTitle must not forget it for a watcher).
  const saved = JSON.stringify({ code: "ZZZZ", secret: "another-table" });
  await w1.page.evaluate((v) => localStorage.setItem("emberisle-seat", v), saved);
  await w1.page.getByTestId("win-look").click();
  if (!(await w1.page.getByTestId("watching-badge").isVisible())) throw new Error("the watcher lost its badge at the win");
  await w1.page.getByRole("button", { name: "Table menu" }).click();
  await w1.page.getByRole("button", { name: "Leave table" }).click();
  await until(async () => (await view(w1)).screen === "title", "Leave taking the watcher to the Title");
  if ((await w1.page.getByTestId("leave-confirm").count()) !== 0) throw new Error("Leave asked a watcher to confirm");
  await until(async () => (await Promise.all([a, b].map(peek))).every((v) => v.watching === 0 && v.count === null) && c.watching === 0, "the count falling to 0");
  const keptAfterLeave = await w1.page.evaluate(() => localStorage.getItem("emberisle-seat"));
  if (keptAfterLeave !== saved) throw new Error(`Leave as a watcher touched the saved seat: ${keptAfterLeave}`);
  console.log("leave: Title with no confirm; eye count gone on every seat; the saved seat for another table kept");

  // --- 7. A dropped watcher lands on the Title with "Lost the table"; a seat saved for another table is untouched.
  await w1.page.getByPlaceholder(/code/i).fill(tableCode);
  await w1.page.getByRole("button", { name: "Watch", exact: true }).click();
  await until(async () => (await view(w1)).screen === "play", "watching again after the win");
  await w1.page.evaluate(() => window.__emberisle.getState().net.drop());
  await until(async () => {
    const v = await view(w1);
    return v.screen === "title" && v.alert === "Lost the table" && !v.spectator;
  }, 'the drop landing on the Title with "Lost the table"');
  const kept = await w1.page.evaluate(() => localStorage.getItem("emberisle-seat"));
  if (kept !== saved) throw new Error(`the drop touched the saved seat: ${kept}`);
  console.log('drop: Title with "Lost the table", no redial, the saved seat for another table kept');

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("watch ui prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  console.log(`host log (last 20):\n${hostLog.slice(-20).join("\n")}`);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
process.exit(code);
