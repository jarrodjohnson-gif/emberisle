// #1110: a state the host pushes while "Take from whom?" is open (another seat rejoining) must not close it.
// A push that changes the turn or phase still does. Run: npm run steal-picker-push-prove
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction, stealTargets } from "../src/lib/game/rules.ts";

// Board seeds do not seed rollDie's crypto entropy. Control only this proof's
// one-word dice draws, restoring the native method and descriptor afterwards.
function fixtureDice(words, restoreOnLast = false) {
  const native = crypto.getRandomValues;
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
  let draws = 0;
  const restore = () => {
    if (descriptor) Object.defineProperty(crypto, "getRandomValues", descriptor);
    else delete crypto.getRandomValues;
    // Also runs inside the child host before its second die returns.
    if (crypto.getRandomValues !== native || Object.hasOwn(crypto, "getRandomValues") !== Boolean(descriptor))
      throw new Error("fixture: native entropy method and ownership not restored");
  };
  Object.defineProperty(crypto, "getRandomValues", { configurable: true, writable: true, value(values) {
    if (!(values instanceof Uint32Array) || values.length !== 1) return native.call(crypto, values);
    if (draws === words.length) throw new Error("fixture: unexpected extra die");
    values[0] = words[draws++];
    if (restoreOnLast && draws === words.length) restore();
    return values;
  } });
  return () => {
    restore();
    if (draws !== words.length) throw new Error(`fixture: used ${draws} of ${words.length} dice`);
    if (crypto.getRandomValues !== native) throw new Error("fixture: native dice entropy not restored");
  };
}
function withDice(words, run) {
  const done = fixtureDice(words);
  try { return run(); } finally { done(); }
}

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-steal-push-"));
const code = "XSPA";
let game = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
withDice([5, 3, 1], () => { // Roll-off faces 6,4,2: no tie or random setup order.
while (game.phase !== "roll") {
  const next = applyAction(game, game.current, chooseBotAction(game, game.current));
  if (next.error) throw new Error(next.error);
  game = next.state;
}
});
game.players.sort((a, b) => a.id.localeCompare(b.id));
// One hex with p1 and p2 both on a corner, both holding goods, and the wayfarer elsewhere.
const hex = game.hexes.find((h) => h.id !== game.robberHex && h.terrain !== "waste");
const corners = game.vertices.filter((v) => v.hexes.includes(hex.id));
for (const v of corners) v.building = null;
corners[0].building = { playerId: "p1", kind: "outpost" };
corners[2].building = { playerId: "p2", kind: "outpost" };
for (const p of game.players) p.resources = { timber: 2, grain: 2, ore: 0, clay: 0, wool: 0 };
game.current = "p0";
game.phase = "robber";
game.turn = 7;
if (stealTargets(game, hex.id, "p0").length !== 2) throw new Error("setup: expected two victims");
const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `sp-${p.id}` }));
writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));

// Separate room: a playable old Knight before the roll, with the same two victims.
const knightGame = structuredClone(game);
knightGame.phase = "roll";
knightGame.players.find(p => p.id === "p0").hidden.knight = 1;
const knightIndex = knightGame.deck.indexOf("knight");
if (knightIndex < 0) throw new Error("setup: no Knight in deck");
knightGame.deck.splice(knightIndex, 1);
const rolled = withDice([3, 3], () => applyAction(knightGame, "p0", { type: "roll" }));
if (rolled.error || rolled.state.phase !== "main" || rolled.state.current !== "p0" || stealTargets(rolled.state, hex.id, "p0").length !== 2)
  throw new Error("setup: seeded roll must leave the same player and two legal victims");
writeFileSync(path.join(dir, "XSPB.json"), JSON.stringify({ code: "XSPB", host: "s0", next: 3, chat: [], chatSeq: 0, game: knightGame, seats, shape: 2, savedAt: Date.now() }));
// The authoritative host rolls independently of the setup process. Its only
// roll must use the same 4+4 fixture, then native entropy resumes immediately.
const hostDice = path.join(dir, "dice.mjs");
writeFileSync(hostDice, `(${fixtureDice.toString()})([3, 3], true);`);

