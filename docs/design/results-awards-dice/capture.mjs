// #1452 and #1453 design capture: the results screen today, and with one award chip per player plus the dice strip.
// The game is real: play.mjs plays a whole four-seat game with the real rules and bots, and counts the proposed facts.
// The real host (server/host.mjs) loads it one action before the win, and real socket clients send the winning action.
// The browser then joins as seat p0 through the host. "After" pictures are a mock: mock.css and the DOM below are
// added to the real list, from the real store state that came over the socket.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time:
//   flock /tmp/claude-0/emberisle-browser.lock node --import ./server/register.mjs docs/design/results-awards-dice/capture.mjs [--save] [--new]
// --save writes the pictures here. --keep keeps the temp folder of a run without --save. --new plays a fresh game
// instead of reusing game.json. --only=WxH runs one size. A failed wait saves fail-WxH.png in the pictures folder.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../../../server/node_modules/ws/wrapper.mjs";
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { toIntent } from "../../../src/lib/net/table.ts";
import { totalVP } from "../../../src/lib/game/rules.ts";
import { play } from "./play.mjs";
import { diceLine, islandAwards } from "./awards.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const save = process.argv.includes("--save");
// Without --save the pictures go to a temp folder that is deleted at the end, unless --keep is given.
const keep = process.argv.includes("--keep");
const out = save ? dir : mkdtempSync(path.join(tmpdir(), "results-awards-dice-"));
console.error(`pictures: ${out}${save || keep ? "" : " (deleted at the end; add --keep to keep it)"}`);
const css = readFileSync(path.join(dir, "mock.css"), "utf8");
const fail = (msg) => { throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]].filter(([w, h]) => !only || only === `${w}x${h}`);
const gameFile = path.join(dir, "game.json");
let game;
if (existsSync(gameFile) && !process.argv.includes("--new")) game = JSON.parse(readFileSync(gameFile, "utf8"));
else {
  const { last } = play(["Jarrod", "Josh", "Maya", "Bartholomew Featherstonehaugh"], 1452);
  game = { before: last.before, actor: last.actor, action: last.action };
  if (save) writeFileSync(gameFile, `${JSON.stringify(game)}\n`);
}

// The real host, loading the room one action before the win.
const rooms = mkdtempSync(path.join(tmpdir(), "awards-rooms-"));
const code = "AWRD";
const seats = game.before.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `${code}-${p.id}` }));
writeFileSync(path.join(rooms, `${code}.json`), JSON.stringify({ code, host: "s0", next: 4, chat: [], chatSeq: 0, game: game.before, seats, recoveryPids: [], shape: 2, savedAt: Date.now() }));
let stderr = "";
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results`, SAVE_MS: "20", GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: "600000", ACT_CAP: "1000", ACT_RATE: "1000" },
  stdio: ["ignore", "pipe", "pipe"],
});
host.stderr.on("data", (d) => (stderr += d));
const hostPort = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (c) => reject(new Error(`host ${c}: ${stderr}`)));
});
const sockets = [];
async function client(pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${hostPort}`), messages = [];
  sockets.push(ws);
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify(pid === null ? { type: "hello", code, watch: true } : { type: "hello", code, secret: `${code}-${pid}` }));
  const next = async (test) => {
    for (let i = 0; i < 500; i++) { const m = messages.find(test); if (m) return m; const e = messages.find((x) => x.type === "error"); if (e) fail(e.message); await wait(10); }
    fail(`timed out ${pid}`);
  };
  return { pid, ws, state: await next((m) => m.type === "state"), next };
}

