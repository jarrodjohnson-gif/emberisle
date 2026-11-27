// #1411 (docs/design/play-again-1411, option A): who wants to play again, on a real host with real pages.
// A finished four-player game: Bartholomew hosts and won, Guinevere is a socket, Maximilian is the page under test and
// Cordelia is a bot. On the phone list and the desktop table: every seated player who is not the host gets "I'll play again"
// (a 44 px aria-pressed toggle), the host keeps Play again and a watcher gets neither; the host and the bot always show
// "✓ Play again"; a tap shows on every screen, the watcher's too, and taking it back clears it; an away player shows "Away";
// each row's name says "wants to play again" and a hidden status line gives the count; the desktop table gets no wider; a
// tag is never cut or over the total; nothing scrolls sideways; and a tap never starts the next game.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "../server/node_modules/ws/wrapper.mjs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { totalVP } from "../src/lib/game/rules.ts";

const port = Number(process.env.VITE_PORT || 18791);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-play-again-"));
const code = "PLAY";
const NAMES = ["Bartholomew Featherstonehaugh", "Guinevere Wigglesworth-Smythe", "Maximilian Oppenheimer III", "Cordelia Fitzgerald-Hartwell"];

// The #748 results fixture, finished, as a saved room: Bartholomew (s0, p0) hosts and won; Cordelia (s3, p3) is a bot.
const g = createGame({ humans: NAMES.map((name) => ({ name })), bots: 0, seed: 559, wayfarerMode: "off" });
g.rollOff = null; g.log = []; g.victoryTarget = 10;
[["p0", "stronghold"], ["p0", "stronghold"], ["p0", "stronghold"], ["p0", "outpost"], ["p0", "outpost"], ["p1", "stronghold"], ["p1", "stronghold"], ["p1", "outpost"], ["p1", "outpost"], ["p2", "stronghold"], ["p2", "stronghold"]]
  .forEach(([playerId, kind], i) => { g.vertices[i].building = { playerId, kind }; });
g.longestRoad = "p0"; g.largestArmy = "p2"; g.players[2].knightsPlayed = 3; g.players[3].kind = "bot";
g.players.forEach((p, i) => { p.hidden.vp = [1, 3, 3, 0][i]; });
g.phase = "over"; g.winner = "p0"; g.current = "p0";
g.winReason = { trigger: "outpost", points: totalVP(g, "p0"), target: 10 };
const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `fixture-${p.id}`, ...(i === 3 ? { bot: true } : {}) }));
writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 4, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now(), victoryTarget: 10, wayfarerMode: "off" }));

const LIST = [
  [390, 844, true],
  [1280, 720, false],
  [820, 1180, true],
  [667, 375, true, { top: 0, right: 44, bottom: 21, left: 44 }],
];

let host, hostPort, stderr = "", browser, guin;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function startHost() {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: path.join(dir, "results"), PROFILES_DIR: path.join(dir, "profiles"), SAVE_MS: "20", GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: "600000" }, stdio: ["ignore", "pipe", "pipe"] });
  host.stderr.on("data", (d) => (stderr += d));
  hostPort = await new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", (c) => reject(Error(`host ${c}: ${stderr}`)));
  });
}
// Guinevere, at the table on a bare socket. Every state she hears is kept, so a tap that started a game would show.
async function guinevere() {
  const ws = new WebSocket(`ws://127.0.0.1:${hostPort}`), c = { ws, states: [], seats: null };
  ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.type === "state") c.states.push(m.game.phase); if (m.type === "seats") c.seats = m.seats; });
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "hello", code, secret: "fixture-p1" }));
  for (let i = 0; i < 500 && !c.seats; i++) await wait(10);
  c.want = (value) => ws.send(JSON.stringify({ type: "wantAgain", value }));
  return c;
}

