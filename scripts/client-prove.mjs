// L13.4 Debug: open the browser client, play setup and one roll versus the bots, and fail on any console error.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8091;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  // Cloud sessions ship Chromium here. On your own PC, run `npx playwright install chromium` once.
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play versus the isle" }).click();

  // Place the human's outposts and paths through the same store the canvas clicks use.
  const phase = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      const s = g.getState();
      const st = s.state;
      if (!st) return "no state";
      if (st.phase !== "setupSettle" && st.phase !== "setupRoad") return st.phase;
      if (st.current === s.localId) {
        const hi = s.highlights();
        if (st.phase === "setupSettle") s.pickVertex(hi.vertices[0]);
        else s.pickEdge(hi.edges[0]);
      }
      await sleep(100);
    }
    return "stuck in " + g.getState().state.phase;
  });
  console.log("after setup:", phase);

  const rolled = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 200; i++) {
      const s = g.getState();
      if (s.state.current === s.localId && s.state.phase === "roll") {
        const r = s.dispatch({ type: "roll" });
        return r.ok ? g.getState().state.dice : r.error;
      }
      await sleep(100);
    }
    return "never my roll";
  });
  console.log("rolled:", rolled);
  // #188: the roll banner shows offline too.
  const bannerText = await page.getByTestId("banner").textContent({ timeout: 2000 }).catch(() => null);
  console.log("roll banner:", JSON.stringify(bannerText));

  // #189: a hex with two bots on it must ask "Take from whom?" offline too, and the pick moves one card.
  const steal = await page.evaluate(async () => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = g.getState().localId;
    const bots = st.players.filter((p) => p.id !== me).slice(0, 2);
    const hex = st.hexes.find((h) => h.terrain !== "waste" && h.id !== st.robberHex);
    const corners = st.vertices.filter((v) => v.hexes.includes(hex.id));
    for (const v of st.vertices) v.building = null;
    corners[0].building = { playerId: bots[0].id, kind: "outpost" };
    corners[1].building = { playerId: bots[1].id, kind: "outpost" };
    for (const p of st.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    bots[0].resources.ore = 2;
    bots[1].resources.wool = 2;
    st.phase = "robber";
    st.current = me;
    g.setState({ state: st, pendingSteal: null, error: null });
    g.getState().pickHex(hex.id);
    const pending = g.getState().pendingSteal;
    await new Promise((r) => setTimeout(r, 100)); // let React paint the picker
    const asked = document.body.innerText.includes("Take from whom?");
    g.getState().chooseSteal(bots[1].id);
    const after = g.getState().state;
    const mine = after.players.find((p) => p.id === me).resources;
    const victim = after.players.find((p) => p.id === bots[1].id).resources;
    return { targets: pending?.targets.length ?? 0, asked, got: mine.wool, left: victim.wool, phase: after.phase, cleared: g.getState().pendingSteal === null };
  });
  console.log("offline steal picker:", JSON.stringify(steal));

  // #184: the path, plenty, and monopoly fortunes each have a way to be played from the HUD.
  const arm = (hidden) =>
    page.evaluate((hidden) => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const me = g.getState().localId;
      const mine = st.players.find((p) => p.id === me);
      st.phase = "main";
      st.current = me;
      st.playedCard = false;
      mine.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...hidden };
      mine.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      mine.pathsLeft = 10;
      for (const p of st.players) if (p.id !== me) p.resources.ore = 2;
      st.bank.ore = 10;
      st.bank.wool = 10;
      g.setState({ state: st, buildMode: "none", roadPicks: [], pendingSteal: null, error: null });
      return { ore: mine.resources.ore, wool: mine.resources.wool };
    }, hidden);
  await arm({ road: 1 });
  const road = await page.evaluate(() => {
    const g = window.__emberisle;
    const me = g.getState().localId;
    const had = g.getState().state.edges.filter((e) => e.path === me).length;
    g.getState().setBuildMode("roadCard");
    const first = g.getState().highlights().edges;
    g.getState().pickEdge(first[0]);
    const picked = g.getState().roadPicks.length;
    const second = g.getState().highlights().edges;
    g.getState().pickEdge(second[0]);
    const st = g.getState().state;
    return {
      first: first.length,
      picked,
      second: second.length,
      laid: st.edges.filter((e) => e.path === me).length - had,
      cardLeft: st.players.find((p) => p.id === me).hidden.road,
      played: st.playedCard,
      mode: g.getState().buildMode,
      error: g.getState().error,
    };
  });
  console.log("path fortune:", JSON.stringify(road));
  const before = await arm({ plenty: 1 });
  await page.selectOption("select[name=plentyA]", "ore");
  await page.selectOption("select[name=plentyB]", "wool");
  await page.getByRole("button", { name: "Plenty", exact: true }).click();
  const plenty = await page.evaluate((before) => {
    const g = window.__emberisle;
    const me = g.getState().state.players.find((p) => p.id === g.getState().localId);
    return { ore: me.resources.ore - before.ore, wool: me.resources.wool - before.wool, cardLeft: me.hidden.plenty, error: g.getState().error };
  }, before);
  console.log("plenty fortune:", JSON.stringify(plenty));
  const mono = await arm({ monopoly: 1 });
  await page.selectOption("select[name=monopoly]", "ore");
  await page.getByRole("button", { name: "Monopoly", exact: true }).click();
  const monopoly = await page.evaluate((before) => {
    const g = window.__emberisle;
    const st = g.getState().state;
    const me = st.players.find((p) => p.id === g.getState().localId);
    return { gained: me.resources.ore - before.ore, othersLeft: st.players.filter((p) => p !== me).reduce((n, p) => n + p.resources.ore, 0), cardLeft: me.hidden.monopoly, error: g.getState().error };
  }, mono);
  console.log("monopoly fortune:", JSON.stringify(monopoly));

  // #163: a bank trade through the trade panel. Only the rate harborRate gives this player shows on the button.
  await arm({});
  const oreBefore = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = st.players.find((p) => p.id === g.getState().localId);
    me.resources.ore = 4;
    g.setState({ state: st });
    return me.resources.wool;
  });
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await page.getByTestId("trade-panel").waitFor();
  const askOffline = await page.getByRole("button", { name: "Ask the table" }).count();
  await page.getByRole("button", { name: "More ore to give" }).click();
  await page.getByRole("button", { name: "More wool to want" }).click();
  const rateButton = page.getByRole("button", { name: /^(Bank 4|Dock 3|Dock 2):1$/ });
  const rateLabel = await rateButton.textContent();
  await rateButton.click();
  const bankTrade = await page.evaluate((woolBefore) => {
    const g = window.__emberisle;
    const me = g.getState().state.players.find((p) => p.id === g.getState().localId);
    return { ore: 4 - me.resources.ore, wool: me.resources.wool - woolBefore, open: g.getState().tradeOpen, error: g.getState().error };
  }, oreBefore);
  console.log("bank trade through the panel:", rateLabel, JSON.stringify(bankTrade), `ask-the-table buttons offline: ${askOffline}`);
  await page.waitForTimeout(1500);
  mkdirSync("test-results", { recursive: true });
  // Software WebGL on a 2-CPU CI runner can take a while to finish one frame of the island.
  await page.screenshot({ path: "test-results/client-prove.png", timeout: 120_000 });
  console.log("screenshot: test-results/client-prove.png");

  // Online the host runs bots (#221), and leaving a table clears its leftovers (#222).
  const online = await page.evaluate(async () => {
    const g = window.__emberisle;
    const acts = [];
    const s = g.getState().state;
    const bot = s.players.find((p) => p.kind === "bot");
    g.setState({ mode: "online", net: { act: (a) => (acts.push(a), true), close: () => {} }, state: { ...s, phase: "main", current: bot.id, seq: s.seq + 1 } });
    await new Promise((r) => setTimeout(r, 1500));
    const botActs = acts.length;
    g.setState({ lobbyLog: "Pine left.", pendingPlace: { kind: "edge", id: "x" }, seatId: "s1", isHost: true, roadPicks: ["e"], toast: "old" });
    g.getState().goTitle();
    const t = g.getState();
    return { botActs, log: t.lobbyLog, place: t.pendingPlace, seat: t.seatId, host: t.isHost, picks: t.roadPicks.length, toast: t.toast, screen: t.screen };
  });
  console.log("online bots + leave:", JSON.stringify(online));

  // #218: a knight can be played before the roll from the HUD; the phase stays roll and Roll still works.
  await page.getByRole("button", { name: "Play versus the isle" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    for (const v of st.vertices) v.building = null;
    st.phase = "roll";
    st.current = "p0";
    st.playedCard = false;
    st.dice = null;
    for (const p of st.players) {
      p.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      p.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    }
    st.players[0].hidden.knight = 1;
    st.players[0].knightsPlayed = 0;
    g.setState({ state: st, localId: "p0", mode: "practice", buildMode: "none", pendingSteal: null, error: null });
  });
  await page.getByTestId("knight-button").click({ timeout: 5000 });
  const knight = await page.evaluate(() => {
    const g = window.__emberisle;
    const armed = g.getState().buildMode;
    const hex = g.getState().highlights().hexes[0];
    g.getState().pickHex(hex);
    const st = g.getState().state;
    const after = { phase: st.phase, played: st.players[0].knightsPlayed, error: g.getState().error };
    const r = g.getState().dispatch({ type: "roll" });
    return { armed, ...after, roll: r.ok, rollError: r.error };
  });
  console.log("knight before roll:", JSON.stringify(knight));

  // #219: your own rail card shows your hidden points; nobody else's does.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.players[0].hidden.vp = 2;
    for (const p of st.players.slice(1)) p.hidden.vp = 0;
    g.setState({ state: st });
  });
  await page.waitForTimeout(200);
  const rail = await page.evaluate(() => {
    const ids = window.__emberisle.getState().state.players.map((p) => p.id);
    return ids.map((id) => document.querySelector(`[data-testid="rail-${id}"]`)?.textContent ?? null);
  });
  console.log("rail cards:", JSON.stringify(rail));

  // #177: the whose-turn banner is on desktop too, and the phone strip is not.
  // The app runs a bot 700 ms after each seq change. Let any timer left from the last move fire first,
  // so it can't roll for the bot before the banner is read; the flip below keeps seq, so none is set again.
  await page.waitForTimeout(1000);
  const turn = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const bot = st.players.find((p) => p.id !== g.getState().localId);
    const mineText = document.querySelector('[data-testid="turn-banner"]')?.textContent ?? null;
    st.current = bot.id;
    st.phase = "roll";
    g.setState({ state: st });
    return { mineText, bot: bot.name };
  });
  await page
    .waitForFunction((name) => document.querySelector('[data-testid="turn-banner"]')?.textContent?.startsWith(`${name}'s turn`), turn.bot, { timeout: 5000 })
    .catch(() => {});
  turn.theirs = await page.getByTestId("turn-banner").textContent();
  turn.strip = await page.getByTestId("seat-strip").count();
  console.log("turn banner:", JSON.stringify(turn));

  if (turn.theirs !== `${turn.bot}'s turn — Roll the dice to gather from the land.` || !/^Your turn — (Roll the dice|Build, trade|move the wayfarer|discard \d+)/.test(turn.mineText ?? "") || turn.strip) {
    throw new Error(`turn banner: ${JSON.stringify(turn)}`);
  }
  if (phase !== "roll" && phase !== "main" && phase !== "robber" && phase !== "discard") throw new Error(`setup: ${phase}`);
  if (!Array.isArray(rolled)) throw new Error(`roll: ${rolled}`);
  if (!bannerText || !bannerText.includes(`rolls ${rolled[0]}+${rolled[1]} = ${rolled[0] + rolled[1]}`)) throw new Error(`roll banner: ${bannerText}`);
  if (steal.targets !== 2 || !steal.asked || steal.got !== 1 || steal.left !== 1 || steal.phase !== "main" || !steal.cleared) {
    throw new Error(`offline steal picker: ${JSON.stringify(steal)}`);
  }
  if (road.first < 1 || road.picked !== 1 || road.second < 1 || road.laid !== 2 || road.cardLeft !== 0 || !road.played || road.mode !== "none" || road.error) {
    throw new Error(`path fortune: ${JSON.stringify(road)}`);
  }
  if (plenty.ore !== 1 || plenty.wool !== 1 || plenty.cardLeft !== 0 || plenty.error) throw new Error(`plenty fortune: ${JSON.stringify(plenty)}`);
  if (monopoly.gained !== 6 || monopoly.othersLeft !== 0 || monopoly.cardLeft !== 0 || monopoly.error) throw new Error(`monopoly fortune: ${JSON.stringify(monopoly)}`);
  if (bankTrade.ore !== Number(rateLabel.match(/\d/)[0]) || bankTrade.wool !== 1 || bankTrade.open || bankTrade.error || askOffline !== 0) {
    throw new Error(`bank trade through the panel: ${rateLabel} ${JSON.stringify(bankTrade)} ask buttons ${askOffline}`);
  }
  if (online.botActs !== 0) throw new Error(`client ran a bot online: ${JSON.stringify(online)}`);
  if (online.log !== "" || online.place !== null || online.seat !== "" || online.host || online.picks || online.toast !== null || online.screen !== "title") {
    throw new Error(`stale state after leaving: ${JSON.stringify(online)}`);
  }
  if (knight.armed !== "knight" || knight.phase !== "roll" || knight.played !== 1 || knight.error || !knight.roll) {
    throw new Error(`knight before roll: ${JSON.stringify(knight)}`);
  }
  if (!rail[0]?.includes("+2 hidden") || !rail[0].includes("points ×2") || rail.slice(1).some((t) => t === null || t.includes("hidden"))) {
    throw new Error(`rail cards: ${JSON.stringify(rail)}`);
  }
  // The knight and hidden-points steps above left a live game, so return to the title for the next one.
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  // #220: the win screen lists every player with totals that match totalVP, and Look around / Back to menu work.
  // The online step above left the table, so start a fresh practice game for this one.
  await page.getByRole("button", { name: "Play versus the isle" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const ids = st.players.map((p) => p.id);
    for (const v of st.vertices) v.building = null;
    st.vertices.slice(0, 6).forEach((v, i) => (v.building = { playerId: ids[i % 2 === 0 ? 0 : 1], kind: i < 2 ? "stronghold" : "outpost" }));
    st.vertices.slice(6, 8).forEach((v, i) => (v.building = { playerId: ids[2 + i], kind: "outpost" }));
    st.players[1].hidden.vp = 3;
    st.players[2].hidden.vp = 1;
    st.longestRoad = ids[0];
    st.largestArmy = ids[1];
    st.phase = "over";
    st.winner = ids[1];
    g.setState({ state: st, pendingSteal: null, error: null });
  });
  await page.getByTestId("win-screen").waitFor({ timeout: 5000 }).catch(() => {});
  const winRows = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = g.getState().state;
    const rows = [...document.querySelectorAll('[data-testid="win-row"]')].map((r) => ({
      id: r.getAttribute("data-player"),
      total: Number(r.querySelector('[data-testid="win-total"]').textContent),
    }));
    return { rows, state: st, winner: st.winner, headline: document.querySelector('[data-testid="win-headline"]')?.textContent };
  });
  const { totalVP } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  winRows.want = Object.fromEntries(winRows.state.players.map((p) => [p.id, totalVP(winRows.state, p.id)]));
  delete winRows.state;
  console.log("win screen:", JSON.stringify(winRows));
  if (winRows.rows.length !== 4) throw new Error(`win screen rows: ${JSON.stringify(winRows)}`);
  if (winRows.rows[0].id !== winRows.winner) throw new Error(`win screen: winner not first: ${JSON.stringify(winRows)}`);
  for (const r of winRows.rows) if (r.total !== winRows.want[r.id]) throw new Error(`win screen total: ${JSON.stringify(winRows)}`);
  if (new Set(winRows.rows.map((r) => r.total)).size < 3) throw new Error("win screen: totals should differ");
  if (!winRows.headline?.endsWith(" wins")) throw new Error(`win headline: ${winRows.headline}`);
  await page.getByTestId("win-look").click();
  await page.getByTestId("win-chip").waitFor({ timeout: 2000 });
  if (await page.getByTestId("win-screen").count()) throw new Error("win screen still shown after Look around");
  await page.getByTestId("win-show").click();
  await page.getByTestId("win-screen").waitFor({ timeout: 2000 });
  await page.getByTestId("win-menu").click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "title", null, { timeout: 5000 });
  console.log("win screen ok");
  // #259: a saved seat whose table is gone fails quietly on page load: title card, no error, key cleared.
  const { spawn } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const roomsDir = mkdtempSync(`${tmpdir()}/emberisle-rooms-`);
  const rejoinHost = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: roomsDir },
  });
  process.on("exit", () => rejoinHost.kill());
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
  try {
    const hostPort = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("rejoin host never listened")), 10000);
      rejoinHost.on("exit", (c) => reject(new Error(`rejoin host exited early (${c})`)));
      rejoinHost.stdout.on("data", (d) => {
        const m = String(d).match(/listening (\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
    });
    await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
    await page.evaluate(() => localStorage.setItem("emberisle-seat", JSON.stringify({ code: "ZZZZ", secret: "x" })));
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem("emberisle-seat") === null, null, { timeout: 5000 });
    const stale = await page.evaluate(() => {
      const t = window.__emberisle.getState();
      return { screen: t.screen, error: t.error, toast: t.toast, net: t.net === null };
    });
    console.log("stale rejoin on load:", JSON.stringify(stale));
    if (stale.screen !== "title" || stale.error !== null || stale.toast !== null || !stale.net) throw new Error(`stale rejoin not quiet: ${JSON.stringify(stale)}`);
  } finally {
    rejoinHost.kill();
    rmSync(roomsDir, { recursive: true, force: true });
  }

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("client prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