const result = { host: {}, runs: [] };
const errors = [];
let browser, vite;
try {
  const peers = [];
  for (const pid of ["p0", "p1", "p2", "p3", null]) peers.push(await client(pid));
  // Today's host: what a pre-win view carries for a seat that is not you. A build must strip these (README, Hidden until the win).
  result.host.preWinPhase = peers[0].state.game.phase;
  result.host.preWinOtherSeatHasTally = peers.map((x) => x.state.game.players.some((p) => p.id !== x.pid && "tally" in p));
  result.host.preWinHasGoodsLost = peers.map((x) => x.state.game.players.some((p) => "goodsLost" in p));
  const actor = peers.find((x) => x.pid === game.actor);
  actor.ws.send(JSON.stringify({ ...actor.state.actionStamp, cid: crypto.randomUUID(), ...toIntent(game.action) }));
  const ends = [];
  for (const x of peers) ends.push((await x.next((m) => m.type === "state" && m.game.phase === "over")).game);
  for (const g of ends) {
    if (!g.rollSums || g.rollSums.length !== 11) fail("rollSums missing at the win");
    if (g.players.some((p) => !p.tally || typeof p.goodsLost !== "number")) fail("a seat's counters are missing at the win");
  }
  // Free the seats: the host refuses a second connection to a seat ("Your seat is open in another tab").
  for (const ws of sockets) ws.close();
  await wait(300);
  const end = ends[0];
  result.host.winReason = end.winReason;
  result.totals = Object.fromEntries(end.players.map((p) => [p.name, totalVP(end, p.id)]));
  result.awards = Object.fromEntries(Object.entries(islandAwards(end)).map(([id, a]) => [end.players.find((p) => p.id === id).name, `${a.title} · ${a.fact}`]));
  result.dice = { rollSums: end.rollSums, ...diceLine(end.rollSums) };
  result.counters = Object.fromEntries(end.players.map((p) => [p.name, { ...p.tally, goodsLost: p.goodsLost, pathsBuilt: 15 - p.pathsLeft, knightsPlayed: p.knightsPlayed }]));
  console.log(JSON.stringify({ host: result.host, totals: result.totals, awards: result.awards, dice: result.dice }));
  // The row opened in the "open" pictures: the last place, who most needs a moment.
  const losers = end.players.filter((p) => p.id !== end.winner).sort((a, b) => totalVP(end, a.id) - totalVP(end, b.id));
  const OPEN = losers[0].id;
  result.opened = losers[0].name;

  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  result.browser = browser.version();

  // Runs in the page: adds the chip to each opened-row region and the strip under the list, from the store's real state.
  async function mock(css) {
    const { islandAwards, diceLine, chance } = await import("/docs/design/results-awards-dice/awards.mjs");
    const state = window.__emberisle.getState().state;
    const wrap = document.querySelector('[data-testid="win-table-wrap"]');
    const list = wrap?.querySelector("ul");
    if (!list || document.querySelectorAll('[data-testid="win-row"]').length !== 4) throw new Error("real list or rows missing");
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/></svg>';
    for (const [id, a] of Object.entries(islandAwards(state))) {
      const region = document.getElementById(`win-part-${id}`);
      if (!region) throw new Error(`region for ${id} missing`);
      const p = document.createElement("p");
      p.className = "aw";
      p.dataset.testid = "win-award";
      p.innerHTML = `<span class="aw-chip">${icon}<span></span></span><span class="aw-fact"></span>`;
      p.querySelector(".aw-chip span").textContent = a.title;
      p.querySelector(".aw-fact").textContent = a.fact;
      region.prepend(p);
    }
    const sums = state.rollSums;
    const d = diceLine(sums);
    if (!d) return; // No rollSums or no rolls: no strip.
    const W = 330, H = 44, bw = 22, gap = (W - 11 * bw) / 10, max = Math.max(...sums, ...sums.map((_, i) => d.total * chance(i + 2)));
    const x = (i) => i * (bw + gap);
    const bars = sums.map((k, i) => { const h = Math.max(1, (k / max) * H); return `<rect class="bar${d.sum === i + 2 ? " hot" : ""}" x="${x(i)}" y="${H - h}" width="${bw}" height="${h}" rx="3"/>`; }).join("");
    const odds = sums.map((_, i) => `${(x(i) + bw / 2).toFixed(1)},${(H - (d.total * chance(i + 2) / max) * H).toFixed(1)}`).join(" ");
    const nums = sums.map((_, i) => `<text class="num" x="${x(i) + bw / 2}" y="${H + 12}">${i + 2}</text>`).join("");
    const fig = document.createElement("figure");
    fig.className = "dice";
    fig.dataset.testid = "win-dice";
    fig.innerHTML = `<figcaption class="dice-head"><span>Dice this game</span><span>${d.total} rolls</span></figcaption>
      <svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Dice sums this game, 2 to 12, with the expected counts">${bars}<polyline class="odds" points="${odds}"/>${nums}</svg>
      <p class="dice-line"></p>`;
    fig.querySelector(".dice-line").textContent = d.line;
    list.after(fig);
  }

  // Runs in the page: the numbers each picture is judged by.
  function measure() {
    const box = (el) => { if (!el || !el.getClientRects().length) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const wrap = document.querySelector('[data-testid="win-table-wrap"]');
    const w = wrap.getBoundingClientRect();
    const inWrap = (el) => { const b = el?.getBoundingClientRect(); return !!b && b.top >= w.top - 1 && b.bottom <= w.bottom + 1 && b.bottom <= innerHeight; };
    const buttons = [...document.querySelectorAll('[data-testid="win-screen"] button')].filter((b) => b.getClientRects().length && !b.closest("ul"));
    const rows = [...document.querySelectorAll('[data-testid="win-row"]')];
    const dice = document.querySelector('[data-testid="win-dice"]');
    const award = [...document.querySelectorAll('[data-testid="win-award"]')].find((a) => a.getClientRects().length);
    return {
      wrap: { ...box(wrap), scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight },
      sidewaysScroll: wrap.scrollWidth > wrap.clientWidth + 1,
      listScrolls: wrap.scrollHeight > wrap.clientHeight + 1,
      rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      rowsInView: rows.filter(inWrap).length,
      buttons: buttons.map((b) => b.textContent.trim()),
      buttonsInView: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }),
      award: box(award), awardChip: box(award?.querySelector(".aw-chip")),
      awardsInDom: document.querySelectorAll('[data-testid="win-award"]').length,
      dice: box(dice), diceInView: dice ? inWrap(dice) : null,
      chipsOutsideOpenRow: [...document.querySelectorAll('[data-testid="win-award"]')].filter((a) => a.getClientRects().length && a.closest("[hidden]")).length,
    };
  }

  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    await context.addInitScript((c) => { localStorage.setItem("emberisle-seat", JSON.stringify({ code: c, secret: `${c}-p0` })); localStorage.setItem("emberisle-seat-live", c); }, code);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(url);
    try {
      await page.getByTestId("win-screen").waitFor({ timeout: 120000 });
    } catch (e) {
      await page.screenshot({ path: path.join(out, `fail-${tag}.png`) });
      console.error(await page.evaluate(() => JSON.stringify({ text: document.body.innerText.slice(0, 400), phase: window.__emberisle?.getState().state?.phase, mode: window.__emberisle?.getState().mode })));
      throw e;
    }
    await page.locator('[data-testid="win-row"]').first().waitFor();
    await page.waitForTimeout(2000);
    const shot = (name) => page.screenshot({ path: path.join(out, `${name}-${tag}.png`) });
    const rec = { size: tag };
    rec.before = await page.evaluate(measure);
    await shot("before");
    await page.evaluate(mock, css);
    await page.waitForTimeout(150);
    rec.after = await page.evaluate(measure);
    await shot("after");
    const row = page.locator(`[data-testid="win-row"][data-player="${OPEN}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.tap();
    await page.waitForTimeout(200);
    if ((await row.getAttribute("aria-expanded")) !== "true") fail(`${tag}: tap did not open the row`);
    rec.open = await page.evaluate(measure);
    await shot("open");
    if (height < 600) {
      await page.getByTestId("win-table-wrap").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(150);
      rec.openScrolled = await page.evaluate(measure);
      await shot("open-scrolled");
    }
    for (const k of ["after", "open", "openScrolled"]) {
      const m = rec[k];
      if (!m) continue;
      if (m.sidewaysScroll) fail(`${tag} ${k}: the list scrolls sideways`);
      if (m.rowHeights.some((h) => h < 44)) fail(`${tag} ${k}: a row is under 44 px`);
      if (!m.buttonsInView) fail(`${tag} ${k}: a result button is off screen`);
      if (m.awardsInDom !== 4 && m.awardsInDom !== 3) fail(`${tag} ${k}: ${m.awardsInDom} award chips`);
      if (m.chipsOutsideOpenRow) fail(`${tag} ${k}: a chip shows outside the opened row`);
    }
    if (!rec.open.award) fail(`${tag}: the opened row has no chip`);
    if (rec.after.award) fail(`${tag}: a chip shows with every row closed`);
    result.runs.push(rec);
    console.log(tag, JSON.stringify({ after: rec.after, open: rec.open }));
    await context.close();
  }
  result.errors = errors;
  writeFileSync(path.join(out, "measurements.json"), `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser?.close();
  await vite?.close();
  for (const ws of sockets) ws.terminate();
  host.kill("SIGKILL");
  rmSync(rooms, { recursive: true, force: true });
  if (!save && !keep) rmSync(out, { recursive: true, force: true });
}
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
