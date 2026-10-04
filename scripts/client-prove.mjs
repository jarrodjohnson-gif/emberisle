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
  // #303: record which /audio/<file> each play() came from instead of playing it; headless has no speaker to hear.
  await page.addInitScript(() => {
    window.__plays = [];
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push(new URL(this.src).pathname);
      return Promise.resolve();
    };
  });
  const plays = () => page.evaluate(() => window.__plays.map((p) => p.replace("/audio/", "")));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  // #303: nothing plays before the first gesture. A game started from the console places pieces without one.
  await page.evaluate(async () => {
    const g = window.__emberisle;
    g.getState().startAi();
    // #232: roll off first, so the outpost below is a real placement.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 200 && g.getState().state.phase === "rollOff"; i++) {
      const s = g.getState();
      if (s.state.current === s.localId) s.dispatch({ type: "roll" });
      await sleep(100);
    }
    for (let i = 0; i < 200 && g.getState().state.current !== g.getState().localId; i++) await sleep(100);
    const s = g.getState();
    s.pickVertex(s.highlights().vertices[0]);
    await new Promise((r) => setTimeout(r, 1500));
    g.getState().goTitle();
  });
  const silent = await plays();
  console.log("plays before the first gesture:", JSON.stringify(silent));
  if (silent.length) throw new Error(`sound played before a gesture: ${JSON.stringify(silent)}`);
  // #380: every new text of the polite turn region, recorded as it changes, from before the Hud mounts.
  await page.evaluate(() => {
    window.__turns = [];
    new MutationObserver(() => {
      const t = document.querySelector('[aria-live="polite"][data-testid="announce-turn"]')?.textContent ?? "";
      if (t && t !== window.__turns.at(-1)) window.__turns.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();

  // #232: roll off for first place. The human rolls on its turn; the bots roll on the app's timer.
  await page.evaluate(() => {
    window.__banners = [];
    window.__emberisle.subscribe((s) => s.banner && window.__banners.push(s.banner));
  });
  const rollOff = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      const s = g.getState();
      if (s.state.phase !== "rollOff") return { phase: s.state.phase, order: s.state.players.map((p) => p.id), rolls: s.state.rollOff.rolls };
      if (s.state.current === s.localId) s.dispatch({ type: "roll" });
      await sleep(100);
    }
    return { phase: "stuck in rollOff" };
  });
  const tiles = page.locator('[data-testid="rolloff-die"]:visible');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="rolloff-die"]')].filter((e) => e.checkVisibility()).length === 4);
  const faces = await tiles.allTextContents();
  const placesFirst = await page.evaluate(() => window.__banners.find((b) => b.includes("places first, then")) ?? null);
  console.log(`roll-off: ${rollOff.phase}, order ${rollOff.order?.join(" ")}, ${faces.length} die tiles [${faces.join(" ")}], banner ${JSON.stringify(placesFirst)}`);
  if (rollOff.phase !== "setupSettle" || faces.length !== 4 || faces.some((f) => !/^[1-6]$/.test(f)) || !placesFirst) {
    throw new Error(`roll-off: ${JSON.stringify({ rollOff, faces, placesFirst })}`);
  }

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
  // #380: the human's own turn (it waits on a placement in setup) is read as "Your turn.", a bot's by name.
  const turns = await page.evaluate(() => window.__turns);
  console.log(`turn announcements: ${JSON.stringify(turns)}`);
  if (!turns.includes("Your turn.") || !turns.some((t) => /^.+'s turn\.$/.test(t))) throw new Error(`turn announcements: ${JSON.stringify(turns)}`);

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
  // #303: setup and the first roll made the table sounds (server/cue.mjs names).
  const SOUND = { dice_land: "drop_001.wav", path_place: "drop_002.wav", outpost_place: "drop_003.wav" };
  const heardFiles = await plays();
  const heard = Object.keys(SOUND).filter((n) => heardFiles.includes(SOUND[n]));
  console.log("sounds heard in setup and the first roll:", JSON.stringify(heardFiles));
  if (heard.length !== 3) throw new Error(`sounds: heard only ${heard.join(" ")} in ${JSON.stringify(heardFiles)}`);
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
  // #363: practice asks its bots, so the panel has Ask the table here too.
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
  const askPractice = await page.getByRole("button", { name: "Ask the table" }).count();
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
  console.log("bank trade through the panel:", rateLabel, JSON.stringify(bankTrade), `ask-the-table buttons in practice: ${askPractice}`);
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
  await page.getByRole("button", { name: "Play", exact: true }).click();
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
  // The app runs a bot 700 ms after each seq change, and under software GL that timer can fire seconds late.
  // So the flipped state marks the bot's seat human for the check: runBots skips it, and the banner reads only name and phase.
  const turn = await page.evaluate(() => {
    const g = window.__emberisle;
    window.__beforeBanner = g.getState().state;
    const st = structuredClone(g.getState().state);
    const bot = st.players.find((p) => p.id !== g.getState().localId);
    const mineText = document.querySelector('[data-testid="turn-banner"]')?.textContent ?? null;
    bot.kind = "human";
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
  await page.evaluate(() => window.__emberisle.setState({ state: window.__beforeBanner }));
  console.log("turn banner:", JSON.stringify(turn));

  if (turn.theirs !== `${turn.bot}'s turn — Roll the dice to gather from the land.` || !/^Your turn — (Roll the dice|Build, trade|move the wayfarer|discard \d+)/.test(turn.mineText ?? "") || turn.strip) {
    throw new Error(`turn banner: ${JSON.stringify(turn)}`);
  }
  if (phase !== "roll" && phase !== "main" && phase !== "robber" && phase !== "discard") throw new Error(`setup: ${phase}`);
  if (!Array.isArray(rolled)) throw new Error(`roll: ${rolled}`);
  // #440: the banner says whose roll and who gathered; the numbers are the roll moment's and the dice row's alone.
  if (!bannerText || !/^.+'s roll · /.test(bannerText) || bannerText.includes(`${rolled[0]}+${rolled[1]}`)) throw new Error(`roll banner: ${bannerText}`);
  if (steal.targets !== 2 || !steal.asked || steal.got !== 1 || steal.left !== 1 || steal.phase !== "main" || !steal.cleared) {
    throw new Error(`offline steal picker: ${JSON.stringify(steal)}`);
  }
  if (road.first < 1 || road.picked !== 1 || road.second < 1 || road.laid !== 2 || road.cardLeft !== 0 || !road.played || road.mode !== "none" || road.error) {
    throw new Error(`path fortune: ${JSON.stringify(road)}`);
  }
  if (plenty.ore !== 1 || plenty.wool !== 1 || plenty.cardLeft !== 0 || plenty.error) throw new Error(`plenty fortune: ${JSON.stringify(plenty)}`);
  if (monopoly.gained !== 6 || monopoly.othersLeft !== 0 || monopoly.cardLeft !== 0 || monopoly.error) throw new Error(`monopoly fortune: ${JSON.stringify(monopoly)}`);
  if (bankTrade.ore !== Number(rateLabel.match(/\d/)[0]) || bankTrade.wool !== 1 || bankTrade.open || bankTrade.error || askPractice !== 1) {
    throw new Error(`bank trade through the panel: ${rateLabel} ${JSON.stringify(bankTrade)} ask buttons ${askPractice}`);
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
  await page.getByRole("button", { name: "Play", exact: true }).click();
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
  // #266: practice has no table to keep, so no Play again.
  if (await page.getByTestId("win-again").count()) throw new Error("win screen: practice shows Play again");
  // #379: aria-modal is a promise to the keyboard too. Tab cycles among the dialog's buttons and never reaches the HUD behind it.
  const winFocus = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return { id: el?.getAttribute("data-testid") ?? el?.tagName.toLowerCase(), inDialog: !!el?.closest('[data-testid="win-screen"]') };
    });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "win-menu", null, { timeout: 2000 });
  const tabs = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    tabs.push(await winFocus());
  }
  await page.getByTestId("win-look").focus();
  await page.keyboard.press("Shift+Tab");
  const back = await winFocus();
  console.log("win tab order:", JSON.stringify({ tabs, back }));
  if (tabs.some((t) => !t.inDialog)) throw new Error(`win screen: Tab left the dialog: ${JSON.stringify(tabs)}`);
  if (back.id !== "win-menu") throw new Error(`win screen: Shift+Tab from Look around went to ${back.id}`);
  await page.getByTestId("win-look").click();
  await page.getByTestId("win-chip").waitFor({ timeout: 2000 });
  if (await page.getByTestId("win-screen").count()) throw new Error("win screen still shown after Look around");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "win-show", null, { timeout: 2000 });
  await page.getByTestId("win-show").click();
  await page.getByTestId("win-screen").waitFor({ timeout: 2000 });
  await page.getByTestId("win-menu").click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "title", null, { timeout: 5000 });
  console.log("win screen ok");

  // #266: Play again. Hotseat deals the rematch here, the last winner first; online the host's button sends `again`
  // (a fake net records it) and a guest waits for the host.
  {
    const toOver = (extra) =>
      page.evaluate((extra) => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.phase = "over";
        st.winner = "p2";
        g.setState({ state: st, ...extra });
      }, extra);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state?.phase === "rollOff");
    const names = await page.evaluate(() => window.__emberisle.getState().state.players.map((p) => p.name));
    await toOver({ buildMode: "outpost" });
    await page.getByTestId("win-again").click();
    await page.getByTestId("win-screen").waitFor({ state: "detached", timeout: 2000 });
    const hot = await page.evaluate(() => {
      const t = window.__emberisle.getState();
      return { phase: t.state.phase, winner: t.state.winner, names: t.state.players.map((p) => p.name), first: t.state.rollOff.first, current: t.state.current, localId: t.localId, buildMode: t.buildMode };
    });
    console.log("hotseat rematch:", JSON.stringify(hot));
    const restOk = JSON.stringify(hot.names.slice(1)) === JSON.stringify(names.filter((n) => n !== names[2]));
    if (hot.phase !== "rollOff" || hot.winner !== null || hot.names[0] !== names[2] || !restOk || hot.first !== "p0" || hot.current !== "p1" || hot.localId !== "p0" || hot.buildMode !== "none") {
      throw new Error(`hotseat rematch: ${JSON.stringify({ hot, names })}`);
    }

    const seat = (id, name, host) => ({ id, name, color: "#c45c3e", avatarId: null, ready: true, host, away: false, url: null });
    const online = (seatId) => ({
      mode: "online",
      code: "ABCD",
      seatId,
      isHost: seatId === "s0",
      seats: [seat("s0", "Ember", true), seat("s1", "Tide", false), seat("s2", "Pine", false)],
    });
    await page.evaluate(() => {
      window.__again = 0;
      window.__emberisle.setState({ net: { again: () => window.__again++, close: () => {} } });
    });
    await toOver(online("s0"));
    await page.getByTestId("win-again").click();
    await page.waitForFunction(() => window.__again === 1, null, { timeout: 2000 });
    if (await page.getByTestId("win-waiting").count()) throw new Error("online host sees the waiting line");
    await page.getByTestId("win-look").click();
    await page.getByTestId("win-again-chip").click();
    await page.waitForFunction(() => window.__again === 2, null, { timeout: 2000 });
    await page.getByTestId("win-show").click();
    await page.evaluate(() => window.__emberisle.setState({ seatId: "s1", isHost: false }));
    await page.getByTestId("win-waiting").waitFor({ timeout: 2000 });
    const guest = { again: await page.getByTestId("win-again").count(), waiting: await page.getByTestId("win-waiting").textContent() };
    await page.getByTestId("win-look").click();
    guest.chip = await page.getByTestId("win-again-chip").count();
    console.log("online play again:", JSON.stringify({ hostSent: await page.evaluate(() => window.__again), guest }));
    if (guest.again || guest.chip || guest.waiting !== "Waiting for Ember to start another.") throw new Error(`online guest: ${JSON.stringify(guest)}`);
    await page.evaluate(() => window.__emberisle.getState().goTitle());
    console.log("play again ok");
  }

  // Each step below starts from the title screen and builds its own state, so none depends on the one before.
  const toTitle = () => page.evaluate(() => window.__emberisle.getState().goTitle());
  const freshPractice = async () => {
    await toTitle();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().state);
  };

  // #303: the speaker toggle is remembered across a reload, and a muted table makes no sound.
  await toTitle();
  const speaker = page.getByTestId("sound-toggle");
  const wasOn = await speaker.getAttribute("aria-pressed");
  await speaker.click();
  const stored = await page.evaluate(() => localStorage.getItem("emberisle-muted"));
  await page.reload();
  await page.waitForFunction(() => window.__emberisle);
  const stillOff = await speaker.getAttribute("aria-pressed");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const s = window.__emberisle.getState();
    s.pickVertex(s.highlights().vertices[0]);
    await new Promise((r) => setTimeout(r, 1500));
  });
  const mutedPlays = await plays();
  // Back on, through the own-seat menu this time, so both toggles are exercised.
  await page.locator('[data-menu-trigger="p0"]').first().click();
  await page.getByTestId("player-menu").getByTestId("sound-toggle").click();
  const menuSays = await page.getByTestId("player-menu").getByTestId("sound-toggle").textContent();
  const cleared = await page.evaluate(() => localStorage.getItem("emberisle-muted"));
  const mute = { wasOn, stored, stillOff, mutedPlays, menuSays: menuSays?.trim(), cleared };
  console.log("mute:", JSON.stringify(mute));
  if (wasOn !== "true" || stored !== "1" || stillOff !== "false" || mutedPlays.length || menuSays?.trim() !== "Table sounds on" || cleared !== null) {
    throw new Error(`mute: ${JSON.stringify(mute)}`);
  }
  console.log(`sounds: ${heard.join(" ")} played; mute remembered`);

  // #249: the lobby reads host from the live seat list, not the welcome flag.
  const lobbyStart = async (host, isHost) => {
    await toTitle();
    await page.evaluate(
      ({ host, isHost }) => {
        const seats = ["s0", "s1", "s2"].map((id, i) => ({ id, name: `P${i}`, color: "#c45c3e", avatarId: null, ready: true, host: id === "s0" ? !host : id === "s1" && host, away: false, url: null }));
        window.__emberisle.setState({ screen: "lobby", mode: "online", code: "ABCD", seatId: "s1", seats, isHost });
      },
      { host, isHost },
    );
    await page.getByTestId("lobby-card").waitFor({ timeout: 3000 });
    await page.waitForTimeout(100);
    return page.getByRole("button", { name: "Start", exact: true }).count();
  };
  const handedOver = await lobbyStart(true, false);
  const notHost = await lobbyStart(false, true);
  console.log("lobby host from seats:", JSON.stringify({ handedOver, notHost }));
  if (handedOver !== 1 || notHost !== 0) throw new Error(`lobby host from seats: ${JSON.stringify({ handedOver, notHost })}`);

  // #343: with no clipboard (a LAN address over plain http) Copy link shows the link in a read-only field, focused with its
  // text selected, and the polite live region says so. When the copy works the region says "Copied" and no field shows.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Copy link" }).click();
  const noClip = await (
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="copy-fallback"]');
        const live = document.querySelector('[data-testid="copy-status"]');
        if (!el || document.activeElement !== el) return null;
        return { value: el.value, readOnly: el.readOnly, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length, live: live?.textContent, polite: live?.getAttribute("aria-live") };
      },
      null,
      { timeout: 3000 },
    )
  ).jsonValue();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true }));
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Copied" }).waitFor({ timeout: 3000 });
  const clip = { live: await page.getByTestId("copy-status").textContent(), field: await page.getByTestId("copy-fallback").count() };
  console.log("copy fallback:", JSON.stringify({ noClip, clip }));
  if (!noClip.value.includes("?code=ABCD") || !noClip.readOnly || !noClip.selected || noClip.live !== "Select and copy" || noClip.polite !== "polite") {
    throw new Error(`copy fallback: ${JSON.stringify(noClip)}`);
  }
  if (clip.live !== "Copied" || clip.field !== 0) throw new Error(`copy ok: ${JSON.stringify(clip)}`);

  // #252: the tab title says when it is your move.
  await toTitle();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state);
  const titles = {};
  titles.start = await page.title();
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = st.players.find((p) => p.id !== g.getState().localId).id;
    st.phase = "roll";
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForFunction(() => document.title === "Emberisle", null, { timeout: 2000 }).catch(() => {});
  titles.bot = await page.title();
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = g.getState().localId;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForFunction(() => document.title.startsWith("● Your turn"), null, { timeout: 2000 }).catch(() => {});
  titles.back = await page.title();
  await toTitle();
  await page.waitForFunction(() => document.title === "Emberisle", null, { timeout: 2000 }).catch(() => {});
  titles.title = await page.title();
  console.log("tab titles:", JSON.stringify(titles));
  if (!titles.start.startsWith("● Your turn") || titles.bot !== "Emberisle" || !titles.back.startsWith("● Your turn") || titles.title !== "Emberisle") {
    throw new Error(`tab titles: ${JSON.stringify(titles)}`);
  }

  // #253: the join form submits on Enter and its error is announced.
  await toTitle();
  await page.getByRole("textbox", { name: "Join code" }).fill("zzzz");
  await page.getByRole("textbox", { name: "Join code" }).press("Enter");
  await page.locator("[role=alert]").waitFor({ timeout: 5000 });
  // No host is running here, so the join attempt's refused socket is the expected console error; drop only that one.
  // The typed code also fires a peek 300 ms later (#271) that is refused the same way; let it land, then drop both.
  const refusedNow = () => errors.filter((e) => e.includes("ws://127.0.0.1:8787"));
  for (let i = 0; i < 100 && refusedNow().length < 2; i++) await page.waitForTimeout(50);
  const refused = refusedNow();
  if (refused.length < 2) throw new Error(`join form: expected the join and the peek to be refused, saw ${refused.length}`);
  for (const e of refused) errors.splice(errors.indexOf(e), 1);
  const joinForm = await page.evaluate(() => {
    const input = document.querySelector("form[aria-label='Join code'] input");
    return { alert: document.querySelector("[role=alert]")?.textContent, value: input?.value, caps: input?.getAttribute("autocapitalize"), auto: input?.getAttribute("autocomplete") };
  });
  console.log("join form:", JSON.stringify(joinForm));
  if (!joinForm.alert || joinForm.value !== "ZZZZ" || joinForm.caps !== "characters" || joinForm.auto !== "off") throw new Error(`join form: ${JSON.stringify(joinForm)}`);

  // #253: the win screen is a dialog, focus lands on Back to menu, and Escape is Look around.
  await freshPractice();
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "over";
    st.winner = st.players[1].id;
    g.setState({ state: st, pendingSteal: null, error: null });
  });
  await page.getByRole("dialog", { name: /wins/ }).waitFor({ timeout: 5000 });
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  const modal = await page.getByRole("dialog", { name: /wins/ }).getAttribute("aria-modal");
  await page.keyboard.press("Escape");
  await page.getByTestId("win-chip").waitFor({ timeout: 2000 });
  console.log("win dialog:", JSON.stringify({ focused, modal }));
  if (focused?.trim() !== "Back to menu" || modal !== "true") throw new Error(`win dialog: ${JSON.stringify({ focused, modal })}`);

  // #253: with reduced motion a resource flash is gone almost at once, and the banner fade is cut short.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshPractice();
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.players.find((p) => p.id === g.getState().localId).resources.ore += 1;
    g.setState({ state: st });
  });
  // Read the flash in the same poll that finds it: it unmounts on a timer, so a separate read can miss it on a slow runner.
  const motion = await (
    await page.waitForFunction(
      () => {
        const flash = document.querySelector('[data-testid="resource-flash"]');
        const banner = document.querySelector('[data-testid="turn-banner"]');
        return flash ? { flash: getComputedStyle(flash).animationDuration, fade: banner ? getComputedStyle(banner).animationDuration : null } : null;
      },
      null,
      { timeout: 10000, polling: "raf" },
    )
  ).jsonValue();
  await page.emulateMedia({ reducedMotion: null });
  console.log("reduced motion:", JSON.stringify(motion));
  if (motion.flash !== "0.001s" || motion.fade !== "0.001s") throw new Error(`reduced motion: ${JSON.stringify(motion)}`);
  await toTitle();
  // #254: online, Leave asks first (Stay and Escape cancel); a second Leave goes to the title and clears the saved seat.
  // Practice keeps the one-click Leave.
  await freshPractice();
  const leaveState = () => page.evaluate(() => ({ screen: window.__emberisle.getState().screen, seat: localStorage.getItem("emberisle-seat") }));
  await page.evaluate(() => {
    localStorage.setItem("emberisle-seat", JSON.stringify({ code: "ABCD", secret: "x" }));
    window.__emberisle.setState({ mode: "online", net: { act: () => true, close: () => {} } });
  });
  const confirmBox = page.getByTestId("leave-confirm");
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await confirmBox.waitFor({ timeout: 2000 });
  const asked = { text: await confirmBox.textContent(), ...(await leaveState()) };
  console.log("leave asks:", JSON.stringify(asked));
  if (asked.screen !== "play" || !asked.text.includes("Leave the table? Your seat goes to the bot.") || !asked.seat) throw new Error(`leave confirm: ${JSON.stringify(asked)}`);
  await confirmBox.getByRole("button", { name: "Stay" }).click();
  await confirmBox.waitFor({ state: "detached", timeout: 2000 });
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await confirmBox.waitFor({ timeout: 2000 });
  await page.keyboard.press("Escape");
  await confirmBox.waitFor({ state: "detached", timeout: 2000 });
  if ((await leaveState()).screen !== "play") throw new Error("Stay/Escape left the table");
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await confirmBox.getByRole("button", { name: "Leave" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "title", null, { timeout: 5000 });
  const left = await leaveState();
  console.log("leave then leave:", JSON.stringify(left));
  if (left.seat !== null) throw new Error(`saved seat not cleared: ${JSON.stringify(left)}`);
  // Phone portrait: the seat strip sits under the header and must not paint over the question.
  await freshPractice();
  await page.evaluate(() => window.__emberisle.setState({ mode: "online", net: { act: () => true, close: () => {} } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("seat-strip").waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await confirmBox.waitFor({ timeout: 2000 });
  const topmost = await page.evaluate(() => {
    const q = document.querySelector("#leave-confirm-msg").getBoundingClientRect();
    const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
    return { ok: hit?.id === "leave-confirm-msg", hit: hit ? `${hit.tagName}.${hit.className}`.slice(0, 80) : null };
  });
  console.log("phone leave question topmost:", JSON.stringify(topmost));
  if (!topmost.ok) throw new Error(`phone: strip covers the leave question: ${JSON.stringify(topmost)}`);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 800, height: 500 });
  await freshPractice();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "title", null, { timeout: 5000 });
  if (await confirmBox.count()) throw new Error("practice Leave asked for confirmation");
  console.log("practice leave: one click");

  // #285: build buttons carry their price and are disabled when you cannot pay; arming is announced; Escape disarms.
  await freshPractice();
  const setHand = (res) =>
    page.evaluate((res) => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.phase = "main";
      st.current = g.getState().localId;
      st.playedCard = false;
      st.seq += 1;
      const me = st.players.find((p) => p.id === g.getState().localId);
      me.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...res };
      // A fresh practice board is empty; one outpost gives the path somewhere to glow from.
      for (const v of st.vertices) v.building = null;
      st.vertices[0].building = { playerId: me.id, kind: "outpost" };
      g.setState({ state: st, mode: "practice", buildMode: "none", roadPicks: [], tradeOpen: false, menuFor: null, error: null });
    }, res);
  const buildRow = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ["Path", "Outpost", "Stronghold", "Fortune"].map((n) => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === n);
          return [n, { disabled: b?.getAttribute("aria-disabled") === "true", native: b?.disabled, cursor: b && getComputedStyle(b).cursor, title: b?.title, desc: b?.getAttribute("aria-description"), pressed: b?.getAttribute("aria-pressed") }];
        }),
      ),
    );
  const price = { Path: "Path · 1 timber, 1 clay", Outpost: "Outpost · 1 timber, 1 clay, 1 wool, 1 grain", Stronghold: "Stronghold · 3 grain, 2 ore", Fortune: "Fortune · 1 wool, 1 grain, 1 ore" };
  const storeNow = () => page.evaluate(() => ({ buildMode: window.__emberisle.getState().buildMode, tradeOpen: window.__emberisle.getState().tradeOpen, howTo: window.__emberisle.getState().howTo }));
  await setHand({});
  await page.getByRole("button", { name: "Path", exact: true }).waitFor({ timeout: 5000 });
  const empty = await buildRow();
  console.log("build row, empty hand:", JSON.stringify(empty));
  for (const [n, p] of Object.entries(price)) if (!empty[n].disabled || empty[n].native || empty[n].cursor !== "not-allowed" || empty[n].title !== p || empty[n].desc !== p) throw new Error(`empty hand ${n}: ${JSON.stringify(empty[n])}`);
  // #302: an unaffordable button is still in the Tab order, reports aria-disabled and its price, and a click neither arms nor buys.
  await page.evaluate(() => document.activeElement?.blur());
  let tabbedTo = null;
  for (let i = 0; i < 40 && tabbedTo !== "Path"; i++) {
    await page.keyboard.press("Tab");
    tabbedTo = await page.evaluate(() => document.activeElement?.textContent?.trim());
  }
  const tabFocus = await page.evaluate(() => ({ aria: document.activeElement?.getAttribute("aria-disabled"), desc: document.activeElement?.getAttribute("aria-description") }));
  console.log("Tab to unaffordable Path:", JSON.stringify({ tabbedTo, ...tabFocus }));
  if (tabbedTo !== "Path" || tabFocus.aria !== "true" || tabFocus.desc !== price.Path) throw new Error(`Tab/aria-disabled: ${JSON.stringify({ tabbedTo, ...tabFocus })}`);
  const cardsBefore = await page.evaluate(() => JSON.stringify([window.__emberisle.getState().state.deck.length, window.__emberisle.getState().error]));
  for (const n of ["Path", "Outpost", "Stronghold", "Fortune"]) await page.getByRole("button", { name: n, exact: true }).click({ force: true });
  await page.keyboard.press("Enter");
  const clickRes = await page.evaluate(() => ({ buildMode: window.__emberisle.getState().buildMode, cards: JSON.stringify([window.__emberisle.getState().state.deck.length, window.__emberisle.getState().error]) }));
  console.log("click unaffordable:", JSON.stringify({ ...clickRes, cardsBefore }));
  if (clickRes.buildMode !== "none" || clickRes.cards !== cardsBefore) throw new Error(`unaffordable click acted: ${JSON.stringify(clickRes)}`);
  await setHand({ timber: 1, clay: 1 });
  const some = await buildRow();
  console.log("build row, 1 timber 1 clay:", JSON.stringify(some));
  if (some.Path.disabled || some.Path.title !== price.Path || ["Outpost", "Stronghold", "Fortune"].some((n) => !some[n].disabled || some[n].title !== price[n])) throw new Error(`timber+clay: ${JSON.stringify(some)}`);
  const pathBtn = page.getByRole("button", { name: "Path", exact: true });
  await pathBtn.click();
  const armed = await page.evaluate(() => ({ ...window.__emberisle.getState(), edges: window.__emberisle.getState().highlights().edges.length }));
  const pressed = await pathBtn.getAttribute("aria-pressed");
  if (armed.buildMode !== "path" || pressed !== "true" || !armed.edges) throw new Error(`armed: ${JSON.stringify({ mode: armed.buildMode, pressed, edges: armed.edges })}`);
  await page.keyboard.press("Escape");
  const disarmed = { ...(await storeNow()), pressed: await pathBtn.getAttribute("aria-pressed") };
  console.log("arm then Escape:", JSON.stringify({ armed: armed.buildMode, pressed, edges: armed.edges, disarmed }));
  if (disarmed.buildMode !== "none" || disarmed.pressed !== "false") throw new Error(`Escape did not disarm: ${JSON.stringify(disarmed)}`);
  // One Escape closes only the topmost thing: the trade panel first, then the arm.
  await pathBtn.click();
  await page.evaluate(() => window.__emberisle.getState().setTradeOpen(true));
  await page.keyboard.press("Escape");
  const layer1 = await storeNow();
  await page.keyboard.press("Escape");
  const layer2 = await storeNow();
  console.log("escape order, trade over arm:", JSON.stringify({ layer1, layer2 }));
  if (layer1.tradeOpen || layer1.buildMode !== "path" || layer2.buildMode !== "none") throw new Error(`trade/arm order: ${JSON.stringify({ layer1, layer2 })}`);
  // The How-to dialog is above an armed build: its Escape leaves the arm alone.
  await pathBtn.click();
  await page.getByRole("button", { name: "How to play" }).click();
  await page.keyboard.press("Escape");
  const layer3 = await storeNow();
  await page.keyboard.press("Escape");
  const layer4 = await storeNow();
  console.log("escape order, how-to over arm:", JSON.stringify({ layer3, layer4 }));
  if (layer3.howTo || layer3.buildMode !== "path" || layer4.buildMode !== "none") throw new Error(`how-to/arm order: ${JSON.stringify({ layer3, layer4 })}`);
  // Phone: the four build buttons keep a 44 px target.
  await setHand({});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Path", exact: true }).waitFor({ timeout: 5000 });
  await page.waitForFunction(() => document.querySelector("[data-testid='seat-strip']"), null, { timeout: 5000 });
  const heights = await page.evaluate(() => ["Path", "Outpost", "Stronghold", "Fortune"].map((n) => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === n).getBoundingClientRect().height));
  console.log("phone build button heights:", JSON.stringify(heights));
  if (heights.some((h) => h < 44)) throw new Error(`phone build buttons under 44 px: ${JSON.stringify(heights)}`);
  await page.setViewportSize({ width: 800, height: 500 });

  // #286: How to play is a dialog: focus goes to Close, Escape closes it, and focus returns to the opener (title and in-game).
  const howToRound = async (opener, label) => {
    // Safari does not focus a button on click: stop the mousedown focus and blur, so activeElement is <body> when the dialog opens.
    await opener.evaluate((el) => {
      el.addEventListener("mousedown", (e) => e.preventDefault(), { once: true });
      el.blur();
    });
    await opener.click();
    const dlg = page.getByRole("dialog", { name: "How to play" });
    await dlg.waitFor({ timeout: 3000 });
    const at = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    await page.keyboard.press("Tab");
    const afterTab = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (afterTab !== "Close") throw new Error(`how to play ${label}: Tab left the dialog: ${afterTab}`);
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached", timeout: 3000 });
    const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim());
    console.log(`how to play (${label}):`, JSON.stringify({ focusedOnOpen: at, focusedAfter: back }));
    if (at !== "Close" || back !== "How to play") throw new Error(`how to play ${label}: ${JSON.stringify({ at, back })}`);
  };
  await toTitle();
  await howToRound(page.getByRole("button", { name: "How to play" }), "title");
  await freshPractice();
  await howToRound(page.getByRole("button", { name: "How to play" }), "header");

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

    // #271 case 12: with the stale rejoin gone, a peek opens a connection of its own and stays quiet.
    await page.evaluate(() => window.__emberisle.getState().peekTable("ABCD"));
    await page.waitForFunction(() => { const t = window.__emberisle.getState(); return t.peeking === true && t.net !== null; }, null, { timeout: 6000 });
    const peeked = await page.evaluate(() => { const t = window.__emberisle.getState(); return { peeking: t.peeking, error: t.error, toast: t.toast, screen: t.screen }; });
    console.log("peek after a stale rejoin:", JSON.stringify(peeked));
    if (peeked.error !== null || peeked.toast !== null || peeked.screen !== "title") throw new Error(`peek not quiet: ${JSON.stringify(peeked)}`);

    // #271 case 11: a peek called while a held seat's rejoin is pending is left alone, so the rejoin lands with no toast.
    // A held seat needs a started game (a lobby seat is dropped on close), so three sockets start one and the third drops.
    const { default: WebSocket } = await import("../server/node_modules/ws/wrapper.mjs");
    const socks = [];
    const seat = (extra) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${hostPort}`);
        const inbox = [];
        const c = { ws, inbox, send: (m) => ws.send(JSON.stringify(m)) };
        ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
        ws.on("error", reject);
        ws.on("open", () => {
          c.send({ type: "hello", name: `Held${socks.length}`, ...extra });
          socks.push(c);
          const started = Date.now();
          const poll = setInterval(() => {
            const w = inbox.find((m) => m.type === "welcome");
            if (w) {
              clearInterval(poll);
              resolve({ ...c, welcome: w });
            } else if (Date.now() - started > 5000) {
              clearInterval(poll);
              reject(new Error("seat: no welcome within 5 s"));
            }
          }, 20);
        });
      });
    const pollUntil = async (check, what) => {
      for (let i = 0; i < 100; i++) {
        if (check()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`timed out: ${what}`);
    };
    try {
      // #271: a Join the host refuses ("Color taken.") must not leave a socket that blocks later peeks.
      const solo = await seat({ color: "#c45c3e" });
      await page.evaluate(([code]) => {
        const g = window.__emberisle.getState();
        g.setColor("#c45c3e");
        g.joinTable(code);
      }, [solo.welcome.code]);
      await page.waitForFunction(() => window.__emberisle.getState().error === "Color taken.", null, { timeout: 5000 });
      await page.evaluate((code) => {
        const g = window.__emberisle.getState();
        g.peekTable(code);
      }, solo.welcome.code);
      await page.waitForFunction(
        (code) => {
          const t = window.__emberisle.getState();
          return t.peeking && t.code === code && t.seats.some((x) => x.color === "#c45c3e");
        },
        solo.welcome.code,
        { timeout: 6000 },
      );
      console.log("peek after a refused Join (Color taken.): the taken color shows again");
      await page.evaluate(() => window.__emberisle.getState().goTitle());
      const first = await seat({});
      const second = await seat({ code: first.welcome.code });
      const third = await seat({ code: first.welcome.code });
      for (const c of [first, second, third]) c.send({ type: "ready", value: true });
      await new Promise((r) => setTimeout(r, 200));
      first.send({ type: "start" });
      await pollUntil(() => third.inbox.some((m) => m.type === "state"), "game start");
      third.ws.close();
      await pollUntil(() => first.inbox.some((m) => m.type === "log" && /lost connection/.test(m.text)), "seat held");
      await page.evaluate(([code, secret]) => localStorage.setItem("emberisle-seat", JSON.stringify({ code, secret })), [third.welcome.code, third.welcome.secret]);
      // The page-load rejoin, then a peek on every macrotask until it lands: one of them falls between the rejoin
      // socket opening and its welcome, which is where a peek queued on the rejoin socket would reach a seated host.
      await page.evaluate(async (code) => {
        const g = window.__emberisle;
        g.getState().rejoinTable();
        const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
        for (let i = 0; i < 20000 && g.getState().screen === "title"; i++) {
          g.getState().peekTable(code);
          await tick();
        }
      }, third.welcome.code);
      await page.waitForFunction(() => window.__emberisle.getState().screen !== "title", null, { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 500));
      const held = await page.evaluate(() => { const t = window.__emberisle.getState(); return { screen: t.screen, error: t.error, toast: t.toast, peeking: t.peeking }; });
      console.log("peek during a pending rejoin:", JSON.stringify(held));
      if (held.error !== null || held.toast !== null || held.peeking !== false || !["lobby", "play"].includes(held.screen)) throw new Error(`peek during rejoin: ${JSON.stringify(held)}`);
    } finally {
      for (const c of socks) c.ws.close();
    }
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