const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
try {
  await startHost();
  await vite.listen();
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  mkdirSync("test-results", { recursive: true });
  const errors = [];
  const url = `http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`;
  guin = await guinevere();

  async function open(width, height, touch, insets, who) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    const page = await context.newPage();
    const tag = `${width}x${height}${insets ? " insets" : ""} ${who}`;
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    if (insets) await (await context.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
    if (who === "watcher") {
      await page.goto(`${url}&watch=${code}`);
      await page.getByRole("button", { name: "Watch", exact: true }).click();
    } else {
      await context.addInitScript((w) => { localStorage.setItem("emberisle-seat", JSON.stringify(w)); localStorage.setItem("emberisle-seat-live", w.code); }, { code, secret: `fixture-${who}` });
      await page.goto(url);
    }
    await page.getByTestId("win-menu").waitFor({ timeout: 30_000 });
    await page.getByTestId("win-row").nth(3).waitFor();
    // The list chunk lands after the table on a phone; wait for the list itself.
    await page.locator('[data-testid="win-table-wrap"] ul').waitFor();
    return { context, page, tag };
  }

  // What one screen shows: each row's tag, its accessible name, the count, and the geometry the design promises.
  const look = (page) => page.evaluate(() => {
    const screen = document.querySelector('[data-testid="win-screen"]');
    const wrap = screen.querySelector('[data-testid="win-table-wrap"]');
    const rows = [...screen.querySelectorAll('[data-testid="win-row"]')];
    const box = (el) => el.getBoundingClientRect();
    return {
      tags: Object.fromEntries(rows.map((r) => [r.dataset.player, r.querySelector(".win-tag")?.textContent ?? ""])),
      count: [...screen.querySelectorAll('[role="status"]')].map((p) => p.textContent).join("|"),
      cut: rows.filter((r) => {
        const t = r.querySelector(".win-tag");
        if (!t) return false;
        const a = box(t), b = box(r), total = box(r.querySelector('[data-testid="win-total"]'));
        return a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5 || (r.tagName !== "TR" && a.right > total.left);
      }).map((r) => r.dataset.player),
      // On the table, a tag sits under the name, inside the name cell.
      under: rows.filter((r) => r.tagName === "TR" && r.querySelector(".win-tag")).every((r) => box(r.querySelector(".win-tag")).top >= box(r.querySelector('[data-testid="win-total"]')).top),
      rowHeights: rows.map((r) => r.offsetHeight),
      sideways: wrap.scrollWidth > wrap.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
      buttons: [...screen.querySelectorAll("button")].filter((b) => !b.closest('[data-testid="win-table-wrap"]')).map((b) => ({ id: b.dataset.testid ?? b.textContent.trim(), h: b.offsetHeight, ...b.getBoundingClientRect().toJSON() })),
      waiting: screen.querySelector('[data-testid="win-waiting"]')?.textContent ?? null,
    };
  });
  const YES = "✓ Play again, wants to play again";
  async function until(page, test, label) {
    for (let i = 0; i < 300; i++) { const v = await look(page); if (test(v)) return v; await wait(20); }
    throw Error(`${label}: ${JSON.stringify(await look(page))}`);
  }
  // The count sits in the lazy PlayAgain part and the tags do not, so wait for both before reading the count.
  const tagsAre = (want) => (v) => JSON.stringify(v.tags) === JSON.stringify(want) && v.count !== "";
  // What a screen reader hears for each player, read from Chromium's accessibility tree: the phone row's button, or the
  // desktop table's name cell (a table is read cell by cell).
  async function heard(s) {
    const cdp = await s.page.context().newCDPSession(s.page);
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const names = {};
    for (const id of ["p0", "p1", "p2", "p3"]) {
      const row = `[data-testid="win-row"][data-player="${id}"]`;
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `button${row}, tr${row} > td:first-child` });
      const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
      names[id] = nodes[0].name?.value;
    }
    await cdp.detach();
    return names;
  }
  // The name each row should read: the player, what its tag says, then (on the phone row) the total.
  const TOTALS = { p0: 11, p1: 9, p2: 9, p3: 0 };
  const SAID = { yes: " , wants to play again", away: " Away", none: "" };
  const expectNames = (touch, tags) => Object.fromEntries(Object.entries(tags).map(([id, t]) => [id, `${NAMES[Number(id[1])]}${SAID[t]}${touch ? ` ${TOTALS[id]}` : ""}`]));

  for (const [width, height, touch, insets] of LIST) {
    const size = `${width}x${height}${insets ? " insets" : ""}`;
    guin.want(false);
    const guest = await open(width, height, touch, insets, "p2");
    const hostPage = await open(width, height, touch, insets, "p0");
    const watcher = await open(width, height, touch, insets, "watcher");
    const screens = [guest, hostPage, watcher];
    const start = { p0: YES, p1: "", p2: "", p3: YES };

    // Who gets which button.
    const want = guest.page.getByTestId("win-want");
    assert.equal(await want.getAttribute("aria-pressed"), "false", `${size}: I'll play again starts unpressed`);
    assert.equal((await want.textContent()).trim(), "I'll play again");
    assert.equal(await guest.page.getByTestId("win-again").count(), 0, `${size}: a guest has no Play again`);
    assert.equal(await hostPage.page.getByTestId("win-want").count(), 0, `${size}: the host has no I'll play again`);
    assert.equal(await hostPage.page.getByTestId("win-again").count(), 1, `${size}: the host keeps Play again`);
    assert.equal(await watcher.page.getByTestId("win-want").count() + await watcher.page.getByTestId("win-again").count(), 0, `${size}: a watcher has neither`);

    // The host and the bot are always in; nobody else has said yet.
    for (const s of screens) {
      const v = await until(s.page, tagsAre(start), `${s.tag}: host and bot tags`);
      assert.equal(v.count, "2 of 4 want another game", `${s.tag}: count`);
      assert.deepEqual(await heard(s), expectNames(true, { p0: "yes", p1: "none", p2: "none", p3: "yes" }), `${s.tag}: row names`);
    }
    const before = await look(guest.page);
    assert.equal(before.waiting, "Waiting for Bartholomew Featherstonehaugh to start another.", `${size}: the waiting line is unchanged`);

    // Guinevere says yes on her socket; every screen shows it.
    guin.want(true);
    const one = { ...start, p1: YES };
    for (const s of screens) assert.equal((await until(s.page, tagsAre(one), `${s.tag}: Guinevere's tag`)).count, "3 of 4 want another game");

    // Maximilian taps. The button presses, every screen shows his tag, and nothing starts.
    const statesBefore = guin.states.length;
    touch ? await want.tap() : await want.click();
    await guest.page.waitForFunction(() => document.querySelector('[data-testid="win-want"]').getAttribute("aria-pressed") === "true");
    assert.equal((await want.textContent()).trim(), "✓I'll play again");
    const all = { ...one, p2: YES };
    for (const s of screens) {
      const v = await until(s.page, tagsAre(all), `${s.tag}: Maximilian's tag`);
      assert.equal(v.count, "4 of 4 want another game");
      assert.deepEqual(await heard(s), expectNames(true, { p0: "yes", p1: "yes", p2: "yes", p3: "yes" }), `${s.tag}: row names`);
      assert.deepEqual(v.cut, [], `${s.tag}: no tag is cut or over the total`);
      assert.ok(v.under, `${s.tag}: on the table the tag sits under the name`);
      // The desktop table already runs past its edge with these names (#748); below it is proved no wider with the tags.
      assert.ok(!v.sideways, `${s.tag}: nothing scrolls sideways`);
      assert.ok(v.rowHeights.every((h) => h >= 44), `${s.tag}: rows ${v.rowHeights}`);
      const safe = { top: insets?.top ?? 0, bottom: height - (insets?.bottom ?? 0), left: insets?.left ?? 0, right: width - (insets?.right ?? 0) };
      for (const b of v.buttons) assert.ok(b.h >= 44 && b.top >= safe.top - 1 && b.bottom <= safe.bottom + 1 && b.left >= safe.left - 1 && b.right <= safe.right + 1, `${s.tag}: ${b.id} ${JSON.stringify(b)}`);
    }
    await guest.page.screenshot({ path: `test-results/play-again-guest-${width}x${height}.png` });
    await hostPage.page.screenshot({ path: `test-results/play-again-host-${width}x${height}.png` });
    // Desktop: the tags put nothing on the table's width.
    if (!touch) {
      const widths = await hostPage.page.evaluate(() => {
        const wrap = document.querySelector('[data-testid="win-table-wrap"]');
        const w = [wrap.scrollWidth, wrap.querySelector("ul").offsetWidth];
        const style = document.createElement("style");
        style.textContent = ".win-tag { display: none !important; }";
        document.head.append(style);
        const without = [wrap.scrollWidth, wrap.querySelector("ul").offsetWidth];
        style.remove();
        return { w, without };
      });
      assert.deepEqual(widths.w, widths.without, `${size}: the list is no wider with the tags`);
    }
    await wait(150);
    assert.equal(guin.states.length, statesBefore, `${size}: a tap sends no new game`);
    assert.equal(await hostPage.page.evaluate(() => window.__emberisle.getState().state.phase), "over");

    // Take it back: off on every screen. Keyboard on the desktop: Tab reaches it inside the dialog and Space presses it.
    if (touch) await want.tap();
    else {
      await want.focus();
      await guest.page.keyboard.press("Space");
    }
    await guest.page.waitForFunction(() => document.querySelector('[data-testid="win-want"]').getAttribute("aria-pressed") === "false");
    for (const s of screens) assert.equal((await until(s.page, tagsAre(one), `${s.tag}: taken back`)).count, "3 of 4 want another game");

    // Guinevere's socket drops: Away, on every screen, and left out of the count.
    guin.ws.terminate();
    for (const s of screens) {
      const v = await until(s.page, tagsAre({ ...start, p1: "Away" }), `${s.tag}: away`);
      assert.equal(v.count, "2 of 3 want another game");
      assert.deepEqual(await heard(s), expectNames(true, { p0: "yes", p1: "away", p2: "none", p3: "yes" }), `${s.tag}: row names`);
    }
    await guest.page.screenshot({ path: `test-results/play-again-away-${width}x${height}.png` });
    guin = await guinevere();
    for (const s of screens) await until(s.page, tagsAre(start), `${s.tag}: back with no yes`);

    for (const s of screens) await s.context.close();
    console.log(`ok ${size}: buttons by role, host and bot always in, a tap shows on every screen and the watcher's, take back, away, count, no sideways scroll, 44 px, nothing started`);
  }

  // The host's Play again still starts the next game, with Maximilian's yes or without it.
  const hostPage = await open(390, 844, true, null, "p0");
  guin.want(true);
  await until(hostPage.page, (v) => v.tags.p1 === YES, "Guinevere yes before the rematch");
  await hostPage.page.getByTestId("win-again").tap();
  await hostPage.page.waitForFunction(() => window.__emberisle.getState().state.phase === "rollOff");
  assert.ok(await hostPage.page.evaluate(() => window.__emberisle.getState().seats.every((s) => !s.again)), "the next game clears every yes");
  await hostPage.context.close();
  console.log("ok the host's Play again starts the next game and clears every yes");

  assert.deepEqual(errors, []);
  console.log("play-again-prove: all passed");
} finally {
  await browser?.close();
  await vite.close();
  guin?.ws.terminate();
  host?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
