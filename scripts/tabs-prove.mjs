// #80: three headless tabs host, join, ready, start, play setup and five rolls through server/host.mjs.
// Every step must land the same dice and board on all three tabs, with zero console errors.
// #116: `--served` skips Vite. The host serves the built dist/ itself and the tabs open it with no ?host=,
// so they must find the socket at the address the page came from (the tunnel case). Run npm run build first.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8093;
const ROLLS = 5;
const SERVED = process.argv.includes("--served");
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
if (SERVED && !existsSync(`${DIST}index.html`)) {
  console.log("FAIL no dist/index.html: run npm run build first");
  process.exit(1);
}

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", DIST, ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = SERVED
  ? null
  : await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite?.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const errors = [];
let code = 0;

// The tab whose failed dials are expected right now (it is offline on purpose), or null.
let offlineTab = null;

async function tab(name) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  // A socket that fails while this tab is offline on purpose logs a console error (#196); everything else counts.
  page.on("console", (m) => m.type() === "error" && !(offlineTab === name && /WebSocket connection to .* failed/.test(m.text())) && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  // #248: the page records every resource-flash label the moment it enters or leaves the DOM. Under software
  // GL on a loaded machine one island frame can take longer than the 1.2 s label, so a poll from outside the
  // page only gets to run between frames and can arrive after the label is gone. The observer cannot miss it.
  await page.addInitScript(() => {
    const log = (window.__flashes = []);
    const labels = (n) =>
      n.nodeType === 1 ? [n, ...n.querySelectorAll('[data-testid="resource-flash"]')].filter((e) => e.dataset.testid === "resource-flash") : [];
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) for (const e of labels(n)) log.push({ sign: "+", tag: `${e.dataset.resource}${e.dataset.delta}`, at: performance.now() });
        for (const n of m.removedNodes) for (const e of labels(n)) log.push({ sign: "-", tag: `${e.dataset.resource}${e.dataset.delta}`, at: performance.now() });
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(SERVED ? `http://127.0.0.1:${hostPort}/` : `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
  return { name, page };
}

// The shared part of a tab's state: everything the host sends to every seat alike.
const view = (t) =>
  t.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const g = s.state;
    if (!g) return null;
    return {
      you: s.localId,
      legal: s.legal,
      mine: g.players.find((p) => p.id === s.localId)?.resources,
      shared: JSON.stringify({
        seq: g.seq,
        phase: g.phase,
        current: g.current,
        dice: g.dice,
        robberHex: g.robberHex,
        hexes: g.hexes,
        vertices: g.vertices,
        edges: g.edges,
        bank: g.bank,
        // Other players' hands arrive as a count only (#186), so the shared part is each hand's size.
        players: g.players.map((p) => ({
          id: p.id,
          goods: p.goods ?? Object.values(p.resources).reduce((a, b) => a + b, 0),
          vp: p.vp,
        })),
      }),
    };
  });

const views = (tabs) => Promise.all(tabs.map(view));
const seqOf = (v) => JSON.parse(v.shared).seq;

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
}

// Wait for every tab to pass `seq`, then require the three shared views to be identical.
async function synced(tabs, seq, what, ms) {
  const vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && seqOf(v) > seq) && new Set(vs.map(seqOf)).size === 1 ? vs : null;
  }, what, ms);
  if (new Set(vs.map((v) => v.shared)).size !== 1) throw new Error(`${what}: tabs disagree on the board`);
  return vs;
}

const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);

try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;

  // #142: picking a color on the Title screen must reach the actual seat and game state.
  await a.page.getByRole("radio", { name: "Tide" }).click();
  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    if (t === b) {
      // #156/#271: before Join, the color the table already holds is dimmed and cannot be picked.
      const swatch = (n) => b.page.getByRole("radio", { name: n });
      await until(async () => {
        const tide = swatch("Tide (taken)");
        if (!(await tide.count()) || !(await tide.isDisabled())) return null;
        const [opacity, checked] = await tide.evaluate((el) => [getComputedStyle(el).opacity, el.getAttribute("aria-checked")]);
        return opacity === "0.35" && checked === "false" ? true : null;
      }, "Tide swatch dims before Join");
      for (const n of ["Ember", "Dune", "Pine"]) if (await swatch(n).isDisabled()) throw new Error(`${n} swatch is disabled`);
      console.log("tab B typed the code: Tide swatch disabled at opacity 0.35, aria-checked=false; Ember, Dune, Pine enabled");
    }
    await t.page.getByRole("button", { name: "Join" }).click();
    await t.page.getByTestId("table-code").waitFor();
  }
  for (const t of tabs) {
    await until(async () => (await t.page.locator("li", { hasText: "Pine" }).count()) === 1, `${t.name} sees 3 seats`);
    await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  await a.page.getByRole("button", { name: "Start" }).click();
  let vs = await synced(tabs, -1, "start");
  console.log(`table ${tableCode}: 3 tabs in, phase ${JSON.parse(vs[0].shared).phase}`);

  const hostColor = await a.page.evaluate(() => {
    const s = window.__emberisle.getState();
    return s.state.players.find((p) => p.id === s.localId)?.color;
  });
  if (hostColor !== "#2a8f8a") throw new Error(`host picked Tide's color but the seat shows ${hostColor}`);
  console.log(`host's chosen color round-tripped into the game: ${hostColor}`);

  // Setup: whoever's turn it is clicks the first glowing spot through the store.
  for (let step = 0; step < 12; step++) {
    const cur = JSON.parse(vs[0].shared).current;
    const i = vs.findIndex((v) => v.you === cur);
    const phase = JSON.parse(vs[i].shared).phase;
    if (phase === "setupSettle") await act(tabs[i], "pickVertex", vs[i].legal.outpost[0]);
    else await act(tabs[i], "pickEdge", vs[i].legal.path[0]);
    vs = await synced(tabs, seqOf(vs[0]), `setup step ${step}`);
  }
  if (JSON.parse(vs[0].shared).phase !== "roll") throw new Error(`after setup: ${JSON.parse(vs[0].shared).phase}`);

  // #196: tab B loses its connection and its network for 3 s. It dials again with its seat secret and
  // lands back in the same seat; the table (grace 90 s on the host) has not moved. Chromium keeps an
  // open socket alive under setOffline, so the drop itself comes from the client's drop() hook.
  const me = (t) => t.page.evaluate(() => ({ you: window.__emberisle.getState().localId, screen: window.__emberisle.getState().screen, error: window.__emberisle.getState().error, seq: window.__emberisle.getState().state?.seq ?? -1 }));
  const beforeB = await me(b);
  // #283: the board stays on screen through the rejoin; the lobby never shows and the HUD is not remounted.
  await b.page.evaluate(() => {
    window.__screens = [];
    window.__emberisle.subscribe((s) => window.__screens.push(s.screen));
  });
  const bannerB = await b.page.getByTestId("turn-banner").elementHandle();
  offlineTab = "Tide";
  await b.page.context().setOffline(true);
  await b.page.evaluate(() => window.__emberisle.getState().net.drop());
  const sawReconnecting = await until(async () => ((await me(b)).error?.startsWith("Reconnecting") ? true : null), "tab B notices the drop", 20_000);
  await new Promise((r) => setTimeout(r, 3000));
  await b.page.context().setOffline(false);
  const afterB = await until(async () => {
    const m = await me(b);
    return m.screen === "play" && !m.error && m.you === beforeB.you ? m : null;
  }, "tab B back in its seat", 90_000);
  await new Promise((r) => setTimeout(r, 1000)); // a dial already in flight when the network came back
  offlineTab = null;
  const screensB = await b.page.evaluate(() => window.__screens);
  if (screensB.includes("lobby")) throw new Error(`tab B flashed the lobby during the rejoin: ${screensB.join(",")}`);
  if (!(await bannerB.evaluate((el) => el.isConnected))) throw new Error("tab B's HUD remounted during the rejoin (turn banner detached)");
  console.log(`tab B screens during the rejoin: ${[...new Set(screensB)].join(",")}, turn banner still attached`);
  const back = await until(async () => ((await a.page.evaluate(() => window.__emberisle.getState().lobbyLog)) === "Tide is back." ? true : null), "host says Tide is back", 10_000);
  console.log(`tab B dropped 3 s: saw reconnecting=${sawReconnecting}, back as ${afterB.you} (was ${beforeB.you}), host log on A: Tide is back=${back}`);

  // #196: tab C reloads the page and rejoins from localStorage with the same seat.
  const beforeC = await me(c);
  await c.page.reload();
  const afterC = await until(async () => {
    const m = await me(c);
    return m.screen === "play" && !m.error && m.you === beforeC.you ? m : null;
  }, "tab C back after reload", 90_000); // the reloaded page may block on its cold render first (see the first roll below)
  console.log(`tab C reloaded: back as ${afterC.you} (was ${beforeC.you})`);
  vs = await synced(tabs, -1, "after the drop and the reload");
  if (JSON.parse(vs[0].shared).phase !== "roll") throw new Error(`table moved during the blip: ${JSON.parse(vs[0].shared).phase}`);
  console.log(`setup done on all tabs, seq ${seqOf(vs[0])}`);

  // Five rolls. Each roll is followed by any discards, the wayfarer, and a pass.
  const dice = [];
  for (let r = 0; r < ROLLS; r++) {
    const cur = JSON.parse(vs[0].shared).current;
    const i = vs.findIndex((v) => v.you === cur);
    // #188: every tab shows the same roll banner (dice, sum, who got what) for a moment. The proof rolls
    // faster than a banner fades, so each tab's banner is cleared first and only a fresh one counts.
    for (const t of tabs) await t.page.evaluate(() => window.__emberisle.setState({ banner: null }));
    await act(tabs[i], "dispatch", [{ type: "roll" }]);
    // The first roll follows the reconnect cases, and a reloaded tab can still be finishing its cold
    // island render under software GL, so that one gets a longer window (#196).
    const slow = r === 0 ? 90_000 : undefined;
    // Each tab is read on its own: a tab whose page is blocked answers late, after the others' 2.5 s
    // banners are gone, so one poll across all three would never see them together.
    const texts = await Promise.all(
      tabs.map((t) => until(() => t.page.evaluate(() => document.querySelector('[data-testid="banner"]')?.textContent ?? null), `banner on ${t.name} after roll ${r + 1}`, slow)),
    );
    if (new Set(texts).size !== 1) throw new Error(`banner differs after roll ${r + 1}: ${texts.join(" | ")}`);
    const banner = texts[0];
    vs = await synced(tabs, seqOf(vs[0]), `roll ${r + 1}`, slow);
    const d = JSON.parse(vs[0].shared).dice;
    dice.push(d);
    if (!banner.includes(`rolls ${d[0]}+${d[1]} = ${d[0] + d[1]}`)) throw new Error(`banner after roll ${r + 1}: "${banner}" vs dice ${d}`);
    if (r === 0) console.log(`roll banner on all tabs: "${banner}"`);

    for (let guard = 0; guard < 10; guard++) {
      const phase = JSON.parse(vs[0].shared).phase;
      if (phase === "roll") break;
      if (phase === "discard") {
        const j = vs.findIndex((v) => v.legal?.discard > 0);
        let need = vs[j].legal.discard;
        const cards = {};
        for (const [res, n] of Object.entries(vs[j].mine)) {
          const k = Math.min(n, need);
          if (k) cards[res] = k;
          need -= k;
        }
        await act(tabs[j], "dispatch", [{ type: "discard", resources: cards }]);
      } else if (phase === "robber") {
        const hexId = vs[i].legal.wayfarer[0];
        await act(tabs[i], "pickHex", hexId);
        const targets = vs[i].legal.steal[hexId];
        if (targets && targets.length > 1) await act(tabs[i], "chooseSteal", targets[0]);
      }
      else if (phase === "main") await act(tabs[i], "dispatch", [{ type: "endTurn" }]);
      else throw new Error(`unexpected phase ${phase}`);
      vs = await synced(tabs, seqOf(vs[0]), `after roll ${r + 1} (${phase})`);
    }
  }
  console.log(`${ROLLS} rolls, same on all 3 tabs: ${dice.map((d) => d.join("+")).join(" ")}`);

  // #170: a tab's own hand flashes +N green on a gain and -N red on a loss, and each flash goes away again.
  // Keep playing until a roll has paid someone and a bank trade, a discard, or a steal has taken something.
  // Every count that moves on a tab between two synced states must have flashed with its sign. The label is
  // read from the page's own record (see tab()), from the act on, so it is caught however long a frame takes.
  const flashesSince = (t, mark) => t.page.evaluate((m) => window.__flashes.slice(m), mark);
  let longest = 0;
  const step = async (what, go) => {
    const before = vs;
    const marks = await Promise.all(tabs.map((t) => t.page.evaluate(() => window.__flashes.length)));
    await go();
    vs = await synced(tabs, seqOf(before[0]), what);
    const seen = [];
    for (const [k, t] of tabs.entries()) {
      const diff = (r) => vs[k].mine[r] - before[k].mine[r];
      const tags = Object.keys(vs[k].mine).filter((r) => diff(r)).map((r) => `${r}${diff(r) > 0 ? "+" : ""}${diff(r)}`);
      if (!tags.length) continue;
      // The label and the new count land in the same commit, so by now the record has it.
      const shown = await flashesSince(t, marks[k]);
      const missing = tags.filter((tag) => !shown.some((f) => f.sign === "+" && f.tag === tag));
      if (missing.length) throw new Error(`${what}: ${t.name} never flashed ${missing.join(" ")} (saw ${shown.map((f) => f.sign + f.tag).join(" ") || "nothing"})`);
      // It is removed by a 1.2 s timer, which waits for the frames in progress; software-GL frames on a loaded
      // machine have kept a label up for 8 s.
      const gone = await until(async () => {
        const log = await flashesSince(t, marks[k]);
        return tags.every((tag) => log.some((f) => f.sign === "-" && f.tag === tag)) ? log : null;
      }, `${t.name}'s flash fades (${what})`, 20_000);
      for (const tag of tags) {
        const on = gone.find((f) => f.sign === "+" && f.tag === tag).at;
        const off = gone.find((f) => f.sign === "-" && f.tag === tag).at;
        longest = Math.max(longest, off - on);
      }
      seen.push(...tags.map((tag) => `${t.name} ${tag}`));
    }
    return seen;
  };
  const proved = { gain: null, loss: null };
  for (let turn = 0; turn < 40 && !(proved.gain && proved.loss); turn++) {
    const cur = JSON.parse(vs[0].shared).current;
    const i = vs.findIndex((v) => v.you === cur);
    const seen = [await step(`flash roll ${turn + 1}`, () => act(tabs[i], "dispatch", [{ type: "roll" }]))];
    for (let guard = 0; guard < 10; guard++) {
      const phase = JSON.parse(vs[0].shared).phase;
      if (phase === "roll") break;
      let go;
      if (phase === "discard") {
        const j = vs.findIndex((v) => v.legal?.discard > 0);
        let need = vs[j].legal.discard;
        const cards = {};
        for (const [res, n] of Object.entries(vs[j].mine)) {
          const k = Math.min(n, need);
          if (k) cards[res] = k;
          need -= k;
        }
        go = () => act(tabs[j], "dispatch", [{ type: "discard", resources: cards }]);
      } else if (phase === "robber") {
        const hexId = vs[i].legal.wayfarer[0];
        const targets = vs[i].legal.steal[hexId];
        go = async () => {
          await act(tabs[i], "pickHex", hexId);
          if (targets && targets.length > 1) await act(tabs[i], "chooseSteal", targets[0]);
        };
      } else if (phase === "main") {
        const give = Object.keys(vs[i].mine).find((r) => vs[i].mine[r] >= 4);
        if (give) {
          const want = Object.keys(vs[i].mine).find((r) => r !== give);
          seen.push(await step(`flash bank trade ${give} for ${want}`, () => act(tabs[i], "dispatch", [{ type: "bankTrade", give, want }])));
        }
        go = () => act(tabs[i], "dispatch", [{ type: "endTurn" }]);
      } else throw new Error(`unexpected phase ${phase}`);
      seen.push(await step(`flash after roll ${turn + 1} (${phase})`, go));
    }
    for (const tag of seen.flat()) {
      if (tag.includes("+")) proved.gain ??= tag;
      else proved.loss ??= tag;
    }
  }
  if (!proved.gain || !proved.loss) throw new Error(`resource flash: gain ${proved.gain}, loss ${proved.loss}`);
  console.log(`resource flash: green "${proved.gain}" and red "${proved.loss}" each showed and went away (longest label ${Math.round(longest)} ms)`);
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log(SERVED ? `tabs prove ok (served by the host on :${hostPort}, no ?host=)` : "tabs prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite?.close();
  host.kill();
}
process.exit(code);
