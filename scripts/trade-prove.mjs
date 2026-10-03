// #163: three headless tabs on the rules host trade through the browser's trade panel and toast.
// Tab 1 asks the table through the panel; tab 3 says No (the offer stays open), tab 2 says Yes, and every tab's state
// shows the goods moved. A second ask gets a No and then runs out its 20 s: the goods stay put and the toast closes
// everywhere. Zero console errors.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8097;
const RES = ["timber", "clay", "wool", "grain", "ore"];

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
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

// What this tab knows: its own hand in full, and every hand's size (#206).
const view = (t) =>
  t.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const g = s.state;
    if (!g) return null;
    return {
      you: s.localId,
      legal: s.legal,
      seq: g.seq,
      phase: g.phase,
      current: g.current,
      bank: g.bank,
      mine: g.players.find((p) => p.id === s.localId)?.resources,
      goods: Object.fromEntries(g.players.map((p) => [p.id, p.goods ?? Object.values(p.resources).reduce((a, b) => a + b, 0)])),
      offer: s.offer,
      declined: s.declined,
      toast: document.querySelector('[data-testid="trade-toast"]')?.textContent ?? null,
    };
  });
const views = (tabs) => Promise.all(tabs.map(view));

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
}

// Every tab past `seq`, on the same seq, with the same hand sizes.
async function synced(tabs, seq, what, ms) {
  const vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && v.seq > seq) && new Set(vs.map((v) => v.seq)).size === 1 ? vs : null;
  }, what, ms);
  if (new Set(vs.map((v) => JSON.stringify(v.goods))).size !== 1) throw new Error(`${what}: tabs disagree on the hand sizes`);
  return vs;
}

