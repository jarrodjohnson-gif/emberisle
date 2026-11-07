// #767: profile Wins, the owner's own history and the win screen's profile line, against a real rules host behind an HTTPS
// tunnel hop, with committed result fixtures written by the host's own profile store.
// Store: two wins from three games is 66.7%; an excluded game and a replayed one leave totals as they were. Wire: the Wins
// board ranks wins descending, games ascending, then id, equal wins share a rank, pages by 20, and carries aggregates only;
// history is the credential's own, whatever profile id the request names. Sheet, at 440x956, 956x440 and 1280x720: Wins and
// Your games fit with 44 px controls, take the focus and hand it back; a held reply shows loading, never a zero; a refused
// one says so and Try again recovers; a reply landing after the view closed changes nothing; an empty record says "No
// finished games yet." with no rate. Win screen: a tracked game shows "Saving record…" until the store commits, then each
// profile's committed total, guests "Not tracked"; more pushes never add a win; a one-human game says it isn't tracked.
// With SHOTS=1 it writes the pictures in docs/proofs/767/ at device scale 2.
// Run: npm run profile-records-prove
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const WebSocket = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const root = new URL("../", import.meta.url);
const serverDir = new URL("../server/", import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-profile-records-"));
const SHOTS = process.env.SHOTS === "1" ? "docs/proofs/767" : null;
const ROOMS_DIR = path.join(dir, "rooms");
const PROFILES_DIR = path.join(dir, "profiles");
const RESULTS_DIR = path.join(dir, "pending");
let hostProc, browser, vite;
const ok = (message) => console.log(`ok ${message}`);

// The fixtures, written by the host's own store and rules engine before the host starts. Profiles: ann, bob, cy, dee, eve
// (no games) and f01..f18. Counted games: ann beats bob twice (the second with a bot assisting ann), bob beats ann once;
// cy beats dee twice; each fN beats dee once and f01 once more, so dee has 21 games. Then a one-human game of ann's is
// recorded (excluded) and ann's first game is replayed (duplicate). Rooms: TRAK, cy (p0) and dee (p1) with a guest (p2),
// p1 winning as its turn starts once p0 passes; SOLO, eve (p0) with two bots, the same way.
const SEED = `
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openProfiles } from "./profiles.mjs";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
const store = openProfiles(process.env.PROFILES_DIR, { colors: PLAYER_COLORS });
const ids = {};
const names = ["ann", "bob", "cy", "dee", "eve"];
for (let i = 1; i <= 18; i++) names.push("f" + String(i).padStart(2, "0"));
for (const [i, n] of names.entries()) {
  const made = await store.create({ displayName: n[0].toUpperCase() + n.slice(1), login: n + "-user", pin: "1234", pinConfirm: "1234", color: PLAYER_COLORS[i % 4] });
  ids[n] = made.profile.profileId;
}
let t = Date.UTC(2026, 9, 1, 18);
const outcome = (rows, eligible = true) => {
  t += 3600000;
  const players = rows.map(([who, won, points, extra], i) => ({ pid: "p" + i, seat: "s" + i, profileId: ids[who] ?? null, name: who[0].toUpperCase() + who.slice(1), color: PLAYER_COLORS[i], kind: "human", points, won, assisted: false, ...extra }));
  return { v: 1, gameId: randomUUID(), startedAt: t - 1800000, endedAt: t, policy: 1, eligible, victoryTarget: 10, winner: players.find((p) => p.won).pid, players };
};
const out = {};
const first = outcome([["ann", true, 10], ["bob", false, 7]]);
out.first = await store.recordOutcome(first);
out.assisted = await store.recordOutcome(outcome([["ann", true, 10, { assisted: true }], ["bob", false, 8], ["guest", false, 4]]));
out.third = await store.recordOutcome(outcome([["bob", true, 10], ["ann", false, 9], ["bot", false, 3, { kind: "bot" }]]));
for (let i = 0; i < 2; i++) await store.recordOutcome(outcome([["cy", true, 10], ["dee", false, 5]]));
for (let i = 1; i <= 18; i++) await store.recordOutcome(outcome([["f" + String(i).padStart(2, "0"), true, 10], ["dee", false, 6]]));
await store.recordOutcome(outcome([["f01", true, 10], ["dee", false, 2]]));
out.excluded = await store.recordOutcome(outcome([["ann", true, 10], ["bot", false, 3, { kind: "bot" }], ["bot", false, 2, { kind: "bot" }]], false));
out.duplicate = await store.recordOutcome(first);

function seedGame() {
  let g = createGame({ humans: [{ name: "Cy" }, { name: "Dee" }, { name: "Pine" }], bots: 0, seed: 17 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const p of g.players) for (const k of Object.keys(p.resources)) p.resources[k] = 0;
  g.players[1].hidden.vp = 10;
  g.current = "p0";
  g.phase = "main";
  return g;
}
mkdirSync(process.env.ROOMS_DIR, { recursive: true });
function seedRoom(code, profiles, bots) {
  const game = seedGame();
  game.players.forEach((p, i) => { p.name = profiles[i] ? profiles[i][0].toUpperCase() + profiles[i].slice(1) : bots.includes(p.id) ? "Bot " + i : "Pine"; if (bots.includes(p.id)) p.kind = "bot"; });
  const seats = game.players.map((p, i) => ({ id: "s" + i, name: p.name, color: p.color, ready: true, pid: p.id, secret: code + "-" + p.id, ...(bots.includes(p.id) ? { bot: true } : {}), ...(profiles[i] ? { profileId: ids[profiles[i]] } : {}) }));
  const roster = { v: 1, gameId: randomUUID(), startedAt: Date.now() - 1500000, policy: 1, eligible: seats.filter((s) => !s.bot).length >= 2, players: seats.map((s) => ({ pid: s.pid, seat: s.id, profileId: s.profileId ?? null, name: s.name, color: s.color, kind: s.bot ? "bot" : "human" })) };
  writeFileSync(path.join(process.env.ROOMS_DIR, code + ".json"), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, roster, shape: 2, savedAt: Date.now() }));
}
seedRoom("TRAK", ["cy", "dee", null], []);
seedRoom("SOLO", ["eve", null, null], ["p1", "p2"]);
process.stdout.write(JSON.stringify({ ids, out }));
`;

async function startHost() {
  hostProc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: serverDir,
    env: { ...process.env, PORT: "0", ROOMS_DIR, PROFILES_DIR, RESULTS_DIR, PROFILES_DEV: "", SAVE_MS: "20", ACT_CAP: "1000", ACT_RATE: "1000", GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: "600000",
      // The first four result transactions fail, so the table sees "Saving record…" for about four seconds of retries.
      RESULT_FAULT: "receipt-before:fail:4" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("host startup timed out")), 10000);
    let output = "";
    hostProc.stdout.on("data", (data) => { output += data; const m = output.match(/listening (\d+)/); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    hostProc.once("exit", () => { clearTimeout(timer); reject(Error("host exited before startup")); });
  });
}