let host, vite, browser;
let hostErrors = "";
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};
const until = async (fn, label, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`timed out: ${label}; ${hostErrors}`);
};
const peek = (page) => page.evaluate(() => {
  const s = window.__emberisle.getState();
  return { picker: s.pendingSteal, bar: document.querySelectorAll('[aria-label="The wayfarer takes a card"] button').length, phase: s.state?.phase, current: s.state?.current, pushes: window.__pushes };
});
try {
  host = spawn(process.execPath, ["--import", hostDice, "--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, PROFILES_DIR: path.join(dir, "profiles"), TURN_MS: "600000", GRACE_MS: "120000", HOLD_MS: "180000", ACT_CAP: "1000", ACT_RATE: "1000" } });
  host.stderr.on("data", (d) => { hostErrors += d; });
  const port = await new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", (c) => reject(new Error(`host exited ${c}: ${hostErrors}`)));
  });
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const seat = async (i) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    await page.addInitScript(({ code, secret }) => {
      localStorage.setItem("emberisle-seat", JSON.stringify({ code, secret }));
      localStorage.setItem("emberisle-seat-live", code);
      HTMLMediaElement.prototype.play = () => Promise.resolve();
    }, { code, secret: `sp-p${i}` });
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__emberisle.getState().legal, null, { timeout: 30000 });
    return page;
  };
  const a = await seat(0);
  const b = await seat(1);
  // Count pushes in the page: every host state ends in loadState.
  await a.evaluate(() => {
    window.__pushes = 0;
    window.__emberisle.subscribe((s, prev) => { if (s.state !== prev.state) window.__pushes++; });
  });

  await a.evaluate((id) => window.__emberisle.getState().pickHex(id), hex.id);
  await a.getByText("Take from whom?").waitFor();
  const open = await peek(a);
  check("picker opens with both victims", open.picker?.targets.length === 2 && open.bar === 2, open);

  // Case 1: a third seat joins; the host pushes a state to everyone and the turn is unchanged.
  const pushed = open.pushes;
  const c = await seat(2);
  await until(async () => (await peek(a)).pushes > pushed, "push reached the picker's seat");
  const kept = await peek(a);
  check("a push that leaves the turn alone keeps the picker", kept.picker?.hexId === hex.id && kept.picker.targets.length === 2 && kept.bar === 2, kept);
  await c.close();
  await b.close();

  // Case 2: a push that changes whose turn it is closes it.
  await a.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = "p1";
    st.seq++;
    g.getState().loadState(st, g.getState().localId, g.getState().isHost, g.getState().code);
  });
  const moved = await peek(a);
  check("a push that changes the current player closes the picker", moved.picker === null && moved.bar === 0, moved);

  // Case 3: same turn, but the host no longer lists two victims for the hex.
  await a.evaluate((id) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = "p0";
    g.setState({ state: st, pendingSteal: { hexId: id, kind: "moveRobber", targets: ["p1", "p2"] } });
    const legal = structuredClone(g.getState().legal);
    legal.steal[id] = ["p1"];
    g.setState({ legal });
    g.getState().loadState(st, g.getState().localId, g.getState().isHost, g.getState().code);
  }, hex.id);
  const stale = await peek(a);
  check("a push that leaves one victim does not keep a stale list", stale.picker === null, stale);

  // Case 4: the real host rolls while an old Knight's victim picker is open.
  const knightPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await knightPage.addInitScript(() => {
    localStorage.setItem("emberisle-seat", JSON.stringify({ code: "XSPB", secret: "sp-p0" }));
    localStorage.setItem("emberisle-seat-live", "XSPB");
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await knightPage.goto(url);
  await knightPage.waitForFunction(() => window.__emberisle?.getState().state && window.__emberisle.getState().legal, null, { timeout: 30000 });
  await knightPage.getByTestId("fortunes-button").click();
  await knightPage.getByTestId("fortune-play-knight").click();
  await knightPage.evaluate(id => window.__emberisle.getState().pickHex(id), hex.id);
  await knightPage.getByText("Take from whom?").waitFor();
  const knightOpen = await knightPage.evaluate(id => { const s = window.__emberisle.getState(); return { phase: s.state.phase, current: s.state.current, picker: s.pendingSteal, targets: s.legal.steal[id] }; }, hex.id);
  check("Knight picker opens before roll with two victims", knightOpen.phase === "roll" && knightOpen.current === "p0" && knightOpen.picker?.kind === "playKnight" && knightOpen.targets.length === 2, knightOpen);
  await knightPage.getByRole("button", { name: "Roll", exact: true }).click();
  await knightPage.waitForFunction(() => window.__emberisle.getState().state.phase === "main");
  const knightAfter = await knightPage.evaluate(id => { const s = window.__emberisle.getState(); return { phase: s.state.phase, current: s.state.current, knight: s.state.players.find(p => p.id === s.localId).hidden.knight, picker: s.pendingSteal, targets: s.legal.steal[id], bar: document.querySelectorAll('[aria-label="The wayfarer takes a card"] button').length, dice: s.state.dice }; }, hex.id);
  check("real host uses the same non-seven dice as the setup", knightAfter.dice?.[0] === rolled.state.dice[0] && knightAfter.dice?.[1] === rolled.state.dice[1] && knightAfter.dice[0] === 4 && knightAfter.dice[1] === 4, knightAfter.dice);
  check("same-player roll closes Knight picker despite two legal victims", knightAfter.current === "p0" && knightAfter.knight === 1 && knightAfter.targets.length === 2 && knightAfter.picker === null && knightAfter.bar === 0, knightAfter);
  await knightPage.close();
  if (hostErrors) check("host stayed quiet", false, hostErrors);
  if (fails.length) throw new Error(`FAIL steal-picker-push-prove: ${fails.join("; ")}`);
  console.log("PASS steal-picker-push-prove");
} finally {
  await browser?.close();
  await vite?.close();
  host?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