const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);
const total = (hand) => RES.reduce((n, r) => n + hand[r], 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  let vs = await synced(tabs, -1, "start", 90_000);
  // Three islands under software GL starve the HUD, and the host's offer lives 20 s. The board is not under test
  // here (tabs-prove covers it), so each tab stops drawing it and the clicks below land in time.
  for (const t of tabs) await t.page.evaluate(() => window.__isle.renderer.setAnimationLoop(null));

  // #232: roll off for first place, each die from the tab whose seat is up.
  for (let n = 0; vs[0].phase === "rollOff"; n++) {
    if (n > 30) throw new Error("roll-off never ended");
    const i = vs.findIndex((v) => v.you === vs[0].current);
    await act(tabs[i], "dispatch", [{ type: "roll" }]);
    vs = await synced(tabs, vs[0].seq, `roll-off roll ${n}`);
  }

  for (let step = 0; step < 12; step++) {
    const i = vs.findIndex((v) => v.you === vs[0].current);
    if (vs[i].phase === "setupSettle") await act(tabs[i], "pickVertex", vs[i].legal.outpost[0]);
    else await act(tabs[i], "pickEdge", vs[i].legal.path[0]);
    vs = await synced(tabs, vs[0].seq, `setup step ${step}`);
  }
  console.log(`table ${tableCode}: setup done, seq ${vs[0].seq}`);

  // Roll, settle any 7, and pass until the player in `main` holds a card another tab can match.
  let pair = null;
  for (let guard = 0; guard < 60 && !pair; guard++) {
    const i = vs.findIndex((v) => v.you === vs[0].current);
    const { phase } = vs[0];
    if (phase === "roll") await act(tabs[i], "dispatch", [{ type: "roll" }]);
    else if (phase === "discard") {
      const j = vs.findIndex((v) => v.legal?.discard > 0);
      let need = vs[j].legal.discard;
      const cards = {};
      for (const r of RES) {
        const k = Math.min(vs[j].mine[r], need);
        if (k) cards[r] = k;
        need -= k;
      }
      await act(tabs[j], "dispatch", [{ type: "discard", resources: cards }]);
    } else if (phase === "robber") {
      const hexId = vs[i].legal.wayfarer.find((h) => !vs[i].legal.steal[h]) ?? vs[i].legal.wayfarer[0];
      await act(tabs[i], "pickHex", hexId);
      if ((vs[i].legal.steal[hexId] ?? []).length > 1) await act(tabs[i], "chooseSteal", vs[i].legal.steal[hexId][0]);
    } else if (phase === "main") {
      for (const give of RES.filter((r) => vs[i].mine[r] >= 1)) {
        for (const j of [0, 1, 2].filter((j) => j !== i)) {
          const want = RES.find((r) => r !== give && vs[j].mine[r] >= 1);
          if (want) pair ??= { i, j, k: [0, 1, 2].find((k) => k !== i && k !== j), give, want };
        }
      }
      if (!pair) await act(tabs[i], "dispatch", [{ type: "endTurn" }]);
    } else throw new Error(`unexpected phase ${phase}`);
    if (!pair) vs = await synced(tabs, vs[0].seq, `turn ${guard} (${phase})`);
  }
  if (!pair) throw new Error("never reached a main turn with a tradeable pair");
  const { i, j, k, give, want } = pair;
  const [A, B, C] = [tabs[i], tabs[j], tabs[k]];
  console.log(`${A.name} gives 1 ${give}, wants 1 ${want}; ${C.name} says no, ${B.name} says yes`);

  // 1. The panel: one Trade button, steppers, Ask the table. Offline there is no table to ask, so the button is online-only.
  const ask = async (g, w) => {
    await A.page.getByRole("button", { name: "Trade", exact: true }).click();
    await A.page.getByTestId("trade-panel").waitFor();
    await A.page.getByRole("button", { name: `More ${g} to give` }).click();
    await A.page.getByRole("button", { name: `More ${w} to want` }).click();
    await A.page.getByRole("button", { name: "Ask the table" }).click();
    return until(async () => {
      const vs = await views(tabs);
      return vs.every((v) => v.offer && v.toast) ? vs : null;
    }, "the offer reaches every tab");
  };
  vs = await ask(give, want);
  if (await A.page.getByTestId("trade-panel").isVisible()) throw new Error("the panel stayed open after the ask");
  const line = `${A.name} offers 1 ${give} for 1 ${want}`;
  for (const t of [B, C]) {
    const v = vs[tabs.indexOf(t)];
    if (!v.toast.includes(line)) throw new Error(`${t.name} toast: "${v.toast}"`);
    const secs = Number(v.toast.match(/(\d+) s/)?.[1] ?? -1);
    if (secs < 1 || secs > 20) throw new Error(`${t.name} toast has no countdown: "${v.toast}"`);
  }
  if (!vs[i].toast.includes(`You offer 1 ${give} for 1 ${want}`) || !vs[i].toast.includes("Waiting")) throw new Error(`asker toast: "${vs[i].toast}"`);
  const tradeId = vs[0].offer.tradeId;
  console.log(`toast on ${B.name} and ${C.name}: "${line}"; asker sees "Waiting…"`);

  // Yes is disabled, with the reason, when the goods are not in hand.
  for (const t of [B, C]) {
    const v = vs[tabs.indexOf(t)];
    const yes = t.page.getByRole("button", { name: "Yes", exact: true });
    const canPay = v.mine[want] >= 1;
    if ((await yes.isEnabled()) !== canPay) throw new Error(`${t.name}: Yes enabled=${!canPay} but can pay=${canPay}`);
    if (!canPay && !v.toast.includes(`Need 1 more ${want}`)) throw new Error(`${t.name}: no reason on the disabled Yes: "${v.toast}"`);
  }

  // 2. C says No: everyone sees it, C's toast goes, the offer stays open for B.
  const before = vs;
  await C.page.getByRole("button", { name: "No", exact: true }).click();
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v.declined.includes(before[k].you)) ? vs : null;
  }, "the decline reaches every tab");
  if (vs[k].toast !== null) throw new Error(`${C.name} still has a toast after No: "${vs[k].toast}"`);
  if (!vs[i].toast.includes(`${C.name} declined`)) throw new Error(`asker toast after No: "${vs[i].toast}"`);
  if (!vs[j].toast || vs.some((v) => !v.offer || v.offer.tradeId !== tradeId)) throw new Error("the offer closed on a single No");
  console.log(`${C.name} declined: asker sees "${C.name} declined", offer still open for ${B.name}`);

  // 3. B says Yes: the goods move in every tab's next state.
  await B.page.getByRole("button", { name: "Yes", exact: true }).click();
  vs = await synced(tabs, before[0].seq, "the trade lands");
  await until(async () => (await views(tabs)).every((v) => !v.offer) || null, "offers cleared");
  const [a0, b0, a1, b1] = [before[i].mine, before[j].mine, vs[i].mine, vs[j].mine];
  if (a1[give] !== a0[give] - 1 || a1[want] !== a0[want] + 1) throw new Error(`asker hand ${JSON.stringify([a0, a1])}`);
  if (b1[give] !== b0[give] + 1 || b1[want] !== b0[want] - 1) throw new Error(`taker hand ${JSON.stringify([b0, b1])}`);
  if (!same(vs[k].mine, before[k].mine)) throw new Error("the bystander's hand changed");
  if (!same(vs[0].bank, before[0].bank)) throw new Error("the bank changed on a table trade");
  for (const v of vs) {
    if (v.goods[vs[i].you] !== total(a1) || v.goods[vs[j].you] !== total(b1)) throw new Error(`${tabs[vs.indexOf(v)].name} goods counts ${JSON.stringify(v.goods)}`);
  }
  if (!vs[i].toast?.includes(`${B.name} takes it.`)) throw new Error(`asker outcome: "${vs[i].toast}"`);
  await until(async () => (await views(tabs)).every((v) => v.toast === null) || null, "toasts gone after the yes");
  console.log(`${B.name} took it: 1 ${give} -> ${B.name}, 1 ${want} -> ${A.name}, hands and goods counts agree on all 3 tabs`);

  // 4. Ask again, the other way round (the asker now holds the card it got); C says No; nobody else answers, so the
  // host's 20 s run out. Nothing moves, every toast closes.
  if (vs[0].phase !== "main" || vs[0].current !== vs[i].you) throw new Error("the asker lost the turn");
  const again = await ask(want, give);
  const tradeId2 = again[0].offer.tradeId;
  if (tradeId2 === tradeId) throw new Error("second ask reused the tradeId");
  await C.page.getByRole("button", { name: "No", exact: true }).click();
  await until(async () => (await views(tabs)).every((v) => v.declined.includes(again[k].you)) || null, "second decline");
  const left = Number((await A.page.getByTestId("trade-countdown").textContent()).replace(/\D/g, ""));
  if (left < 15 || left > 20) throw new Error(`countdown reads ${left} s right after the ask`);
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => !v.offer && v.toast === null) ? vs : null;
  }, "the offer times out and every toast closes", 30_000);
  if (vs[0].seq !== again[0].seq) throw new Error("the timeout changed the game");
  for (const n of [0, 1, 2]) if (!same(vs[n].mine, again[n].mine)) throw new Error(`${tabs[n].name}'s hand changed on a timeout`);
  console.log(`second offer ran out after ${left} s left on the clock: hands unchanged, toast closed on all 3 tabs`);

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("trade prove ok");
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
