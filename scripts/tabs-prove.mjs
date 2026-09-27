// #80: three headless tabs host, join, ready, start, play setup and five rolls through server/host.mjs.
// Every step must land the same dice and board on all three tabs, with zero console errors.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8093;
const ROLLS = 5;

const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0" },
});
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const errors = [];
let code = 0;

async function tab(name) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
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
        players: g.players.map((p) => ({ id: p.id, resources: p.resources, vp: p.vp })),
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
async function synced(tabs, seq, what) {
  const vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && seqOf(v) > seq) && new Set(vs.map(seqOf)).size === 1 ? vs : null;
  }, what);
  if (new Set(vs.map((v) => v.shared)).size !== 1) throw new Error(`${what}: tabs disagree on the board`);
  return vs;
}

const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);

try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;

  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
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
  console.log(`setup done on all tabs, seq ${seqOf(vs[0])}`);

  // Five rolls. Each roll is followed by any discards, the wayfarer, and a pass.
  const dice = [];
  for (let r = 0; r < ROLLS; r++) {
    const cur = JSON.parse(vs[0].shared).current;
    const i = vs.findIndex((v) => v.you === cur);
    await act(tabs[i], "dispatch", [{ type: "roll" }]);
    vs = await synced(tabs, seqOf(vs[0]), `roll ${r + 1}`);
    dice.push(JSON.parse(vs[0].shared).dice);

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
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("tabs prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
process.exit(code);