// A raw socket straight to the host. Profile frames carry the tunnel's headers so the host lets credentials through.
function socket(port, ip) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, ip ? { headers: { origin: `https://127.0.0.1:${port}`, "cf-connecting-ip": ip, "x-forwarded-proto": "https" } } : {});
  const s = { ws, msgs: [], waiters: [], nextId: 0 };
  ws.on("message", (raw) => { s.msgs.push(JSON.parse(String(raw))); for (const w of s.waiters.splice(0)) w(); });
  s.until = (pred, label, ms = 10000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error(`timed out: ${label}`)), ms);
    const look = () => { const m = s.msgs.find(pred); m ? (clearTimeout(t), resolve(m)) : s.waiters.push(look); };
    look();
  });
  s.send = (m) => ws.send(JSON.stringify(m));
  s.ask = (m) => { const id = ++s.nextId; s.send({ ...m, id }); return s.until((r) => r.id === id, m.type); };
  s.open = new Promise((r, j) => (ws.once("open", r), ws.once("error", j)));
  return s;
}
const lastState = (s) => s.msgs.filter((m) => m.type === "state").at(-1);

try {
  const seeded = JSON.parse(execFileSync(process.execPath, ["--import", "./register.mjs", "--input-type=module", "-e", SEED], { cwd: serverDir, env: { ...process.env, PROFILES_DIR, ROOMS_DIR }, encoding: "utf8" }));
  const { ids, out } = seeded;
  assert.deepEqual(out, { first: "committed", assisted: "committed", third: "committed", excluded: "excluded", duplicate: "duplicate" }, "the fixtures record, exclude and deduplicate");
  ok("fixtures: the store commits the counted games, excludes the one-human game and treats the replay as a duplicate");

  const port = await startHost();

  // --- Wire: ranking, paging, aggregates only, owner-only history -------------------------------------------------------
  {
    const s = socket(port, "198.51.100.40");
    await s.open;
    const sessionOf = async (login) => (await s.ask({ type: "profileLogin", login, pin: "1234" })).credential;
    const ann = await sessionOf("ann-user");
    const record = await s.ask({ type: "profileRecord", credential: ann });
    assert.deepEqual({ ...record.record, lastPlayed: typeof record.record.lastPlayed }, { games: 3, wins: 2, losses: 1, winRate: 66.7, streak: 0, lastPlayed: "number" }, "two wins from three games is 66.7%; the excluded game and the replay add nothing");
    const p1 = await s.ask({ type: "profileWins", credential: ann });
    assert.equal(p1.rows.length, 20);
    assert.equal(p1.next, 20);
    for (const r of p1.rows) assert.deepEqual(Object.keys(r).sort(), ["displayName", "games", "losses", "rank", "streak", "winRate", "wins", "you"], "a Wins row carries aggregates only: no id, login, colour or history");
    const tied = [ids.cy, ids.f01].sort();
    const nameOf = Object.fromEntries(Object.entries(ids).map(([n, id]) => [id, n[0].toUpperCase() + n.slice(1)]));
    assert.deepEqual(p1.rows.slice(0, 3).map((r) => [r.rank, r.displayName, r.wins, r.games]), [[1, nameOf[tied[0]], 2, 2], [1, nameOf[tied[1]], 2, 2], [1, "Ann", 2, 3]], "equal wins share rank 1; fewer games first, then id");
    assert.deepEqual(p1.rows.map((r) => r.you), p1.rows.map((r) => r.displayName === "Ann"), "only the asker's row is marked");
    assert.deepEqual(p1.rows.slice(3).map((r) => r.rank), Array(17).fill(4), "seventeen one-win profiles share rank 4");
    const p2 = await s.ask({ type: "profileWins", credential: ann, after: 20 });
    assert.deepEqual(p2.rows.map((r) => [r.rank, r.displayName, r.wins, r.games, r.winRate]), [[4, "Bob", 1, 3, 33.3], [22, "Dee", 0, 21, 0]], "page 2: Bob after the one-game winners, Dee last");
    assert.equal(p2.next, null);
    assert.ok(!p1.rows.concat(p2.rows).some((r) => r.displayName === "Eve"), "a profile with no counted game is not ranked");
    const history = await s.ask({ type: "profileHistory", credential: ann, profileId: ids.dee });
    assert.equal(history.rows.length, 3, "history is the credential's own, whatever profile id the request names");
    assert.deepEqual(history.rows.map((r) => [r.won, r.assisted]), [[false, false], [true, true], [true, false]], "newest first, with the bot's assist marked");
    const refused = await s.ask({ type: "profileHistory", profileId: ids.dee });
    assert.equal(refused.type, "profileError", "no credential, no history");
    const dee = await sessionOf("dee-user");
    const d1 = await s.ask({ type: "profileHistory", credential: dee });
    const d2 = await s.ask({ type: "profileHistory", credential: dee, before: d1.next });
    assert.deepEqual([d1.rows.length, d2.rows.length, d2.next, new Set([...d1.rows, ...d2.rows].map((r) => r.gameId)).size], [20, 1, null, 21], "dee's 21 games page as 20 and 1");
    s.ws.close();
    ok("wire: 66.7% from 2 of 3; ties share a rank; Wins pages by 20 and carries aggregates only; history is owner-only and pages by 20");
  }

  // --- The browser, behind an HTTPS tunnel hop. One tunnel address per page keeps the per-address request budget apart. --
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const proxy = {};
  for (let i = 0; i < 30; i++) proxy[`^/h${i}(?:[/?]|$)`] = { target: `ws://127.0.0.1:${port}`, ws: true, changeOrigin: false, headers: { "cf-connecting-ip": `198.51.100.${100 + i}`, "x-forwarded-proto": "https" } };
  vite = await createServer({ root: root.pathname, logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false, https: { key: readFileSync(path.join(dir, "key.pem")), cert: readFileSync(path.join(dir, "cert.pem")) }, proxy } });
  await vite.listen();
  const origin = `https://127.0.0.1:${vite.httpServer.address().port}`;
  let lane = 0;
  const nextHost = () => `${origin.replace("https:", "wss:")}/h${lane++}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  // Every frame, and switches to hold the next reply of one type for a while, or refuse every reply of one type until cleared. The app's handlers
  // see only what this lets through, in order.
  const observe = () => {
    window.__wire = [];
    window.__tamper = {};
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        let app = null;
        Object.defineProperty(this, "onmessage", { configurable: true, get: () => app, set: (fn) => { app = fn; } });
        this.addEventListener("message", (e) => {
          let raw = String(e.data);
          window.__wire.push({ url: this.url, dir: "in", raw });
          let m = null;
          try { m = JSON.parse(raw); } catch { /* not json */ }
          const t = window.__tamper;
          if (m && t.fail === m.type) raw = JSON.stringify({ type: "profileError", id: m.id, code: "unavailable" });
          const deliver = () => app?.call(this, new MessageEvent("message", { data: raw }));
          if (m && t.hold?.type === m.type) { const ms = t.hold.ms; t.hold = null; setTimeout(deliver, ms); } else deliver();
        });
      }
      send(raw) { window.__wire.push({ url: this.url, dir: "out", raw: String(raw) }); return super.send(raw); }
    };
  };
  const open = async (opts, init = []) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
    await ctx.addInitScript(observe);
    for (const [script, arg] of init) await ctx.addInitScript(script, arg);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !/WebSocket connection|ERR_CONNECTION_REFUSED/.test(m.text()) && errors.push(m.text()));
    return page;
  };
  const goto = async (page, hostUrl) => { await page.goto(`${origin}/?host=${encodeURIComponent(hostUrl)}`); await page.waitForFunction(() => window.__emberisle); };
  const sheet = (page) => page.getByRole("dialog", { name: "Profile" });
  const openSheet = async (page) => {
    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) await page.locator("details.seat-settings > summary").click();
    const button = page.getByRole("button", { name: "Profile", exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await sheet(page).waitFor();
  };
  const signIn = async (opts, login) => {
    const page = await open(opts);
    await goto(page, nextHost());
    await openSheet(page);
    await sheet(page).getByLabel("Login").fill(login);
    await sheet(page).getByLabel("PIN", { exact: true }).fill("1234");
    await sheet(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await sheet(page).getByText("Signed in as").waitFor();
    return page;
  };
  const view = async (page, name, heading) => {
    await sheet(page).getByRole("button", { name, exact: true }).click();
    await sheet(page).getByRole("heading", { name: heading }).waitFor();
  };
  const records = (page) => page.getByTestId("profile-records");
  const loaded = (page) => page.waitForFunction(() => document.querySelector('[data-testid="profile-records"]')?.getAttribute("aria-busy") === "false", null, { timeout: 10000 });
  const stats = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((d) => [d.dataset.stat, d.textContent])));
  const fits = async (page, label) => {
    const bad = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="profile-sheet"]');
      const out = [];
      const r = d.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(`sheet ${r.left},${r.top},${r.right},${r.bottom}`);
      for (const el of [d, d.querySelector(".overflow-y-auto")]) if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} scrolls sideways`);
      for (const el of d.querySelectorAll("button")) {
        const b = el.getBoundingClientRect();
        if (b.height < 44 || b.width < 44) out.push(`${el.getAttribute("aria-label") || el.textContent.trim()} ${b.width}x${b.height}`);
      }
      const back = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === "Back").getBoundingClientRect();
      if (back.top < r.top || back.bottom > r.bottom + 0.5) out.push(`Back outside the sheet ${back.top},${back.bottom}`);
      return out;
    });
    assert.deepEqual(bad, [], `${label}: sheet on screen, nothing scrolls sideways, every control at least 44 px, Back in view`);
  };
  const focusOn = (page) => page.evaluate(() => [document.activeElement?.tagName, document.activeElement?.getAttribute("data-opens"), document.activeElement?.textContent]);
  const returned = (page, to) => page.waitForFunction((to) => document.activeElement?.getAttribute("data-opens") === to, to, { timeout: 5000 });

  // --- The sheet at the three sizes -----------------------------------------------------------------------------------------
  const sizes = [
    { name: "440x956", opts: { viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true } },
    { name: "956x440", opts: { viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true } },
    { name: "1280x720", opts: { viewport: { width: 1280, height: 720 } } },
  ];
  for (const size of sizes) {
    const page = await signIn(size.opts, "ann-user");
    await view(page, "Wins", "Wins");
    await loaded(page);
    assert.deepEqual(await focusOn(page), ["H3", null, "Wins"], `${size.name}: Wins takes the focus on its title`);
    assert.equal(await records(page).getByRole("alert").count(), 0, `${size.name}: Wins loaded: ${await records(page).innerText()}`);
    const own = await stats(page);
    assert.equal(own.Games, "3");
    assert.equal(own.Wins, "2");
    assert.equal(own.Losses, "1");
    assert.equal(own["Win rate"], "66.7%", `${size.name}: two wins from three games shows 66.7%, beside the games`);
    assert.equal(own.Streak, "0");
    assert.notEqual(own["Last played"], "—");
    const rows = () => page.locator('[data-testid="wins-row"]');
    assert.equal(await rows().count(), 20);
    assert.deepEqual(await rows().evaluateAll((r) => r.slice(0, 3).map((x) => [x.dataset.rank, x.dataset.you ?? ""])), [["1", ""], ["1", ""], ["1", "true"]], `${size.name}: three share rank 1, Ann marked as you`);
    await sheet(page).getByRole("button", { name: "Show more" }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="wins-row"]').length === 22);
    assert.deepEqual(await rows().evaluateAll((r) => r.slice(20).map((x) => [x.dataset.rank, x.querySelector('[data-testid="wins-count"]').textContent])), [["4", "1 win"], ["22", "0 wins"]]);
    assert.equal(await sheet(page).getByRole("button", { name: "Show more" }).count(), 0, `${size.name}: no Show more on the last page`);
    await fits(page, `${size.name} Wins`);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.querySelector('[data-testid="profile-sheet"]').contains(document.activeElement)), `${size.name}: Tab stays in the sheet`);
    }
    await sheet(page).getByRole("button", { name: "Back", exact: true }).click();
    await returned(page, "wins");
    await view(page, "Your games", "Your games");
    await loaded(page);
    assert.equal(await page.locator('[data-testid="history-row"]').count(), 3);
    assert.equal(await sheet(page).getByText("A bot played your seat for part of this game.").count(), 1, `${size.name}: the assisted game is marked`);
    assert.match(await page.locator('[data-testid="history-row"]').first().innerText(), /^Lost · 9 points/, `${size.name}: newest first, with the final points`);
    assert.match(await page.locator('[data-testid="history-row"]').first().innerText(), /Bob 10 \(winner\)/);
    await fits(page, `${size.name} Your games`);
    await sheet(page).getByRole("button", { name: "Back", exact: true }).click();
    await returned(page, "history");
    await page.keyboard.press("Escape");
    await sheet(page).waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Profile", `${size.name}: Escape returns focus to Profile`);
    assert.ok(await page.getByRole("button", { name: "Host a table" }).isVisible(), `${size.name}: guest Host stays usable`);
    await page.context().close();
  }
  ok("sheet: Wins and Your games fit at 440x956, 956x440 and 1280x720 with 44 px controls; 66.7% beside 3 games; ties share rank; Show more pages; focus moves in, stays in and returns");

  // --- Loading, refusal, a stale reply, paging history and an empty record ------------------------------------------------
  {
    const desk = sizes[2].opts;
    const page = await signIn(desk, "ann-user");
    // Held: the view says it is loading and shows no number at all.
    await page.evaluate(() => { window.__tamper.hold = { type: "profileWins", ms: 2000 }; });
    await sheet(page).getByRole("button", { name: "Wins", exact: true }).click();
    await sheet(page).getByRole("status").filter({ hasText: "Loading records…" }).waitFor();
    assert.equal(await page.locator("[data-stat], [data-testid=wins-row]").count(), 0, "loading shows no stats and no rows");
    assert.doesNotMatch(await records(page).innerText(), /\d|%/, "loading invents no number and no rate");
    // Closed before the reply lands: the summary stays and the late rows never draw.
    await sheet(page).getByRole("button", { name: "Back", exact: true }).click();
    await returned(page, "wins");
    await page.waitForTimeout(2500);
    assert.equal(await page.locator("[data-testid=wins-row]").count(), 0, "a reply after the view closed draws nothing");
    assert.ok(await sheet(page).getByText("Signed in as Ann").isVisible());
    // Refused: it says so, shows no number, and Try again loads the committed record.
    await page.evaluate(() => { window.__tamper.fail = "profileRecord"; });
    await view(page, "Wins", "Wins");
    await sheet(page).getByRole("alert").filter({ hasText: "Profiles unavailable on this host." }).waitFor();
    assert.equal(await page.locator("[data-stat], [data-testid=wins-row]").count(), 0, "a refusal shows no stats and no rows");
    assert.doesNotMatch(await records(page).innerText(), /\d|%|No finished games/, "a refusal is not an empty record");
    await page.evaluate(() => { window.__tamper.fail = null; });
    await sheet(page).getByRole("button", { name: "Try again" }).click();
    await loaded(page);
    assert.equal((await stats(page))["Win rate"], "66.7%", "Try again loads the committed record");
    await page.context().close();

    const dee = await signIn(desk, "dee-user");
    await view(dee, "Your games", "Your games");
    await loaded(dee);
    assert.equal(await dee.locator('[data-testid="history-row"]').count(), 20);
    await sheet(dee).getByRole("button", { name: "Show more" }).click();
    await dee.waitForFunction(() => document.querySelectorAll('[data-testid="history-row"]').length === 21);
    assert.equal(await sheet(dee).getByRole("button", { name: "Show more" }).count(), 0, "history ends after 21 games");
    await dee.context().close();

    const eve = await signIn(desk, "eve-user");
    await view(eve, "Wins", "Wins");
    await loaded(eve);
    assert.equal(await eve.getByTestId("records-empty").innerText(), "No finished games yet.");
    assert.equal(await eve.locator("[data-stat]").count(), 0, "an empty record shows no stats and no rate");
    assert.equal(await eve.locator('[data-testid="wins-row"][data-you]').count(), 0, "an empty record is not ranked");
    await sheet(eve).getByRole("button", { name: "Back", exact: true }).click();
    await view(eve, "Your games", "Your games");
    await loaded(eve);
    assert.equal(await eve.getByTestId("records-empty").innerText(), "No finished games yet.");
    await eve.context().close();
  }
  ok("states: a held reply shows loading and no zero; a refusal says so and Try again recovers; a late reply after Back draws nothing; history pages 20 + 1; an empty record says No finished games yet with no rate");

  // --- The win screen --------------------------------------------------------------------------------------------------------
  const seat = (code, pid) => [(s) => { localStorage.setItem("emberisle-seat", JSON.stringify(s)); localStorage.setItem("emberisle-seat-live", s.code); }, { code, secret: `${code}-${pid}` }];
  const notes = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="win-row"]')].map((r) => [r.dataset.player, r.closest("tr, li").querySelector('[data-testid="win-profile"]')?.textContent ?? null])));
  {
    const phone = await open(sizes[0].opts, [seat("TRAK", "p1")]);
    const desk = await open(sizes[2].opts, [seat("TRAK", "p2")]);
    for (const p of [phone, desk]) {
      await goto(p, nextHost());
      await p.waitForFunction(() => window.__emberisle.getState().state?.phase === "main", null, { timeout: 15000 });
    }
    let cy = socket(port);
    await cy.open;
    cy.send({ type: "hello", code: "TRAK", secret: "TRAK-p0" });
    await cy.until((m) => m.type === "state" && m.actionStamp, "cy's seat");
    const st = lastState(cy);
    cy.send({ type: "pass", cid: "pass-1", turn: st.actionStamp.turn, baseSeq: st.actionStamp.baseSeq, connection: st.actionStamp.connection });
    await cy.until((m) => m.type === "state" && m.game.phase === "over", "the win");
    assert.deepEqual(lastState(cy).result, { tracked: true, wins: { p0: null, p1: null } }, "the first terminal state carries no count while the record saves");
    for (const p of [phone, desk]) await p.getByTestId("win-screen").waitFor();
    assert.deepEqual(await notes(phone), { p1: "Saving record…", p0: "Saving record…", p2: "Not tracked" }, "phone list: saving, and the guest is not tracked");
    assert.deepEqual(await notes(desk), { p1: "Saving record…", p0: "Saving record…", p2: "Not tracked" }, "desktop table: the same");
    await phone.waitForFunction(() => document.querySelector('[data-player="p1"]')?.closest("li")?.textContent.includes("1 profile win"), null, { timeout: 15000 });
    const committed = { p1: "1 profile win", p0: "2 profile wins", p2: "Not tracked" };
    assert.deepEqual(await notes(phone), committed, "phone list: the committed totals");
    await desk.waitForFunction(() => document.querySelector('[data-player="p1"]')?.closest("tr")?.textContent.includes("1 profile win"), null, { timeout: 5000 });
    assert.deepEqual(await notes(desk), committed, "desktop table: the committed totals");
    assert.deepEqual(lastState(cy).result, { tracked: true, wins: { p0: 2, p1: 1 } });
    // More terminal pushes (a rejoin, and another) re-read the store; none adds a win.
    const overs = cy.msgs.filter((m) => m.type === "state" && m.game.phase === "over").length;
    for (let i = 0; i < 2; i++) {
      cy.ws.close();
      const again = socket(port);
      await again.open;
      again.send({ type: "hello", code: "TRAK", secret: "TRAK-p0" });
      await again.until((m) => m.type === "state" && m.game.phase === "over", "the rejoin");
      assert.deepEqual(lastState(again).result, { tracked: true, wins: { p0: 2, p1: 1 } }, "a repeated terminal push carries the same totals");
      cy = again;
    }
    assert.ok(overs >= 2, `the table got the win and the committed push (${overs} terminal states)`);
    await phone.waitForTimeout(500);
    assert.deepEqual(await notes(phone), committed, "the phone list still shows the same totals after more pushes");
    const s = socket(port, "198.51.100.41");
    await s.open;
    const dee = (await s.ask({ type: "profileLogin", login: "dee-user", pin: "1234" })).credential;
    const rec = (await s.ask({ type: "profileRecord", credential: dee })).record;
    assert.deepEqual([rec.games, rec.wins, rec.streak], [22, 1, 1], "the store counted the game once");
    s.ws.close();
    cy.ws.close();
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await phone.screenshot({ path: `${SHOTS}/win-committed-440x956.png` });
    }
    await phone.context().close();
    await desk.context().close();
  }
  ok("win screen: Saving record… until the store commits, then each profile's committed total on the phone list and the desktop table; the guest says Not tracked; repeated pushes never add a win");

  {
    const eve = socket(port);
    await eve.open;
    eve.send({ type: "hello", code: "SOLO", secret: "SOLO-p0" });
    await eve.until((m) => m.type === "state" && m.actionStamp, "eve's seat");
    const st = lastState(eve);
    eve.send({ type: "pass", cid: "pass-2", turn: st.actionStamp.turn, baseSeq: st.actionStamp.baseSeq, connection: st.actionStamp.connection });
    await eve.until((m) => m.type === "state" && m.game.phase === "over", "the bot's win");
    assert.deepEqual(lastState(eve).result, { tracked: false, wins: { p0: null } }, "a one-human game is not tracked");
    eve.ws.close();
    const page = await open(sizes[2].opts, [seat("SOLO", "p0")]);
    await goto(page, nextHost());
    await page.getByTestId("win-screen").waitFor();
    assert.equal(await page.getByTestId("win-untracked").innerText(), "This game isn't tracked.");
    assert.equal(await page.getByTestId("win-profile").count(), 0, "no row claims a profile win");
    await page.context().close();
  }
  ok("win screen: a one-human game says This game isn't tracked and no row shows a count");

  // --- Pictures for the owner ------------------------------------------------------------------------------------------------
  if (SHOTS) {
    const devices = [
      { name: "430x932", opts: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
      { name: "390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
      { name: "375x812", opts: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
      { name: "820x1180", opts: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
      { name: "844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
      { name: "1280x720", opts: { viewport: { width: 1280, height: 720 } } },
    ];
    for (const d of devices) {
      const opts = { ...d.opts, deviceScaleFactor: 2 };
      const page = await signIn(opts, "ann-user");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/summary-${d.name}.png` });
      await view(page, "Wins", "Wins");
      await loaded(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/wins-${d.name}.png` });
      await sheet(page).getByRole("button", { name: "Back", exact: true }).click();
      await view(page, "Your games", "Your games");
      await loaded(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/history-${d.name}.png` });
      await page.context().close();
      const win = await open(opts, [seat("TRAK", "p1")]);
      await goto(win, nextHost());
      await win.getByTestId("win-screen").waitFor();
      await win.waitForTimeout(800);
      await win.screenshot({ path: `${SHOTS}/win-${d.name}.png` });
      await win.context().close();
    }
    const solo = await open({ ...devices[1].opts, deviceScaleFactor: 2 }, [seat("SOLO", "p0")]);
    await goto(solo, nextHost());
    await solo.getByTestId("win-screen").waitFor();
    await solo.waitForTimeout(800);
    await solo.screenshot({ path: `${SHOTS}/win-untracked-390x844.png` });
    await solo.context().close();
    ok(`pictures in ${SHOTS}`);
  }

  assert.deepEqual(errors, [], "no page errors");
  console.log("profile-records-prove: all passed");
} finally {
  await browser?.close();
  await vite?.close();
  hostProc?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
